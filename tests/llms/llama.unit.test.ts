import { describe, it, expect } from 'vitest';
import { llmLlama } from '../../dist/volcano-agent-sdk.js';

describe('Llama LLM provider (unit)', () => {
  it('calls OpenAI-compatible client and returns content', async () => {
    const calls: any[] = [];
    const client = {
      chat: { completions: { create: async (args: any) => { calls.push(args); return { choices: [{ message: { content: 'hi llama' } }] }; } } }
    } as any;
    const llm = llmLlama({ client, model: 'llama3-8b-instruct' });
    const out = await llm.gen('hello');
    expect(out).toContain('llama');
    expect(calls.length).toBe(1);
    expect(calls[0].model).toBe('llama3-8b-instruct');
  });
});


