import { describe, it, expect } from 'vitest';
import { agent } from '../src/volcano-agent-sdk.js';

function createMockLLM(responses: string[] = ['response']) {
  let callIndex = 0;
  return {
    id: 'test-llm',
    model: 'test-model',
    client: {},
    gen: async () => responses[callIndex++] || responses[responses.length - 1],
    genWithTools: async () => ({ content: responses[callIndex++] || responses[responses.length - 1], toolCalls: [] }),
    genStream: async function*() { yield 'test'; },
    getUsage: () => ({ inputTokens: 10, outputTokens: 10, totalTokens: 20 })
  } as any;
}

describe('Agent Step Counting', () => {
  it('counts regular steps correctly', () => {
    const llm = createMockLLM();
    const testAgent = agent({ llm, hideProgress: true })
      .then({ prompt: 'Step 1' })
      .then({ prompt: 'Step 2' })
      .then({ prompt: 'Step 3' });
    
    const steps = (testAgent as any)._getSteps();
    expect(steps.length).toBe(3);
  });

  it('recursively counts steps in runAgent sub-agents', () => {
    const llm = createMockLLM();
    
    // Sub-agent with 2 steps
    const subAgent = agent({ llm, hideProgress: true })
      .then({ prompt: 'Sub step 1' })
      .then({ prompt: 'Sub step 2' });
    
    // Main agent: 1 + runAgent(2) + 1 = 4 total
    const mainAgent = agent({ llm, hideProgress: true })
      .then({ prompt: 'Main step 1' })
      .runAgent(subAgent)
      .then({ prompt: 'Main step 3' });
    
    const steps = (mainAgent as any)._getSteps();
    expect(steps.length).toBe(3); // 3 step definitions
    
    // But total execution steps should be 4
    // This would be tested by running and checking progress output
  });

  it('recursively counts steps with multiple runAgent calls', () => {
    const llm = createMockLLM();
    
    // First sub-agent with 2 steps
    const analyzer = agent({ llm, hideProgress: true })
      .then({ prompt: 'Analyze sentiment' })
      .then({ prompt: 'Extract topics' });
    
    // Second sub-agent with 2 steps
    const responder = agent({ llm, hideProgress: true })
      .then({ prompt: 'Write response' })
      .then({ prompt: 'Make concise' });
    
    // Main agent: 1 + runAgent(2) + runAgent(2) + 1 = 6 total
    const mainAgent = agent({ llm, hideProgress: true })
      .then({ prompt: 'Step 1' })
      .runAgent(analyzer)
      .runAgent(responder)
      .then({ prompt: 'Step 6' });
    
    const steps = (mainAgent as any)._getSteps();
    expect(steps.length).toBe(4); // 4 step definitions (1 + runAgent + runAgent + 1)
  });

  it('verifies progress shows correct step numbers with runAgent', async () => {
    const llm = createMockLLM(['response1', 'response2', 'response3', 'response4', 'response5', 'response6']);
    
    const outputs: string[] = [];
    const originalLog = console.log.bind(console);
    console.log = ((...args: any[]) => {
      outputs.push(args.join(' '));
      originalLog(...args);
    }) as any;
    
    const analyzer = agent({ llm, name: 'analyzer' })
      .then({ prompt: 'Analyze' })
      .then({ prompt: 'Extract' });
    
    const responder = agent({ llm, name: 'responder' })
      .then({ prompt: 'Write' })
      .then({ prompt: 'Polish' });
    
    try {
      await agent({ llm })
        .then({ prompt: 'Input' })
        .runAgent(analyzer)
        .runAgent(responder)
        .then({ prompt: 'Final' })
        .run();
      
      // Restore console.log
      console.log = originalLog;
      
      const combined = outputs.join('\n');
      
      // With structured logs, the main agent executes its steps and sub-agents show their own steps
      // Main agent step 1
      expect(combined).toMatch(/agent="untitled" step=1 status=init.*Input/);
      
      // Analyzer sub-agent steps (shows as its own agent with step=1 and step=2)
      expect(combined).toMatch(/agent="analyzer" step=1 status=init.*Analyze/);
      expect(combined).toMatch(/agent="analyzer" step=2 status=init.*Extract/);
      
      // Responder sub-agent steps (shows as its own agent with step=1 and step=2)
      expect(combined).toMatch(/agent="responder" step=1 status=init.*Write/);
      expect(combined).toMatch(/agent="responder" step=2 status=init.*Polish/);
      
      // Final main agent step (step=6 because it counts all steps including sub-agent steps)
      expect(combined).toMatch(/agent="untitled" step=6 status=init.*Final/);
      
      // Verify the agent complete shows 6 total tokens
      expect(combined).toMatch(/agent complete.*6 tokens/);
    } finally {
      console.log = originalLog;
    }
  });
});

