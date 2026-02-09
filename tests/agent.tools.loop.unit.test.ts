import { spawn } from 'node:child_process';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { agent, mcp } from '../dist/volcano-agent-sdk.js';

function waitForOutput(proc: any, match: RegExp, timeoutMs = 15000) {
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

describe('agent iterative tool loop (unit - mocked LLM)', () => {
  let astroProc: any;
  const PORT = '3297';

  beforeAll(async () => {
    astroProc = startServer('node', ['mcp/astro/server.mjs'], { PORT });
    await waitForOutput(astroProc, new RegExp(`astro-mcp\\] listening on :${PORT}`));
  }, 20000);

  afterAll(async () => { astroProc?.kill(); });
  it('invokes genWithTools and feeds tool results back into next iteration', async () => {
    const calls: any[] = [];
    const fakeLlm = {
      id: 'Fake-LLM',
      model: 'fake',
      client: {},
      async gen() { return 'done'; },
      async *genStream() { /* noop */ },
      async genWithTools(prompt: string, tools: any[]) {
        calls.push({ prompt, tools });
        if (calls.length === 1) {
          return {
            content: undefined,
            toolCalls: [{ name: 'host_80_mcp.get_sign', arguments: { birthdate: '1993-07-11' } }]
          };
        }
        return { content: 'final', toolCalls: [] };
      },
    } as any;

    // mock MCP handle and stub withMCP by calling the tool directly via discovery schema
    const astro = mcp(`http://localhost:${PORT}/mcp`);

    const out = await agent({ llm: fakeLlm , hideProgress: true })
      .then({ prompt: 'Find sign', mcps: [astro] })
      .run();

    expect(out.length).toBe(1);
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const firstPrompt = calls[0].prompt as string;
    expect(firstPrompt).toContain('Find sign');
  });
});


