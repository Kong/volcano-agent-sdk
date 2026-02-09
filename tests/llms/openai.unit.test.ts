import { describe, it, expect, vi, beforeEach } from 'vitest';
import { llmOpenAI } from '../../dist/volcano-agent-sdk.js';

const calls: any[] = [];

vi.mock('openai', () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: async (req: any) => {
          calls.push(req);
          return {
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    // Return the sanitized version of the input tool name
                    { id: 't1', function: { name: 'mcp_abc123_get_sign', arguments: '{"birthdate":"1993-07-11"}' } }
                  ]
                }
              }
            ]
          } as any;
        }
      }
    };
    constructor(_: any) {}
  }
  return { default: MockOpenAI };
});

describe('OpenAI provider (unit)', () => {
  beforeEach(() => { calls.length = 0; });

  it('sanitizes tool names and maps back to dotted names', async () => {
    const llm: any = llmOpenAI({ apiKey: 'sk-test', model: 'gpt-5-mini' });
    const tools = [
      {
        name: 'mcp_abc123.get_sign', // Hash-based ID format
        description: 'Get sign',
        parameters: { type: 'object', properties: { birthdate: { type: 'string' } } }
      }
    ];

    const res = await llm.genWithTools('Do task', tools as any);

    expect(calls.length).toBe(1);
    // Sanitized: dots become underscores for OpenAI
    expect(calls[0].tools[0].function.name).toBe('mcp_abc123_get_sign');
    // Result: maps back to original dotted name
    expect(res.toolCalls[0].name).toBe('mcp_abc123.get_sign');
  });
});
