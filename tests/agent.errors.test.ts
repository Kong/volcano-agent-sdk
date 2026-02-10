import { describe, it, expect } from 'vitest';
import { agent, mcp, ValidationError, AgentConcurrencyError, TimeoutError, RetryExhaustedError, LLMError, MCPToolError } from '../dist/volcano-agent-sdk.js';

describe('typed errors', () => {
  it('concurrency guard throws AgentConcurrencyError', async () => {
    const llm: any = { id: 'mock', model: 'm', client: {}, gen: async () => 'OK', genWithTools: async () => ({ content: '', toolCalls: [] }), genStream: async function*(){} };
    const a = agent({ llm, hideProgress: true });
    const p = a.then({ prompt: 'one' }).run();
    let err: any;
    try { await a.run(); } catch (e) { err = e; }
    await p;
    expect(err).toBeInstanceOf(AgentConcurrencyError);
  });

  it('per-step timeout produces TimeoutError with retryable', async () => {
    const llm: any = { id: 'mock', model: 'm', client: {}, gen: async () => { await new Promise(r => setTimeout(r, 50)); return 'OK'; }, genWithTools: async () => ({ content: '', toolCalls: [] }), genStream: async function*(){} };
    let err: any;
    try {
      await agent({ llm, timeout: 1 , hideProgress: true })
        .then({ prompt: 'slow', timeout: 0 })
        .run();
    } catch (e) { err = e; }
    expect(err).toBeInstanceOf(TimeoutError);
    expect(err.meta?.retryable).toBe(true);
    expect(typeof err.meta?.stepId).toBe('number');
  });

  it('retry exhausted yields last LLMError (retryable) after attempts', async () => {
    const llm: any = { id: 'mock', model: 'm', client: {}, gen: async () => { const e: any = new Error('transient'); e.status = 500; throw e; }, genWithTools: async () => ({ content: '', toolCalls: [] }), genStream: async function*(){} };
    let err: any;
    try {
      await agent({ llm, hideProgress: true, retry: { delay: 0, retries: 2 } })
        .then({ prompt: 'llm-only failing' })
        .run();
    } catch (e) { err = e; }
    expect(err).toBeInstanceOf(LLMError);
    expect(err.meta?.retryable).toBe(true);
    expect(typeof err.meta?.stepId).toBe('number');
  });

  it('LLMError contains provider and retryable', async () => {
    const llm: any = { id: 'openai-mock', model: 'm', client: {}, gen: async () => { const err: any = new Error('429'); err.status = 429; throw err; }, genWithTools: async () => ({ content: '', toolCalls: [] }), genStream: async function*(){} };
    let err: any;
    try {
      await agent({ llm, hideProgress: true }).then({ prompt: 'simple' }).run();
    } catch (e) { err = e; }
    expect(err).toBeInstanceOf(LLMError);
    expect(err.meta?.provider).toMatch(/^llm:/);
    expect(err.meta?.retryable).toBe(true);
  });

  it('MCP tool error yields MCPToolError with provider', async () => {
    const llm: any = { id: 'mock', model: 'm', client: {}, gen: async () => 'OK', genWithTools: async () => ({ content: '', toolCalls: [] }), genStream: async function*(){} };
    const svc = mcp('http://localhost:3993/mcp'); // likely not running
    let err: any;
    try {
      await agent({ llm, hideProgress: true })
        .then({ mcp: svc, tool: 'any' })
        .run();
    } catch (e) { err = e; }
    expect(err).toBeInstanceOf(MCPToolError);
    expect(err.meta?.provider).toMatch(/^mcp:/);
  });
});
