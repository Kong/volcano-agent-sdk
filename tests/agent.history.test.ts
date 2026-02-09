import { describe, it, expect } from 'vitest';
import { agent } from '../dist/volcano-agent-sdk.js';

function makeFakeLlm(record: string[]) {
  return {
    id: 'OpenAI-fake',
    model: 'fake',
    client: {},
    gen: async (prompt: string) => { record.push(prompt); return 'OK'; },
    genWithTools: async () => ({ content: '', toolCalls: [] }),
    genStream: async function* () {}
  } as any;
}

describe('agent history injection', () => {
  it('injects previous LLM answer into subsequent prompts by default', async () => {
    const calls: string[] = [];
    const llm = makeFakeLlm(calls);

    const res = await agent({ llm, hideProgress: true })
      .then({ prompt: 'First question' })
      .then({ prompt: 'Second question' })
      .run();

    // Two gen calls
    expect(calls.length).toBe(2);
    // First call should not include context
    expect(calls[0]).toBe('First question');
    // Second call should include context with previous LLM answer marker
    expect(calls[1]).toContain('Second question');
    expect(calls[1]).toContain('[Context from previous steps]');
    // The previous answer was 'OK' from fake llm
    expect(calls[1]).toContain('Previous LLM answer');
  });

  it('resetHistory clears context so the next prompt has no injected history', async () => {
    const calls: string[] = [];
    const llm = makeFakeLlm(calls);

    await agent({ llm, hideProgress: true })
      .then({ prompt: 'First' })
      .resetHistory()
      .then({ prompt: 'Second (fresh)' })
      .run();

    expect(calls.length).toBe(2);
    // After reset, second prompt should not contain context marker
    expect(calls[1]).toBe('Second (fresh)');
    expect(calls[1]).not.toContain('[Context from previous steps]');
  });
});
