import { spawn } from 'node:child_process';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { agent, mcp } from '../dist/volcano-agent-sdk.js';

function waitForOutput(proc: any, match: RegExp, timeoutMs = 10000) {
  return new Promise<void>((resolve, reject) => {
    const onData = (d: Buffer) => { if (match.test(d.toString())) { cleanup(); resolve(); } };
    const onErr = (d: Buffer) => { if (match.test(d.toString())) { cleanup(); resolve(); } };
    const cleanup = () => { proc.stdout?.off('data', onData); proc.stderr?.off('data', onErr); clearTimeout(timer); };
    proc.stdout?.on('data', onData); proc.stderr?.on('data', onErr);
    const timer = setTimeout(() => { cleanup(); reject(new Error('Timeout waiting for server output')); }, timeoutMs);
  });
}

function startServer(cmd: string, args: string[], env: Record<string, string | undefined> = {}) {
  const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  return proc;
}

describe('aggregated latency metrics', () => {
  let astroProc: any;
  const PORT = '3292';

  beforeAll(async () => {
    astroProc = startServer('node', ['mcp/astro/server.mjs'], { PORT });
    await waitForOutput(astroProc, new RegExp(`astro-mcp\\] listening on :${PORT}`));
  }, 20000);

  afterAll(async () => { astroProc?.kill(); });

  it('reports totalLlmMs, totalMcpMs, totalDurationMs with exclusive components', async () => {
    const astro = mcp(`http://localhost:${PORT}/mcp`);
    const llm: any = {
      id: 'OpenAI-mock', model: 'mock', client: {},
      gen: async (_: string) => { const t = llm.calls++ === 0 ? 50 : 10; await new Promise(r => setTimeout(r, t)); return 'OK'; },
      genWithTools: async () => ({ content: '', toolCalls: [] }), genStream: async function*(){}
    };
    llm.calls = 0;

    const out = await agent({ llm, hideProgress: true })
      .then({ prompt: 'first-llm' })
      .then({ mcp: astro, tool: 'get_sign', args: { birthdate: '1993-07-11' } })
      .then({ prompt: 'second-llm' })
      .then({ mcp: astro, tool: 'get_sign', args: { birthdate: '1993-07-11' } })
      .run();

    const last = out[out.length - 1];
    expect(last.totalLlmMs).toBeGreaterThanOrEqual(50);
    const mcpSum = out.reduce((acc, s) => acc + (s.mcp?.ms || 0), 0);
    expect(last.totalMcpMs).toBeGreaterThan(0);
    expect(Math.abs((last.totalMcpMs || 0) - mcpSum)).toBeLessThan(5_000); // within reasonable bound
    expect(last.totalDurationMs).toBeGreaterThanOrEqual((last.totalLlmMs || 0) + (last.totalMcpMs || 0));
  }, 30000);
});
