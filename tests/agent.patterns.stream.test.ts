import { describe, it, expect } from 'vitest';
import { agent, llmOpenAI } from '../src/volcano-agent-sdk.js';

// Mock LLM for testing
const mockLlm = {
  model: 'test-model',
  async gen(prompt: string): Promise<string> {
    if (prompt.includes('Step 1')) return 'Result from step 1';
    if (prompt.includes('Step 2')) return 'Result from step 2';
    if (prompt.includes('parallel-a')) return 'Parallel A result';
    if (prompt.includes('parallel-b')) return 'Parallel B result';
    if (prompt.includes('true branch')) return 'True branch result';
    if (prompt.includes('false branch')) return 'False branch result';
    if (prompt.includes('item 1')) return 'Processed item 1';
    if (prompt.includes('item 2')) return 'Processed item 2';
    if (prompt.includes('nested')) return 'Nested result';
    return 'default response';
  }
};

describe('Pattern handling in run() with onStep', () => {
  it('parallel() pattern works with run() and onStep callback', async () => {
    const results: any[] = [];
    
    const workflow = agent({ llm: mockLlm })
      .parallel([
        { prompt: 'parallel-a task' },
        { prompt: 'parallel-b task' }
      ]);
    
    await workflow.run({ onStep: (step) => results.push(step) });
    
    expect(results.length).toBe(1);
    expect(results[0].parallelResults).toBeDefined();
    expect(results[0].parallelResults?.length).toBe(2);
  });

  it('branch() pattern works with run() and onStep callback', async () => {
    const results: any[] = [];
    
    const workflow = agent({ llm: mockLlm })
      .branch(
        (history) => true,
        {
          true: (a) => a.then({ prompt: 'true branch task' }),
          false: (a) => a.then({ prompt: 'false branch task' })
        }
      );
    
    await workflow.run({ onStep: (step) => results.push(step) });
    
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].llmOutput).toContain('True branch result');
  });

  it('forEach() pattern works with run() and onStep callback', async () => {
    const results: any[] = [];
    const items = ['item 1', 'item 2'];
    
    const workflow = agent({ llm: mockLlm })
      .forEach(items, (item, a) => a.then({ prompt: `Process ${item}` }));
    
    await workflow.run({ onStep: (step) => results.push(step) });
    
    expect(results.length).toBe(2);
    expect(results[0].llmOutput).toContain('item 1');
    expect(results[1].llmOutput).toContain('item 2');
  });

  it('runAgent() pattern works with run() and onStep callback', async () => {
    const results: any[] = [];
    
    const subAgent = agent({ llm: mockLlm })
      .then({ prompt: 'nested task' });
    
    const workflow = agent({ llm: mockLlm })
      .runAgent(subAgent);
    
    await workflow.run({ onStep: (step) => results.push(step) });
    
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].llmOutput).toBeDefined();
  });

  it('combined patterns work with run() and onStep callback', async () => {
    const results: any[] = [];
    
    const workflow = agent({ llm: mockLlm })
      .then({ prompt: 'Step 1' })
      .parallel([
        { prompt: 'parallel-a task' },
        { prompt: 'parallel-b task' }
      ])
      .then({ prompt: 'Step 2' });
    
    await workflow.run({ onStep: (step) => results.push(step) });
    
    expect(results.length).toBe(3);
    expect(results[0].llmOutput).toContain('step 1');
    expect(results[1].parallelResults).toBeDefined();
    expect(results[2].llmOutput).toContain('step 2');
  });
});

