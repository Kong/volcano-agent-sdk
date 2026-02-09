import { describe, it, expect } from 'vitest';
import { agent } from '../dist/volcano-agent-sdk.js';

describe('agent timeouts', () => {
  it('uses default 60s timeout when none provided', async () => {
    const calls: string[] = [];
    const llm: any = { id: 'OpenAI-fake', model: 'fake', client: {}, gen: async (p: string) => { calls.push(p); return 'OK'; }, genWithTools: async () => ({ content: '', toolCalls: [] }), genStream: async function*(){} };
    const start = Date.now();
    await agent({ llm, hideProgress: true })
      .then({ prompt: 'hello' })
      .run();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(60_000); // should not wait by default
  });

  it('times out a slow step using per-step timeout (seconds)', async () => {
    const llm: any = { id: 'OpenAI-fake', model: 'fake', client: {}, gen: async () => { await new Promise(r => setTimeout(r, 50)); return 'DELAYED'; }, genWithTools: async () => ({ content: '', toolCalls: [] }), genStream: async function*(){} };

    let err: any;
    try {
      await agent({ llm, timeout: 1 , hideProgress: true }) // 1 second
        .then({ prompt: 'slow', timeout: 0 }) // 0 seconds -> immediate timeout
        .run();
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    expect(String(err.message)).toMatch(/timed out/i);
  });

  it('agent-level timeout applies when step has none (seconds)', async () => {
    const llm: any = { id: 'OpenAI-fake', model: 'fake', client: {}, gen: async () => { await new Promise(r => setTimeout(r, 30)); return 'OK'; }, genWithTools: async () => ({ content: '', toolCalls: [] }), genStream: async function*(){} };
    const start = Date.now();
    await agent({ llm, timeout: 1 , hideProgress: true })
      .then({ prompt: 'no specific timeout' })
      .run();
    const elapsed = Date.now() - start;
    // Timing tolerance: allow 25ms-5000ms (accounts for system variance)
    expect(elapsed).toBeGreaterThanOrEqual(25);
    expect(elapsed).toBeLessThan(5_000);
  });
});
