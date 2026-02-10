import { describe, it, expect } from 'vitest';
import { llmMistral } from '../../dist/volcano-agent-sdk.js';

describe('Mistral LLM provider (unit)', () => {
  it('calls OpenAI-compatible client and returns content', async () => {
    const calls: any[] = [];
    const client = {
      chat: { completions: { create: async (args: any) => { calls.push(args); return { choices: [{ message: { content: 'hi mistral' } }] }; } } }
    } as any;
    const llm = llmMistral({ client, model: 'mistral-small-latest' });
    const out = await llm.gen('hello');
    expect(out).toContain('mistral');
    expect(calls.length).toBe(1);
    expect(calls[0].model).toBe('mistral-small-latest');
  });
});


