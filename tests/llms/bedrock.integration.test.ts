import { describe, it, expect } from 'vitest';
import { llmBedrock } from '../../dist/volcano-agent-sdk.js';

describe('Bedrock provider (integration)', () => {
  it('calls Bedrock with live API when AWS credentials are available', async () => {
    if (!process.env.AWS_BEARER_TOKEN_BEDROCK && (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY)) {
      throw new Error('AWS_BEARER_TOKEN_BEDROCK or (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY) are required for this test');
    }
    
    const llm = llmBedrock({ 
      region: process.env.AWS_REGION || 'us-east-1',
      ...(process.env.AWS_BEARER_TOKEN_BEDROCK ? {
        bearerToken: process.env.AWS_BEARER_TOKEN_BEDROCK
      } : {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN,
      }),
      model: process.env.BEDROCK_MODEL || 'amazon.nova-micro-v1:0'
    });
    
    const prompt = 'Reply ONLY with BEDROCK_OK';
    const out = await llm.gen(prompt);
    expect(typeof out).toBe('string');
    const normalized = out.trim().replace(/[^A-Za-z0-9_]/g, '').toUpperCase();
    expect(normalized).toContain('BEDROCK');
  }, 30000);

  it('follows constrained echo', async () => {
    if (!process.env.AWS_BEARER_TOKEN_BEDROCK && (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY)) {
      throw new Error('AWS_BEARER_TOKEN_BEDROCK or AWS credentials are required for this test');
    }
    
    const llm = llmBedrock({ 
      region: process.env.AWS_REGION || 'us-east-1',
      ...(process.env.AWS_BEARER_TOKEN_BEDROCK ? {
        bearerToken: process.env.AWS_BEARER_TOKEN_BEDROCK
      } : {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN,
      }),
      model: process.env.BEDROCK_MODEL || 'amazon.nova-micro-v1:0'
    });
    
    const prompt = 'Reply ONLY with BEDROCK_ECHO_OK';
    const out = await llm.gen(prompt);
    const normalized = out.trim().replace(/[^A-Za-z0-9_]/g, '').toUpperCase();
    expect(/^BEDROCK.*ECHO.*OK/.test(normalized)).toBe(true);
  }, 30000);

  it('returns a toolCalls array on genWithTools (Nova Micro)', async () => {
    if (!process.env.AWS_BEARER_TOKEN_BEDROCK && (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY)) {
      throw new Error('AWS_BEARER_TOKEN_BEDROCK or AWS credentials are required for this test');
    }
    
    // Use Nova Micro which supports tool calling
    const llm = llmBedrock({ 
      region: process.env.AWS_REGION || 'us-east-1',
      ...(process.env.AWS_BEARER_TOKEN_BEDROCK ? {
        bearerToken: process.env.AWS_BEARER_TOKEN_BEDROCK
      } : {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN,
      }),
      model: 'amazon.nova-micro-v1:0' // Use Nova Micro for tool calling
    });
    
    const tools = [{
      name: 'calculator',
      description: 'Perform basic math calculations',
      parameters: { 
        type: 'object', 
        properties: { 
          operation: { type: 'string' },
          a: { type: 'number' },
          b: { type: 'number' }
        },
        required: ['operation', 'a', 'b']
      }
    }];
    
    const prompt = 'Calculate 7 + 3 using the calculator tool';
    const result = await llm.genWithTools(prompt, tools);
    
    expect(result).toHaveProperty('toolCalls');
    expect(Array.isArray(result.toolCalls)).toBe(true);
    expect(result.toolCalls.length).toBeGreaterThanOrEqual(1);
    expect(result.toolCalls[0].name).toBe('calculator');
    expect(result.toolCalls[0].arguments).toHaveProperty('a');
    expect(result.toolCalls[0].arguments).toHaveProperty('b');
  }, 30000);

  it('supports streaming via fallback', async () => {
    if (!process.env.AWS_BEARER_TOKEN_BEDROCK && (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY)) {
      throw new Error('AWS_BEARER_TOKEN_BEDROCK or AWS credentials are required for this test');
    }
    
    const llm = llmBedrock({ 
      region: process.env.AWS_REGION || 'us-east-1',
      ...(process.env.AWS_BEARER_TOKEN_BEDROCK ? {
        bearerToken: process.env.AWS_BEARER_TOKEN_BEDROCK
      } : {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN,
      }),
      model: process.env.BEDROCK_MODEL || 'amazon.nova-micro-v1:0'
    });
    
    const prompt = 'Reply ONLY with BEDROCK_STREAM_OK';
    const nonStream = await llm.gen(prompt);
    const normalizedA = nonStream.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    
    let streamed = '';
    for await (const chunk of llm.genStream(prompt)) streamed += chunk;
    const normalizedB = streamed.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    
    // Check that both contain the essential content
    expect(normalizedA).toContain('BEDROCKSTREAMOK');
    expect(normalizedB).toContain('BEDROCKSTREAMOK');
    expect(normalizedA.length).toBeGreaterThan(0);
    expect(normalizedB.length).toBeGreaterThan(0);
  }, 30000);
});
