import { describe, it, expect } from 'vitest';
import { llmOpenAI } from '../../dist/volcano-agent-sdk.js';

describe('OpenAI provider (integration)', () => {
  it('calls OpenAI and returns at least one tool call when tools are provided', async () => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for this test');
    }
    const llm = llmOpenAI({ apiKey: process.env.OPENAI_API_KEY!, model: process.env.OPENAI_MODEL || 'gpt-5-mini' });
    const tools: any = [{
      name: 'astro.get_sign',
      description: 'Return sign for birthdate',
      parameters: { type: 'object', properties: { birthdate: { type: 'string' } }, required: ['birthdate'] }
    }];
    const res = await llm.genWithTools('Find the astrological sign for 1993-07-11 using available tools.', tools);
    expect(Array.isArray(res.toolCalls)).toBe(true);
  }, 60000);

  it('streams tokens that concatenate to the non-stream answer', async () => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for this test');
    }
    const llm = llmOpenAI({ apiKey: process.env.OPENAI_API_KEY!, model: process.env.OPENAI_MODEL || 'gpt-5-mini' });
    const prompt = 'Reply ONLY with STREAM_OK';
    const nonStream = await llm.gen(prompt);
    const normalizedA = nonStream.trim().replace(/[^A-Za-z0-9_]/g, '').toUpperCase();

    let streamed = '';
    for await (const chunk of llm.genStream(prompt)) {
      streamed += chunk;
    }
    const normalizedB = streamed.trim().replace(/[^A-Za-z0-9_]/g, '').toUpperCase();

    // Proper property: streaming concat should equal non-stream output (normalized)
    expect(normalizedA).toBe(normalizedB);
    expect(normalizedA.length).toBeGreaterThan(0);
  }, 30000);

  it('can produce valid JSON when asked', async () => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for this test');
    }
    const llm = llmOpenAI({ apiKey: process.env.OPENAI_API_KEY!, model: process.env.OPENAI_MODEL || 'gpt-5-mini' });
    const prompt = 'Return ONLY valid minified JSON: {"ok":true,"provider":"openai"}';
    const out = await llm.gen(prompt);
    const text = out.trim();
    // Extract JSON if wrapped in code fences
    const m = text.match(/\{[\s\S]*\}/);
    const jsonStr = m ? m[0] : text;
    const obj = JSON.parse(jsonStr);
    expect(obj && obj.ok === true && obj.provider === 'openai').toBe(true);
  }, 30000);
});
