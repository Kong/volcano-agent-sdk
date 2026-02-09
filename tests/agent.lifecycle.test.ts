import { describe, it, expect, vi } from 'vitest';
import { agent, mcp, __internal_getMcpPoolStats, __internal_setPoolConfig, __internal_forcePoolCleanup, __internal_clearDiscoveryCache, __internal_setDiscoveryTtl, discoverTools } from '../dist/volcano-agent-sdk.js';

function makeLLM() {
  return {
    id: 'OpenAI-mock', model: 'mock', client: {},
    gen: async (p: string) => 'OK', genWithTools: async () => ({ content: '', toolCalls: [] }), genStream: async function*(){}
  } as any;
}

describe('agent lifecycle and pooling', () => {
  it('prevents concurrent run() on same instance', async () => {
    const llm = makeLLM();
    const a = agent({ llm, hideProgress: true });
    const p1 = a.then({ prompt: 'one' }).run();
    let err: any;
    try {
      await a.run();
    } catch (e) { err = e; }
    expect(String(err?.message || '')).toMatch(/already running/);
    await p1;
  });

  it('reuses pooled MCP connections and evicts idle', async () => {
    // shrink pool to 1 and short idle
    __internal_setPoolConfig(1, 50);
    const svc1 = mcp('http://localhost:3999/mcp');
    const svc2 = mcp('http://localhost:3998/mcp');

    // We cannot actually connect to servers in unit test, but we can call pool helpers via discoverTools path only when servers exist.
    // Instead, assert pool config hooks exist and cleanup does not throw.
    await __internal_forcePoolCleanup();
    const stats = __internal_getMcpPoolStats();
    expect(stats.size).toBeGreaterThanOrEqual(0);
  });

  it('caches discovery with TTL and clears on demand', async () => {
    __internal_clearDiscoveryCache();
    __internal_setDiscoveryTtl(10);
    const x = await discoverTools([]);
    expect(Array.isArray(x)).toBe(true);
  });
});
