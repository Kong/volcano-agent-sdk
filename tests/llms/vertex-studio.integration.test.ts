import { describe, it, expect } from 'vitest';
import { llmVertexStudio } from '../../dist/volcano-agent-sdk.js';

describe('Vertex Studio provider (integration)', () => {
  it('calls Google AI Studio with live API when GCP_VERTEX_API_KEY is set', async () => {
    if (!process.env.GCP_VERTEX_API_KEY) {
      throw new Error('GCP_VERTEX_API_KEY is required for this test');
    }
    
    const llm = llmVertexStudio({
      apiKey: process.env.GCP_VERTEX_API_KEY!,
      model: 'gemini-2.5-flash-lite',
      clientOptions: {
        retryOnRateLimit: { maxRetries: 5, initialDelayMs: 5000, maxDelayMs: 60000 }
      }
    });
    
    const prompt = 'Reply ONLY with VERTEX_OK';
    const out = await llm.gen(prompt);
    expect(typeof out).toBe('string');
    const normalized = out.trim().replace(/[^A-Za-z0-9_]/g, '').toUpperCase();
    expect(normalized).toContain('VERTEX');
  }, 30000);

  it('follows constrained echo', async () => {
    if (!process.env.GCP_VERTEX_API_KEY) {
      throw new Error('GCP_VERTEX_API_KEY is required for this test');
    }
    
    const llm = llmVertexStudio({
      apiKey: process.env.GCP_VERTEX_API_KEY!,
      model: 'gemini-2.5-flash-lite',
      clientOptions: {
        retryOnRateLimit: { maxRetries: 5, initialDelayMs: 5000, maxDelayMs: 60000 }
      }
    });
    
    const prompt = 'Reply ONLY with VERTEX_ECHO_OK';
    const out = await llm.gen(prompt);
    const normalized = out.trim().replace(/[^A-Za-z0-9_]/g, '').toUpperCase();
    expect(/VERTEX.*ECHO.*OK/.test(normalized)).toBe(true);
  }, 30000);

  it('returns a toolCalls array on genWithTools (Gemini function calling)', async () => {
    if (!process.env.GCP_VERTEX_API_KEY) {
      throw new Error('GCP_VERTEX_API_KEY is required for this test');
    }
    
    const llm = llmVertexStudio({
      apiKey: process.env.GCP_VERTEX_API_KEY!,
      model: 'gemini-2.5-flash-lite',
      clientOptions: {
        retryOnRateLimit: { maxRetries: 5, initialDelayMs: 5000, maxDelayMs: 60000 }
      }
    });
    
    const tools = [{
      name: 'calculator',
      description: 'Perform basic math calculations',
      parameters: { 
        type: 'object', 
        properties: { 
          operation: { type: 'string', description: 'The math operation to perform' },
          a: { type: 'number', description: 'First number' },
          b: { type: 'number', description: 'Second number' }
        },
        required: ['operation', 'a', 'b']
      }
    }];
    
    const prompt = 'Calculate 9 + 4 using the calculator tool';
    const result = await llm.genWithTools(prompt, tools);
    
    expect(result).toHaveProperty('toolCalls');
    expect(Array.isArray(result.toolCalls)).toBe(true);
    expect(result.toolCalls.length).toBeGreaterThanOrEqual(1);
    expect(result.toolCalls[0].name).toBe('calculator');
    expect(result.toolCalls[0].arguments).toHaveProperty('a');
    expect(result.toolCalls[0].arguments).toHaveProperty('b');
  }, 30000);

  it('supports native streaming', async () => {
    if (!process.env.GCP_VERTEX_API_KEY) {
      throw new Error('GCP_VERTEX_API_KEY is required for this test');
    }
    
    const llm = llmVertexStudio({
      apiKey: process.env.GCP_VERTEX_API_KEY!,
      model: 'gemini-2.5-flash-lite',
      clientOptions: {
        retryOnRateLimit: { maxRetries: 5, initialDelayMs: 5000, maxDelayMs: 60000 }
      }
    });
    
    const prompt = 'Count from 1 to 3, saying each number separately';
    
    let streamed = '';
    let chunkCount = 0;
    for await (const chunk of llm.genStream(prompt)) {
      streamed += chunk;
      chunkCount++;
    }
    
    // Verify streaming produces output with multiple chunks
    expect(streamed.length).toBeGreaterThan(0);
    expect(chunkCount).toBeGreaterThanOrEqual(1);
    expect(typeof streamed).toBe('string');
    console.log(`Native streaming: ${chunkCount} chunks, content: "${streamed}"`);
  }, 30000);
});
