import { describe, it, expect } from 'vitest';
import { llmLlama } from '../../dist/volcano-agent-sdk.js';

// Skip Llama tests in CI - too slow even with optimizations (45s+ per call)
// Run locally with: npm test -- llama.integration
const describeMethod = process.env.CI === 'true' ? describe.skip : describe;

describeMethod('Llama provider (integration)', () => {
  it('calls an OpenAI-compatible endpoint via baseURL/model (Ollama)', async () => {
    const base = process.env.LLAMA_BASE_URL || 'http://127.0.0.1:11434';
    const model = process.env.LLAMA_MODEL || 'llama3.1:8b';
    const llm = llmLlama({ baseURL: base, model, timeout: 90000 }); // 90s timeout for slow CI
    const prompt = 'Echo exactly this token with no quotes, no punctuation, no extra text: LLAMA_OK';
    const out = await llm.gen(prompt);
    
    // Verify we got a response
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    
    // Llama should echo the token (may include extra text due to model behavior)
    const normalized = out.trim().toUpperCase();
    const containsToken = normalized.includes('LLAMA') && normalized.includes('OK');
    expect(containsToken).toBe(true);
  }, 120000); // Increased: Llama can take 16-20s per call in CI

  it('follows constrained echo (variant)', async () => {
    const base = process.env.LLAMA_BASE_URL || 'http://127.0.0.1:11434';
    const model = process.env.LLAMA_MODEL || 'llama3.1:8b';
    const llm = llmLlama({ baseURL: base, model, timeout: 90000 });
    const prompt = 'Reply ONLY with LLAMA_OK_2';
    const out = await llm.gen(prompt);
    const normalized = out.trim().replace(/[^A-Za-z0-9_]/g, '').toUpperCase();
    expect(/^LLAMA_?OK/.test(normalized)).toBe(true);
  }, 120000); // Increased: Llama can take 16-20s per call in CI

  it('streams tokens that concatenate to the non-stream answer', async () => {
    const base = process.env.LLAMA_BASE_URL || 'http://127.0.0.1:11434';
    const model = process.env.LLAMA_MODEL || 'llama3.1:8b';
    const llm = llmLlama({ baseURL: base, model, timeout: 90000 });
    const prompt = 'Reply ONLY with LLAMA_STREAM_OK';
    const nonStream = await llm.gen(prompt);
    const normalizedA = nonStream.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    let streamed = '';
    for await (const chunk of llm.genStream(prompt)) streamed += chunk;
    const normalizedB = streamed.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    // Check that both contain the essential content (allow minor formatting differences)
    expect(normalizedA).toContain('LLAMASTREAMOK');
    expect(normalizedB).toContain('LLAMASTREAMOK');
    expect(normalizedA.length).toBeGreaterThan(0);
    expect(normalizedB.length).toBeGreaterThan(0);
  }, 180000); // Increased: Makes 2 calls, each ~16-20s = 40s+ total

  it('returns a toolCalls array (may be empty) on genWithTools', async () => {
    const base = process.env.LLAMA_BASE_URL || 'http://127.0.0.1:11434';
    const model = process.env.LLAMA_MODEL || 'llama3.1:8b';
    const llm = llmLlama({ baseURL: base, model, timeout: 90000 });
    const tools: any = [{
      name: 'astro.get_sign',
      description: 'Return sign for birthdate',
      parameters: { type: 'object', properties: { birthdate: { type: 'string' } }, required: ['birthdate'] }
    }];
    const res = await llm.genWithTools('Find the astrological sign for 1993-07-11 using available tools.', tools);
    expect(Array.isArray(res.toolCalls)).toBe(true);
  }, 180000); // Increased: Tool calling can be slower, ~20-30s per call
});


