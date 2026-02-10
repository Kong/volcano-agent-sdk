import { describe, it, expect, vi } from 'vitest';
import { agent } from '../dist/volcano-agent-sdk.js';

function makeFlakyLlm(failures: number, delayMs = 0) {
  let count = 0;
  return {
    id: 'OpenAI-flaky',
    model: 'fake',
    client: {},
    gen: async () => {
      if (delayMs) await new Promise(r => setTimeout(r, delayMs));
      count++;
      if (count <= failures) throw Object.assign(new Error('flaky'), { status: 500 });
      return 'OK';
    },
    genWithTools: async () => ({ content: '', toolCalls: [] }),
    genStream: async function* () {}
  } as any;
}

describe('agent retries', () => {
  it('immediate retry by default (delay 0)', async () => {
    vi.useFakeTimers();
    const llm = makeFlakyLlm(1);
    const p = agent({ llm, hideProgress: true })
      .then({ prompt: 'hello' })
      .run();
    await vi.runAllTimersAsync();
    const res = await p;
    expect(res[0].llmOutput).toBe('OK');
    vi.useRealTimers();
  });

  it('delayed retry waits configured seconds between attempts', async () => {
    vi.useFakeTimers();
    const llm = makeFlakyLlm(1);
    const p = agent({ llm, hideProgress: true, retry: { delay: 20, retries: 2 } })
      .then({ prompt: 'hello' })
      .run();
    await vi.advanceTimersByTimeAsync(20_000);
    const res = await p;
    expect(res[0].llmOutput).toBe('OK');
    vi.useRealTimers();
  });

  it('backoff retry increases wait time exponentially (seconds base)', async () => {
    vi.useFakeTimers();
    const llm = makeFlakyLlm(3);
    const p = agent({ llm, hideProgress: true, retry: { backoff: 2, retries: 4 } })
      .then({ prompt: 'hello' })
      .run();
    await vi.advanceTimersByTimeAsync(1_000 + 2_000 + 4_000);
    const res = await p;
    expect(res[0].llmOutput).toBe('OK');
    vi.useRealTimers();
  });

  it('per-step retry overrides agent retry', async () => {
    vi.useFakeTimers();
    const llm = makeFlakyLlm(1);
    const p = agent({ llm, hideProgress: true, retry: { delay: 20, retries: 2 } })
      .then({ prompt: 'A', retry: { delay: 0, retries: 2 } })
      .run();
    await vi.runAllTimersAsync();
    const res = await p;
    expect(res[0].llmOutput).toBe('OK');
    vi.useRealTimers();
  });

  it('throws if both delay and backoff are set at agent level', async () => {
    const llm = makeFlakyLlm(0);
    await expect(async () => {
      await agent({ llm, hideProgress: true, retry: { delay: 1, backoff: 2 } })
        .then({ prompt: 'x' })
        .run();
    }).rejects.toThrow();
  });

  it('throws if both delay and backoff are set at step level', async () => {
    const llm = makeFlakyLlm(0);
    await expect(async () => {
      await agent({ llm, hideProgress: true })
        .then({ prompt: 'x', retry: { delay: 1, backoff: 2 } })
        .run();
    }).rejects.toThrow();
  });
});
