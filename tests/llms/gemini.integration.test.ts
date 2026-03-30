import { describe, it, expect } from 'vitest';
import { llmGemini } from '../../dist/volcano-agent-sdk.js';

describe('Gemini provider (integration)', () => {
  it('calls Google Gemini with live API when GEMINI_API_KEY is set', async () => {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required for this test');
    }

    const llm = llmGemini({
      apiKey: process.env.GEMINI_API_KEY!,
      model: 'gemini-3-flash-preview',
      clientOptions: {
        retryOnRateLimit: { maxRetries: 5, initialDelayMs: 5000, maxDelayMs: 60000 }
      }
    });

    const prompt = 'Reply ONLY with GEMINI_OK';
    const out = await llm.gen(prompt);
    expect(typeof out).toBe('string');
    const normalized = out.trim().replace(/[^A-Za-z0-9_]/g, '').toUpperCase();
    expect(normalized).toContain('GEMINI');
  }, 30000);

  it('follows constrained echo', async () => {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required for this test');
    }

    const llm = llmGemini({
      apiKey: process.env.GEMINI_API_KEY!,
      model: 'gemini-3-flash-preview',
      clientOptions: {
        retryOnRateLimit: { maxRetries: 5, initialDelayMs: 5000, maxDelayMs: 60000 }
      }
    });

    const prompt = 'Reply ONLY with GEMINI_ECHO_OK';
    const out = await llm.gen(prompt);
    const normalized = out.trim().replace(/[^A-Za-z0-9_]/g, '').toUpperCase();
    expect(/GEMINI.*ECHO.*OK/.test(normalized)).toBe(true);
  }, 30000);

  it('returns a toolCalls array on genWithTools (Gemini function calling)', async () => {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required for this test');
    }

    const llm = llmGemini({
      apiKey: process.env.GEMINI_API_KEY!,
      model: 'gemini-3-flash-preview',
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

  it('supports native SSE streaming', async () => {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required for this test');
    }

    const llm = llmGemini({
      apiKey: process.env.GEMINI_API_KEY!,
      model: 'gemini-3-flash-preview',
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

    expect(streamed.length).toBeGreaterThan(0);
    expect(chunkCount).toBeGreaterThanOrEqual(1);
    expect(typeof streamed).toBe('string');
    console.log(`Native SSE streaming: ${chunkCount} chunks, content: "${streamed}"`);
  }, 30000);

  it('tracks token usage after gen()', async () => {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required for this test');
    }

    const llm = llmGemini({
      apiKey: process.env.GEMINI_API_KEY!,
      model: 'gemini-3-flash-preview',
      clientOptions: {
        retryOnRateLimit: { maxRetries: 5, initialDelayMs: 5000, maxDelayMs: 60000 }
      }
    });

    await llm.gen('Say hello');
    const usage = llm.getUsage?.();
    expect(usage).not.toBeNull();
    expect(usage?.inputTokens).toBeGreaterThan(0);
    expect(usage?.outputTokens).toBeGreaterThan(0);
    expect(usage?.totalTokens).toBeGreaterThan(0);
  }, 30000);

  it('respects response_mime_type for JSON output', async () => {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required for this test');
    }

    const llm = llmGemini({
      apiKey: process.env.GEMINI_API_KEY!,
      model: 'gemini-3-flash-preview',
      options: {
        response_mime_type: 'application/json',
      },
      clientOptions: {
        retryOnRateLimit: { maxRetries: 5, initialDelayMs: 5000, maxDelayMs: 60000 }
      }
    });

    const out = await llm.gen('Return a JSON object with a single key "status" and value "ok"');
    const parsed = JSON.parse(out);
    expect(parsed).toHaveProperty('status');
    expect(parsed.status).toBe('ok');
  }, 30000);

  it('respects max_output_tokens to limit response length', async () => {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required for this test');
    }

    const llm = llmGemini({
      apiKey: process.env.GEMINI_API_KEY!,
      model: 'gemini-3-flash-preview',
      options: {
        max_output_tokens: 10,
      },
      clientOptions: {
        retryOnRateLimit: { maxRetries: 5, initialDelayMs: 5000, maxDelayMs: 60000 }
      }
    });

    const out = await llm.gen('Write a 500 word essay about the history of computing');
    // 10 tokens is roughly 30-40 characters — response should be short
    expect(out.length).toBeLessThan(200);
  }, 30000);

  it('respects temperature setting', async () => {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required for this test');
    }

    const prompt = 'Create a unique random sentence about an animal';

    const cold = llmGemini({
      apiKey: process.env.GEMINI_API_KEY!,
      model: 'gemini-3-flash-preview',
      options: { temperature: 0 },
      clientOptions: {
        retryOnRateLimit: { maxRetries: 5, initialDelayMs: 5000, maxDelayMs: 60000 }
      }
    });

    const cold1 = await cold.gen(prompt);
    const cold2 = await cold.gen(prompt);

    const hot = llmGemini({
      apiKey: process.env.GEMINI_API_KEY!,
      model: 'gemini-3-flash-preview',
      options: { temperature: 2 },
      clientOptions: {
        retryOnRateLimit: { maxRetries: 5, initialDelayMs: 5000, maxDelayMs: 60000 }
      }
    });

    const hot1 = await hot.gen(prompt);
    const hot2 = await hot.gen(prompt);

    // temp 0 should be mostly deterministic
    expect(cold1.trim()).toBe(cold2.trim());
    // temp 2 should produce different output
    expect(hot1.trim()).not.toBe(hot2.trim());
  }, 60000);

  it('respects stop_sequences', async () => {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required for this test');
    }

    const llm = llmGemini({
      apiKey: process.env.GEMINI_API_KEY!,
      model: 'gemini-3-flash-preview',
      options: {
        stop_sequences: ['5'],
      },
      clientOptions: {
        retryOnRateLimit: { maxRetries: 5, initialDelayMs: 5000, maxDelayMs: 60000 }
      }
    });

    const out = await llm.gen('Count from 1 to 10, one number per line');
    // Should stop before or at "5"
    expect(out).not.toContain('6');
  }, 30000);
});
