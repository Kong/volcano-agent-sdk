import { describe, it, expect } from 'vitest';
import { agent, mcp, __internal_primeDiscoveryCache } from '../dist/volcano-agent-sdk.js';

function makeLLM() {
  return {
    id: 'OpenAI-mock', model: 'mock', client: {},
    gen: async (p: string) => 'OK', genWithTools: async () => ({ content: '', toolCalls: [] }), genStream: async function*(){}
  } as any;
}

describe('tool argument validation', () => {
  it('validates explicit MCP tool args against schema', async () => {
    const llm = makeLLM();
    const svc = mcp('http://localhost:3997/mcp');
    __internal_primeDiscoveryCache(svc, [
      { name: 'do_thing', inputSchema: { type: 'object', properties: { x: { type: 'number' } }, required: ['x'], additionalProperties: false } }
    ]);
    let err: any;
    try {
      await agent({ llm, hideProgress: true })
        .then({ mcp: svc, tool: 'do_thing', args: { x: 'not-a-number' } as any })
        .run();
    } catch (e) { err = e; }
    expect(String(err?.message || '')).toMatch(/failed schema validation/);
  });

  it('validates automatic tool calls against schema (simulated)', async () => {
    const svc = mcp('http://localhost:3996/mcp');
    __internal_primeDiscoveryCache(svc, [
      { name: 'do_thing', inputSchema: { type: 'object', properties: { x: { type: 'number' } }, required: ['x'], additionalProperties: false } }
    ]);
    const llm = {
      id: 'OpenAI-mock', model: 'mock', client: {},
      gen: async () => 'OK',
      genWithTools: async (_p: string, tools: any[]) => {
        const dotted = `${svc.id}.do_thing`;
        const found = tools.find(t => t.name === dotted);
        return { content: '', toolCalls: [{ name: found.name, arguments: { x: 'NaN' }, mcpHandle: svc }] };
      },
      genStream: async function*(){}
    } as any;
    let err: any;
    try {
      await agent({ llm, hideProgress: true })
        .then({ prompt: 'auto', mcps: [svc] })
        .run();
    } catch (e) { err = e; }
    expect(String(err?.message || '')).toMatch(/failed schema validation/);
  });
});
