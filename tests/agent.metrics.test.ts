import { spawn } from 'node:child_process';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { agent, mcp } from '../dist/volcano-agent-sdk.js';

function waitForOutput(proc: any, match: RegExp, timeoutMs = 10000) {
  return new Promise<void>((resolve, reject) => {
    const onData = (data: Buffer) => { if (match.test(data.toString())) { cleanup(); resolve(); } };
    const onErr = (data: Buffer) => { if (match.test(data.toString())) { cleanup(); resolve(); } };
    const cleanup = () => { proc.stdout?.off('data', onData); proc.stderr?.off('data', onErr); clearTimeout(timer); };
    proc.stdout?.on('data', onData); proc.stderr?.on('data', onErr);
    const timer = setTimeout(() => { cleanup(); reject(new Error('Timeout waiting for server output')); }, timeoutMs);
  });
}

function startServer(cmd: string, args: string[], env: Record<string, string | undefined> = {}) {
  const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  return proc;
}

describe('latency metrics', () => {
  it('captures llmMs and durationMs for LLM-only step', async () => {
    const delays: number[] = [];
    const llm: any = {
      id: 'OpenAI-mock', model: 'mock', client: {},
      gen: async () => { const t = 30; delays.push(t); await new Promise(r => setTimeout(r, t)); return 'OK'; },
      genWithTools: async () => ({ content: '', toolCalls: [] }), genStream: async function*(){}
    };

    const res = await agent({ llm, hideProgress: true })
      .then({ prompt: 'hello' })
      .run();

    expect(typeof res[0].llmMs).toBe('number');
    expect(res[0].llmMs!).toBeGreaterThanOrEqual(25);
    expect(res[0].durationMs!).toBeGreaterThanOrEqual(res[0].llmMs!);
    // aggregated fields on final step
    expect(res[0].totalDurationMs).toBeGreaterThan(0);
    expect(res[0].totalLlmMs).toBeGreaterThan(0);
    expect(res[0].totalMcpMs).toBeGreaterThanOrEqual(0);
  });

  describe('with mock MCP server', () => {
    let astroProc: any;
    const PORT = '3291';

    beforeAll(async () => {
      astroProc = startServer('node', ['mcp/astro/server.mjs'], { PORT });
      await waitForOutput(astroProc, new RegExp(`astro-mcp\\] listening on :${PORT}`));
    }, 20000);

    afterAll(async () => { astroProc?.kill(); });

    it('captures mcp.ms for explicit tool call', async () => {
      const astro = mcp(`http://localhost:${PORT}/mcp`);
      const llm: any = { id: 'OpenAI-mock', model: 'mock', client: {}, gen: async () => 'OK', genWithTools: async () => ({ content: '', toolCalls: [] }), genStream: async function*(){} };
      const out = await agent({ llm, hideProgress: true })
        .then({ mcp: astro, tool: 'get_sign', args: { birthdate: '1993-07-11' } })
        .run();
      const step = out[0];
      expect(step.mcp?.ms).toBeGreaterThan(0);
      expect(step.durationMs).toBeGreaterThan(0);
    }, 20000);

    it('captures toolCalls[i].ms for automatic tool selection', async () => {
      const astro = mcp(`http://localhost:${PORT}/mcp`);
      const llm: any = {
        id: 'OpenAI-mock', model: 'mock', client: {},
        gen: async () => 'OK',
        genWithTools: async (_p: string, tools: any[]) => {
          const found = tools.find(t => t.name.endsWith('.get_sign'));
          return { content: '', toolCalls: [{ name: found.name, arguments: { birthdate: '1993-07-11' }, mcpHandle: astro }] };
        },
        genStream: async function*(){}
      };
      const out = await agent({ llm, hideProgress: true })
        .then({ prompt: 'auto', mcps: [astro] })
        .run();
      const step = out[0];
      expect(step.toolCalls && step.toolCalls.length).toBeGreaterThan(0);
      expect(step.toolCalls![0].ms).toBeGreaterThan(0);
      expect(step.durationMs).toBeGreaterThan(0);
    }, 20000);
  });
});
