import { describe, it, expect } from 'vitest';
import { agent } from '../dist/volcano-agent-sdk.js';

describe('agent run() with onStep callbacks', () => {
  it('provides step results via onStep callback as they complete', async () => {
    const stepResults: any[] = [];
    const llm: any = { 
      id: 'mock', 
      model: 'm', 
      client: {}, 
      gen: async (prompt: string) => `Response to: ${prompt}`, 
      genWithTools: async () => ({ content: '', toolCalls: [] }), 
      genStream: async function*(){} 
    };

    await agent({ llm, hideProgress: true })
      .then({ prompt: 'First step' })
      .then({ prompt: 'Second step' })
      .then({ prompt: 'Third step' })
      .run({ onStep: (step) => stepResults.push(step) });

    expect(stepResults).toHaveLength(3);
    expect(stepResults[0].prompt).toBe('First step');
    expect(stepResults[1].prompt).toBe('Second step');
    expect(stepResults[2].prompt).toBe('Third step');
    expect(stepResults[0].llmOutput).toContain('First step');
    expect(stepResults[1].llmOutput).toContain('Second step');
    expect(stepResults[2].llmOutput).toContain('Third step');
  });

  it('provides results incrementally with timing information via onStep', async () => {
    const stepResults: any[] = [];
    const timestamps: number[] = [];
    const llm: any = { 
      id: 'mock', 
      model: 'm', 
      client: {}, 
      gen: async () => { 
        await new Promise(r => setTimeout(r, 10)); // Small delay to simulate work
        return 'OK'; 
      }, 
      genWithTools: async () => ({ content: '', toolCalls: [] }), 
      genStream: async function*(){} 
    };

    await agent({ llm, hideProgress: true })
      .then({ prompt: 'Step 1' })
      .then({ prompt: 'Step 2' })
      .run({ 
        onStep: (step) => {
          timestamps.push(Date.now());
          stepResults.push(step);
        }
      });

    expect(stepResults).toHaveLength(2);
    expect(timestamps).toHaveLength(2);
    // Verify steps are provided incrementally, not all at once
    expect(timestamps[1] - timestamps[0]).toBeGreaterThan(5);
    expect(stepResults[0].durationMs).toBeGreaterThan(0);
    expect(stepResults[1].durationMs).toBeGreaterThan(0);
  });

  it('onStep callback supports pre/post hooks', async () => {
    const events: string[] = [];
    const stepResults: any[] = [];
    const llm: any = { 
      id: 'mock', 
      model: 'm', 
      client: {}, 
      gen: async () => 'OK', 
      genWithTools: async () => ({ content: '', toolCalls: [] }), 
      genStream: async function*(){} 
    };

    await agent({ llm, hideProgress: true })
      .then({ 
        prompt: 'Test with hooks',
        pre: () => { events.push('pre-executed'); },
        post: () => { events.push('post-executed'); }
      })
      .run({ onStep: (step) => stepResults.push(step) });

    expect(events).toEqual(['pre-executed', 'post-executed']);
    expect(stepResults).toHaveLength(1);
    expect(stepResults[0].llmOutput).toBe('OK');
  });

  it('onStep callback works with LLM-only steps', async () => {
    const stepResults: any[] = [];
    const llm: any = { 
      id: 'mock', 
      model: 'm', 
      client: {}, 
      gen: async (prompt: string) => `Processed: ${prompt}`, 
      genWithTools: async () => ({ content: '', toolCalls: [] }), 
      genStream: async function*(){} 
    };

    await agent({ llm, hideProgress: true })
      .then({ prompt: 'Analyze this data' }) // LLM-only step (no mcps)
      .run({ onStep: (step) => stepResults.push(step) });

    expect(stepResults).toHaveLength(1);
    expect(stepResults[0].prompt).toBe('Analyze this data');
    expect(stepResults[0].llmOutput).toBe('Processed: Analyze this data');
    expect(typeof stepResults[0].durationMs).toBe('number');
  });

  it('run() calls onStep callback correctly with indices', async () => {
    const loggedSteps: any[] = [];
    const loggedIndices: number[] = [];
    
    const llm: any = { 
      id: 'mock', 
      model: 'm', 
      client: {}, 
      gen: async (prompt: string) => `Response: ${prompt}`, 
      genWithTools: async () => ({ content: '', toolCalls: [] }), 
      genStream: async function*(){} 
    };

    const results = await agent({ llm, hideProgress: true })
      .then({ prompt: 'First' })
      .then({ prompt: 'Second' })
      .run({ 
        onStep: (step, stepIndex) => {
          loggedSteps.push(step);
          loggedIndices.push(stepIndex);
        }
      });

    // Verify onStep callback works correctly
    expect(results).toHaveLength(2);
    expect(loggedSteps).toHaveLength(2);
    expect(loggedIndices).toEqual([0, 1]);
    expect(loggedSteps[0].prompt).toBe('First');
    expect(loggedSteps[1].prompt).toBe('Second');
  });

  it('prevents concurrent run() calls', async () => {
    const llm: any = { 
      id: 'mock', 
      model: 'm', 
      client: {}, 
      gen: async () => { 
        await new Promise(r => setTimeout(r, 50)); // Delay to allow concurrent attempt
        return 'OK'; 
      }, 
      genWithTools: async () => ({ content: '', toolCalls: [] }), 
      genStream: async function*(){} 
    };

    const workflow = agent({ llm, hideProgress: true }).then({ prompt: 'test' });
    
    let concurrencyError: any;
    
    // Start first run
    const promise1 = workflow.run();
    
    // Try to start second run while first is running
    try {
      await workflow.run();
    } catch (e) {
      concurrencyError = e;
    }
    
    // Wait for first run to complete
    await promise1;

    expect(concurrencyError?.name).toBe('AgentConcurrencyError');
  });
});
