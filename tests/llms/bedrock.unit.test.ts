import { describe, it, expect } from 'vitest';
import { llmBedrock } from '../../dist/volcano-agent-sdk.js';

describe('Bedrock provider (unit)', () => {
  it('creates a Bedrock LLM handle with proper defaults', () => {
    const mockClient = {
      send: async () => ({
        output: {
          message: {
            content: [{ text: 'Hello from Bedrock' }]
          }
        }
      })
    };

    const llm = llmBedrock({ 
      client: mockClient, 
      model: 'anthropic.claude-sonnet-4-20250514-v1:0' 
    });
    
    expect(llm.id).toBe('Bedrock-anthropic.claude-sonnet-4-20250514-v1:0');
    expect(llm.model).toBe('anthropic.claude-sonnet-4-20250514-v1:0');
    expect(typeof llm.gen).toBe('function');
    expect(typeof llm.genWithTools).toBe('function');
    expect(typeof llm.genStream).toBe('function');
  });

  it('gen() calls Bedrock Converse API correctly with custom client', async () => {
    const mockCalls: any[] = [];
    const mockClient = {
      send: async (command: any) => {
        mockCalls.push(command.input);
        return {
          output: {
            message: {
              content: [{ text: 'Bedrock response' }]
            }
          }
        };
      }
    };

    const llm = llmBedrock({ client: mockClient, model: 'anthropic.claude-sonnet-4-20250514-v1:0' });
    const result = await llm.gen('Test prompt');
    
    expect(result).toBe('Bedrock response');
    expect(mockCalls).toHaveLength(1);
    expect(mockCalls[0].modelId).toBe('anthropic.claude-sonnet-4-20250514-v1:0');
    expect(mockCalls[0].messages[0].content[0].text).toBe('Test prompt');
    expect(mockCalls[0].inferenceConfig.maxTokens).toBe(256);
  });

  it('genWithTools() formats tools correctly for Bedrock', async () => {
    const mockCalls: any[] = [];
    const mockClient = {
      send: async (command: any) => {
        mockCalls.push(command.input);
        return {
          output: {
            message: {
              content: [
                {
                  toolUse: {
                    name: 'test_tool',
                    input: { arg: 'value' }
                  }
                }
              ]
            }
          }
        };
      }
    };

    const tools = [{
      name: 'test_tool',
      description: 'A test tool',
      parameters: { type: 'object', properties: { arg: { type: 'string' } } }
    }];

    const llm = llmBedrock({ client: mockClient, model: 'anthropic.claude-sonnet-4-20250514-v1:0' });
    const result = await llm.genWithTools('Use the tool', tools);
    
    expect(mockCalls).toHaveLength(1);
    expect(mockCalls[0].toolConfig.tools).toHaveLength(1);
    expect(mockCalls[0].toolConfig.tools[0].toolSpec.name).toBe('test_tool');
    expect(mockCalls[0].toolConfig.tools[0].toolSpec.description).toBe('A test tool');
    
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe('test_tool');
    expect(result.toolCalls[0].arguments).toEqual({ arg: 'value' });
  });

  it('handles tool name sanitization', async () => {
    const mockCalls: any[] = [];
    const mockClient = {
      send: async (command: any) => {
        mockCalls.push(command.input);
        return {
          output: {
            message: {
              content: [{
                toolUse: {
                  toolUseId: 'tooluse_1',
                  name: 'astro_get_sign',  // Sanitized (dots → underscores)
                  input: { birthdate: '1993-07-11' }
                }
              }]
            },
            stopReason: 'tool_use'
          }
        };
      }
    };

    const tools = [{
      name: 'astro.get_sign',
      description: 'Get astrological sign',
      parameters: { type: 'object', properties: { birthdate: { type: 'string' } } }
    }];

    const llm = llmBedrock({ client: mockClient, model: 'anthropic.claude-sonnet-4-20250514-v1:0' });
    const result = await llm.genWithTools('Get sign', tools);
    
    // Check that the tool name was sanitized for Bedrock (dots become underscores)
    expect(mockCalls[0].toolConfig.tools[0].toolSpec.name).toBe('astro_get_sign');
    
    // But the result should have the original dotted name (matches input)
    expect(result.toolCalls[0].name).toBe('astro.get_sign');
  });

  it('supports bearer token authentication', () => {
    const llm = llmBedrock({ 
      region: 'us-west-2',
      bearerToken: 'test-bearer-token-123',
      model: 'anthropic.claude-3-sonnet-20240229-v1:0'
    });
    
    expect(llm.id).toBe('Bedrock-anthropic.claude-3-sonnet-20240229-v1:0');
    expect(llm.model).toBe('anthropic.claude-3-sonnet-20240229-v1:0');
  });

  it('requires model parameter', () => {
    expect(() => {
      llmBedrock({});
    }).toThrow(/Missing required 'model' parameter/);
  });

  it('handles AWS configuration errors gracefully', async () => {
    const llm = llmBedrock({ model: 'anthropic.claude-sonnet-4-20250514-v1:0' });
    
    await expect(async () => {
      await llm.gen('test');
    }).rejects.toThrow(); // Will throw AWS auth or model configuration error
  });
});
