import { describe, it, expect } from 'vitest';
import { llmOpenAI, llmAnthropic, llmAzure, llmBedrock, llmLlama, llmMistral, llmVertexStudio } from '../../dist/volcano-agent-sdk.js';

describe('LLM Provider Options (E2E)', () => {
  it('OpenAI: uses optional parameters correctly', async () => {
    // Note: gpt-5-mini has reliability issues, use gpt-4o-mini for options testing
    const testModel = 'gpt-4o-mini';
    
    const llmWithSeed = llmOpenAI({ 
      apiKey: process.env.OPENAI_API_KEY!,
      model: testModel,
      options: {
        seed: 12345,
        temperature: 1.0, // Even with high temperature, seed should be deterministic
        max_completion_tokens: 50,
      }
    });
    
    // Same prompt with same seed should give identical results
    const result1 = await llmWithSeed.gen('Pick a random color from: red, blue, green, yellow');
    const result2 = await llmWithSeed.gen('Pick a random color from: red, blue, green, yellow');
    
    expect(result1).toBeTruthy();
    expect(result2).toBeTruthy();
    // Seed parameter makes output deterministic
    expect(result1).toBe(result2);
    expect(result1.length).toBeLessThan(200); // max_completion_tokens limits it
  }, 60000);

  it('Anthropic: uses optional parameters correctly', async () => {
    const llmShort = llmAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307',
      options: {
        temperature: 1.0,
        max_tokens: 20, // Very short
        top_p: 1.0,
        top_k: 250,
      }
    });
    
    const llmLong = llmAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307',
      options: {
        max_tokens: 200, // Much longer
      }
    });
    
    const shortResult = await llmShort.gen('Write a paragraph about AI.');
    const longResult = await llmLong.gen('Write a paragraph about AI.');
    
    expect(shortResult).toBeTruthy();
    expect(longResult).toBeTruthy();
    // max_tokens should make shortResult significantly shorter
    expect(shortResult.length).toBeLessThan(longResult.length);
    expect(shortResult.length).toBeLessThan(150); // ~20 tokens
    expect(longResult.length).toBeGreaterThan(200); // ~200 tokens
  }, 60000);

  it('Azure: optional parameters (limited support)', async () => {
    // Azure Responses API does not support standard OpenAI parameters
    // This test verifies that the provider works, but Azure has no configurable options
    // See: https://learn.microsoft.com/en-us/azure/ai-services/openai/reference
    const llm = llmAzure({
      model: 'gpt-5-mini',
      endpoint: 'https://volcano-sdk.openai.azure.com/openai/responses',
      apiKey: process.env.AZURE_AI_API_KEY!,
      // Note: Azure Responses API rejects all option parameters
      // options: {} would work but testing without to show Azure has no configurable options
    });
    
    const result = await llm.gen('Say "AZURE_OK"');
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
    console.log('Note: Azure Responses API does not support optional parameters like other providers');
  }, 60000);

  it('Bedrock: uses optional parameters correctly', async () => {
    const llmLowTemp = llmBedrock({
      model: process.env.BEDROCK_MODEL || 'amazon.nova-micro-v1:0',
      region: process.env.AWS_REGION || 'us-east-1',
      ...(process.env.AWS_ACCESS_KEY_ID && {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      }),
      ...(process.env.AWS_BEARER_TOKEN_BEDROCK && {
        bearerToken: process.env.AWS_BEARER_TOKEN_BEDROCK,
      }),
      options: {
        temperature: 0.1, // Very deterministic
        max_tokens: 50,
        top_p: 0.95,
      }
    });
    
    const llmHighTemp = llmBedrock({
      model: process.env.BEDROCK_MODEL || 'amazon.nova-micro-v1:0',
      region: process.env.AWS_REGION || 'us-east-1',
      ...(process.env.AWS_ACCESS_KEY_ID && {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      }),
      ...(process.env.AWS_BEARER_TOKEN_BEDROCK && {
        bearerToken: process.env.AWS_BEARER_TOKEN_BEDROCK,
      }),
      options: {
        temperature: 1.0, // More creative
        max_tokens: 200,
      }
    });
    
    const lowTempResult = await llmLowTemp.gen('Write one sentence about clouds.');
    const highTempResult = await llmHighTemp.gen('Write one sentence about clouds.');
    
    expect(lowTempResult).toBeTruthy();
    expect(highTempResult).toBeTruthy();
    // Low temperature = shorter, more predictable
    expect(lowTempResult.length).toBeLessThan(250);
    // High temperature = potentially longer
    expect(highTempResult.length).toBeGreaterThan(0);
  }, 60000);

  // Skip in CI - Llama is too slow (45s+ per call even with optimizations)
  (process.env.CI === 'true' ? it.skip : it)('Llama: uses optional parameters correctly', async () => {
    const llm = llmLlama({
      baseURL: process.env.LLAMA_BASE_URL || 'http://localhost:11434',
      model: process.env.LLAMA_MODEL || 'llama3.1:8b',
      ...(process.env.LLAMA_API_KEY && { apiKey: process.env.LLAMA_API_KEY }),
      options: {
        temperature: 0.7,
        max_tokens: 100,
        top_p: 0.9,
        top_k: 40,
        stop: ['\n\n'],
        repeat_penalty: 1.1,
        seed: 123,
      }
    });
    
    const result = await llm.gen('Say "LLAMA_OPTIONS_OK" in a single word.');
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  }, 60000);

  it('Mistral: uses optional parameters correctly', async () => {
    const llmShort = llmMistral({
      apiKey: process.env.MISTRAL_API_KEY!,
      model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
      options: {
        temperature: 0.7,
        max_tokens: 30, // Very short
        top_p: 0.95,
        safe_prompt: true,
      }
    });
    
    const llmLong = llmMistral({
      apiKey: process.env.MISTRAL_API_KEY!,
      model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
      options: {
        max_tokens: 150, // Much longer
      }
    });
    
    const shortResult = await llmShort.gen('Write a paragraph about AI.');
    const longResult = await llmLong.gen('Write a paragraph about AI.');
    
    expect(shortResult).toBeTruthy();
    expect(longResult).toBeTruthy();
    // max_tokens should make shortResult significantly shorter
    expect(shortResult.length).toBeLessThan(longResult.length);
    expect(shortResult.length).toBeLessThan(250); // ~30 tokens
    expect(longResult.length).toBeGreaterThan(200); // ~150 tokens
  }, 60000);

  it('Vertex Studio: uses optional parameters correctly', async () => {
    const llmShort = llmVertexStudio({
      model: process.env.VERTEX_MODEL || 'gemini-2.5-flash-lite',
      apiKey: process.env.GCP_VERTEX_API_KEY!,
      options: {
        temperature: 0.9,
        max_output_tokens: 30, // Very limited
        top_p: 0.95,
        top_k: 40,
      },
      clientOptions: {
        retryOnRateLimit: { maxRetries: 3, initialDelayMs: 1000 }
      }
    });

    const llmLong = llmVertexStudio({
      model: process.env.VERTEX_MODEL || 'gemini-2.5-flash-lite',
      apiKey: process.env.GCP_VERTEX_API_KEY!,
      options: {
        max_output_tokens: 200,
      },
      clientOptions: {
        retryOnRateLimit: { maxRetries: 3, initialDelayMs: 1000 }
      }
    });
    
    const shortResult = await llmShort.gen('Explain quantum computing in detail.');
    const longResult = await llmLong.gen('Explain quantum computing in detail.');
    
    expect(shortResult).toBeTruthy();
    expect(longResult).toBeTruthy();
    // max_output_tokens should limit shortResult
    expect(shortResult.length).toBeLessThan(longResult.length);
    expect(shortResult.length).toBeLessThan(250); // ~30 tokens (with some margin)
    expect(longResult.length).toBeGreaterThan(300); // ~200 tokens
  }, 60000);
});
