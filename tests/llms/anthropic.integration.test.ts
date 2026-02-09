import { describe, it, expect } from 'vitest';
import { llmAnthropic } from '../../dist/volcano-agent-sdk.js';

describe('Anthropic provider (integration)', () => {
  it('calls Anthropic with live API when ANTHROPIC_API_KEY is set', async () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is required for this test');
    }
    const llm = llmAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY!, model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307' });
    const prompt = 'Echo exactly this token with no quotes, no punctuation, no extra text: VOLCANO_SDK_OK';
    const out = await llm.gen(prompt);
    expect(typeof out).toBe('string');
    const normalized = out.trim().replace(/[^A-Za-z0-9_]/g, '').toUpperCase();
    expect(normalized).toBe('VOLCANO_SDK_OK');
  }, 20000);

  it('follows constrained echo', async () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is required for this test');
    }
    const llm = llmAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY!, model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307' });
    const prompt = 'Reply ONLY with ANTHROPIC_OK';
    const out = await llm.gen(prompt);
    const normalized = out.trim().replace(/[^A-Za-z0-9_]/g, '').toUpperCase();
    expect(/^ANTHROPIC_?OK/.test(normalized)).toBe(true);
  }, 30000);

  it('streams via fallback chunking equals non-stream', async () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is required for this test');
    }
    const llm = llmAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY!, model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307' });
    const prompt = 'Reply ONLY with ANTHROPIC_STREAM_OK';
    const nonStream = await llm.gen(prompt);
    const normalizedA = nonStream.trim().replace(/[^A-Za-z0-9_]/g, '').toUpperCase();
    let streamed = '';
    for await (const chunk of llm.genStream(prompt)) streamed += chunk;
    const normalizedB = streamed.trim().replace(/[^A-Za-z0-9_]/g, '').toUpperCase();
    expect(normalizedA).toBe(normalizedB);
    expect(normalizedA.length).toBeGreaterThan(0);
  }, 30000);

  it('returns a toolCalls array on genWithTools (Anthropic tools)', async () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is required for this test');
    }
    const llm = llmAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY!, model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307' });
    const tools: any = [{
      name: 'localhost_3211_mcp.get_sign',
      description: 'Return sign for birthdate',
      parameters: { type: 'object', properties: { birthdate: { type: 'string' } }, required: ['birthdate'] }
    }];
    const res = await llm.genWithTools('Find the astrological sign for 1993-07-11 using available tools.', tools);
    expect(Array.isArray(res.toolCalls)).toBe(true);
  }, 60000);
});


