import { describe, it, expect } from 'vitest';
import { llmGemini } from '../../dist/volcano-agent-sdk.js';

describe('Gemini provider (unit)', () => {
  it('creates a Gemini LLM handle with proper configuration', () => {
    const mockClient = {
      generateContent: async () => ({
        candidates: [{
          content: {
            parts: [{ text: 'Hello from Gemini' }]
          }
        }]
      })
    };

    const llm = llmGemini({
      client: mockClient,
      model: 'gemini-3-flash-preview',
      apiKey: 'test-key'
    });

    expect(llm.id).toBe('Gemini-gemini-3-flash-preview');
    expect(llm.model).toBe('gemini-3-flash-preview');
    expect(typeof llm.gen).toBe('function');
    expect(typeof llm.genWithTools).toBe('function');
    expect(typeof llm.genStream).toBe('function');
  });

  it('gen() calls generateContent API correctly', async () => {
    const mockCalls: any[] = [];
    const mockClient = {
      generateContent: async (params: any) => {
        mockCalls.push(params);
        return {
          candidates: [{
            content: {
              parts: [{ text: 'Gemini response' }]
            }
          }]
        };
      }
    };

    const llm = llmGemini({
      client: mockClient,
      model: 'gemini-3-flash-preview',
      apiKey: 'test-key'
    });
    const result = await llm.gen('Test prompt');

    expect(result).toBe('Gemini response');
    expect(mockCalls).toHaveLength(1);
    expect(mockCalls[0].contents[0].parts[0].text).toBe('Test prompt');
    expect(mockCalls[0].generationConfig.maxOutputTokens).toBe(256);
  });

  it('genWithTools() formats tools correctly for Gemini', async () => {
    const mockCalls: any[] = [];
    const mockClient = {
      generateContent: async (params: any) => {
        mockCalls.push(params);
        return {
          candidates: [{
            content: {
              parts: [{
                functionCall: {
                  name: 'test_tool',
                  args: { arg: 'value' }
                }
              }]
            }
          }]
        };
      }
    };

    const tools = [{
      name: 'test_tool',
      description: 'A test tool',
      parameters: { type: 'object', properties: { arg: { type: 'string' } } }
    }];

    const llm = llmGemini({
      client: mockClient,
      model: 'gemini-3-flash-preview',
      apiKey: 'test-key'
    });
    const result = await llm.genWithTools('Use the tool', tools);

    expect(mockCalls).toHaveLength(1);
    expect(mockCalls[0].tools).toHaveLength(1);
    expect(mockCalls[0].tools[0].functionDeclarations[0].name).toBe('test_tool');
    expect(mockCalls[0].tools[0].functionDeclarations[0].description).toBe('A test tool');

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe('test_tool');
    expect(result.toolCalls[0].arguments).toEqual({ arg: 'value' });
  });

  it('handles tool name sanitization', async () => {
    const mockClient = {
      generateContent: async () => ({
          candidates: [{
            content: {
              parts: [{
                functionCall: {
                  name: 'astro_get_sign',
                  args: { birthdate: '1993-07-11' }
                }
              }]
            }
          }]
      })
    };

    const tools = [{
      name: 'astro.get_sign',
      description: 'Get astrological sign',
      parameters: { type: 'object', properties: { birthdate: { type: 'string' } } }
    }];

    const llm = llmGemini({
      client: mockClient,
      model: 'gemini-3-flash-preview',
      apiKey: 'test-key'
    });
    const result = await llm.genWithTools('Get sign', tools);

    expect(result.toolCalls[0].name).toBe('astro.get_sign');
  });

  it('requires model parameter', () => {
    expect(() => {
      llmGemini({ apiKey: 'test-key' } as any);
    }).toThrow(/Missing required 'model' parameter/);
  });

  it('requires apiKey parameter', () => {
    expect(() => {
      llmGemini({ model: 'gemini-3-flash-preview' } as any);
    }).toThrow(/Missing required 'apiKey' parameter/);
  });
});
