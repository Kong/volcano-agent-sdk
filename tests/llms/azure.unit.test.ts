import { describe, it, expect } from 'vitest';
import { llmAzure } from '../../dist/volcano-agent-sdk.js';

describe('Azure AI provider (unit)', () => {
  it('creates an Azure AI LLM handle with proper configuration', () => {
    const mockClient = {
      createResponse: async () => ({
        output: [{
          type: 'message',
          content: [{ type: 'output_text', text: 'Hello from Azure' }]
        }]
      })
    };

    const llm = llmAzure({ 
      client: mockClient, 
      model: 'gpt-5-mini',
      endpoint: 'https://test.openai.azure.com/openai/responses',
      apiKey: 'test-key'
    });
    
    expect(llm.id).toBe('Azure-gpt-5-mini');
    expect(llm.model).toBe('gpt-5-mini');
    expect(typeof llm.gen).toBe('function');
    expect(typeof llm.genWithTools).toBe('function');
    expect(typeof llm.genStream).toBe('function');
  });

  it('gen() calls Azure Responses API correctly', async () => {
    const mockCalls: any[] = [];
    const mockClient = {
      createResponse: async (params: any) => {
        mockCalls.push(params);
        return {
          output: [{
            type: 'message',
            content: [{ type: 'output_text', text: 'Azure response' }]
          }]
        };
      }
    };

    const llm = llmAzure({ 
      client: mockClient, 
      model: 'gpt-5-mini',
      endpoint: 'https://test.openai.azure.com/openai/responses',
      apiKey: 'test-key'
    });
    const result = await llm.gen('Test prompt');
    
    expect(result).toBe('Azure response');
    expect(mockCalls).toHaveLength(1);
    expect(mockCalls[0].model).toBe('gpt-5-mini');
    expect(mockCalls[0].input[0].content).toBe('Test prompt');
  });

  it('genWithTools() formats tools correctly for Azure', async () => {
    const mockCalls: any[] = [];
    const mockClient = {
      createResponse: async (params: any) => {
        mockCalls.push(params);
        return {
          output: [{
            type: 'function_call',
            name: 'test_tool',
            arguments: '{"arg":"value"}'
          }]
        };
      }
    };

    const tools = [{
      name: 'test_tool',
      description: 'A test tool',
      parameters: { type: 'object', properties: { arg: { type: 'string' } } }
    }];

    const llm = llmAzure({ 
      client: mockClient, 
      model: 'gpt-5-mini',
      endpoint: 'https://test.openai.azure.com/openai/responses',
      apiKey: 'test-key'
    });
    const result = await llm.genWithTools('Use the tool', tools);
    
    expect(mockCalls).toHaveLength(1);
    expect(mockCalls[0].tools).toHaveLength(1);
    expect(mockCalls[0].tools[0].name).toBe('test_tool');
    expect(mockCalls[0].tools[0].description).toBe('A test tool');
    
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe('test_tool');
    expect(result.toolCalls[0].arguments).toEqual({ arg: 'value' });
  });

  it('handles tool name sanitization', async () => {
    const mockClient = {
      createResponse: async () => ({
        output: [{
          type: 'function_call',
          name: 'astro_get_sign',  // Sanitized (dots → underscores)
          arguments: '{"birthdate":"1993-07-11"}'
        }]
      })
    };

    const tools = [{
      name: 'astro.get_sign',
      description: 'Get astrological sign',
      parameters: { type: 'object', properties: { birthdate: { type: 'string' } } }
    }];

    const llm = llmAzure({ 
      client: mockClient, 
      model: 'gpt-5-mini',
      endpoint: 'https://test.openai.azure.com/openai/responses',
      apiKey: 'test-key'
    });
    const result = await llm.genWithTools('Get sign', tools);
    
    // Result should have the original dotted name (matches input)
    expect(result.toolCalls[0].name).toBe('astro.get_sign');
  });

  it('requires model parameter', () => {
    expect(() => {
      llmAzure({ 
        endpoint: 'https://test.openai.azure.com/openai/responses',
        apiKey: 'test-key'
      } as any);
    }).toThrow(/Missing required 'model' parameter/);
  });

  it('requires endpoint parameter', () => {
    expect(() => {
      llmAzure({ 
        model: 'gpt-5-mini',
        apiKey: 'test-key'
      } as any);
    }).toThrow(/Missing required 'endpoint' parameter/);
  });

  it('supports API key authentication', () => {
    const llm = llmAzure({
      model: 'gpt-5-mini',
      endpoint: 'https://test.openai.azure.com/openai/responses',
      apiKey: 'test-api-key'
    });
    expect(llm.id).toBe('Azure-gpt-5-mini');
  });

  it('supports Entra ID token authentication', () => {
    const llm = llmAzure({
      model: 'gpt-5-mini', 
      endpoint: 'https://test.openai.azure.com/openai/responses',
      accessToken: 'test-access-token'
    });
    expect(llm.id).toBe('Azure-gpt-5-mini');
  });
});
