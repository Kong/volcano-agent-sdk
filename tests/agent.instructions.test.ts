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

describe('agent instructions', () => {
  it('injects global instructions before prompt and history', async () => {
    const calls: string[] = [];
    const llm = makeFakeLlm(calls);

    await agent({ llm, instructions: 'You are a helpful assistant.' , hideProgress: true })
      .then({ prompt: 'First' })
      .then({ prompt: 'Second' })
      .run();

    // First call: should include instructions + prompt (no history yet)
    expect(calls[0].startsWith('You are a helpful assistant.')).toBe(true);
    expect(calls[0]).toContain('First');
    // Second call: should include instructions + history + prompt
    expect(calls[1].startsWith('You are a helpful assistant.')).toBe(true);
    expect(calls[1]).toContain('[Context from previous steps]');
    expect(calls[1]).toContain('Second');
  });

  it('per-step instructions override global instructions for that step only', async () => {
    const calls: string[] = [];
    const llm = makeFakeLlm(calls);

    await agent({ llm, instructions: 'GLOBAL INSTR' , hideProgress: true })
      .then({ prompt: 'One' })
      .then({ prompt: 'Two', instructions: 'STEP INSTR' })
      .then({ prompt: 'Three' })
      .run();

    expect(calls[0].startsWith('GLOBAL INSTR')).toBe(true);
    expect(calls[1].startsWith('STEP INSTR')).toBe(true);
    expect(calls[2].startsWith('GLOBAL INSTR')).toBe(true);
  });
});
