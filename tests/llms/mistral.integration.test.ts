import { describe, it, expect } from 'vitest';
import { llmMistral } from '../../dist/volcano-agent-sdk.js';

describe('Mistral provider (integration)', () => {
  it('calls Mistral Cloud with live API when MISTRAL_API_KEY is set', async () => {
    if (!process.env.MISTRAL_API_KEY) {
      throw new Error('MISTRAL_API_KEY is required for this test');
    }
    const base = process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai';
    const model = process.env.MISTRAL_MODEL || 'mistral-small-latest';
    const llm = llmMistral({ baseURL: base, apiKey: process.env.MISTRAL_API_KEY!, model });
    const prompt = 'Echo exactly this token with no quotes, no punctuation, no extra text: MISTRAL_OK';
    const out = await llm.gen(prompt);
    expect(typeof out).toBe('string');
    const normalized = out.trim().replace(/[^A-Za-z0-9_]/g, '').toUpperCase();
    expect(['MISTRAL_OK', 'MISTRALOK']).toContain(normalized);
  }, 30000);

  it('follows constrained echo', async () => {
    if (!process.env.MISTRAL_API_KEY) {
      throw new Error('MISTRAL_API_KEY is required for this test');
    }
    const base = process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai';
    const model = process.env.MISTRAL_MODEL || 'mistral-small-latest';
    const llm = llmMistral({ baseURL: base, apiKey: process.env.MISTRAL_API_KEY!, model });
    const prompt = 'Reply ONLY with MISTRAL_OK_2';
    const out = await llm.gen(prompt);
    const normalized = out.trim().replace(/[^A-Za-z0-9_]/g, '').toUpperCase();
    expect(/^MISTRAL_?OK/.test(normalized)).toBe(true);
  }, 30000);

  it('streams tokens that concatenate to the non-stream answer', async () => {
    if (!process.env.MISTRAL_API_KEY) {
      throw new Error('MISTRAL_API_KEY is required for this test');
    }
    const base = process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai';
    const model = process.env.MISTRAL_MODEL || 'mistral-small-latest';
    const llm = llmMistral({ baseURL: base, apiKey: process.env.MISTRAL_API_KEY!, model });
    const prompt = 'Reply ONLY with MISTRAL_STREAM_OK';
    const nonStream = await llm.gen(prompt);
    const normalizedA = nonStream.trim().replace(/[^A-Za-z0-9_]/g, '').toUpperCase();
    let streamed = '';
    for await (const chunk of llm.genStream(prompt)) streamed += chunk;
    const normalizedB = streamed.trim().replace(/[^A-Za-z0-9_]/g, '').toUpperCase();
    expect(normalizedA).toBe(normalizedB);
    expect(normalizedA.length).toBeGreaterThan(0);
  }, 30000);

  it('returns a toolCalls array (may be empty) on genWithTools', async () => {
    if (!process.env.MISTRAL_API_KEY) {
      throw new Error('MISTRAL_API_KEY is required for this test');
    }
    const base = process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai';
    const model = process.env.MISTRAL_MODEL || 'mistral-small-latest';
    const llm = llmMistral({ baseURL: base, apiKey: process.env.MISTRAL_API_KEY!, model });
    const tools: any = [{
      name: 'astro.get_sign',
      description: 'Return sign for birthdate',
      parameters: { type: 'object', properties: { birthdate: { type: 'string' } }, required: ['birthdate'] }
    }];
    const res = await llm.genWithTools('Find the astrological sign for 1993-07-11 using available tools.', tools);
    expect(Array.isArray(res.toolCalls)).toBe(true);
  }, 60000);
});


