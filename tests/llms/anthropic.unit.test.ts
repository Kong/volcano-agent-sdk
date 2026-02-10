import { describe, it, expect } from 'vitest';
import { llmAnthropic } from '../../dist/volcano-agent-sdk.js';

describe('Anthropic LLM provider (unit)', () => {
  it('calls messages.create and returns text', async () => {
    const calls: any[] = [];
    const client = {
      messages: {
        create: async (args: any) => {
          calls.push(args);
          return { content: [{ type: 'text', text: 'hello from claude' }] };
        }
      }
    };
    const llm = llmAnthropic({ client, model: 'claude-3-haiku' });
    const out = await llm.gen('ping');
    expect(out).toContain('hello');
    expect(calls.length).toBe(1);
    expect(calls[0].model).toBe('claude-3-haiku');
  });
});


