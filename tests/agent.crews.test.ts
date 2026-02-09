import { describe, it, expect } from 'vitest';
import { agent } from '../src/volcano-agent-sdk.js';
import type { LLMHandle } from '../src/llms/types.js';

describe('Multi-agent crews (automatic agent selection)', () => {
  it('coordinator selects and delegates to appropriate agent', async () => {
    const researcherCalled = { called: false, task: '' };
    const writerCalled = { called: false, task: '' };
    
    const mockLLM: LLMHandle = {
      id: 'mock-coordinator',
      model: 'test',
      client: null,
      gen: async (prompt: string) => {
        if (prompt.includes('You can coordinate work') && prompt.includes('Write a blog post')) {
          // First decision: use researcher
          if (!researcherCalled.called) {
            return 'I need research first. USE researcher: Research quantum computing basics';
          }
          // After researcher has been called, check if this is a followup
          if (prompt.includes("Agent 'researcher' completed their task")) {
            return 'DONE: Blog post created successfully based on research.';
          }
        }
        return 'Test response';
      },
      genWithTools: async () => ({ llmOutput: 'Test', toolCalls: [] }),
    };

    const researcherLLM: LLMHandle = {
      id: 'researcher-llm',
      model: 'test',
      client: null,
      gen: async (prompt: string) => {
        console.log('[TEST] Researcher received prompt:', prompt);
        researcherCalled.called = true;
        researcherCalled.task = prompt;
        return 'Quantum computing uses qubits and superposition.';
      },
      genWithTools: async () => ({ llmOutput: 'Test', toolCalls: [] }),
    };

    const writerLLM: LLMHandle = {
      id: 'writer-llm',
      model: 'test',
      client: null,
      gen: async (prompt: string) => {
        writerCalled.called = true;
        writerCalled.task = prompt;
        return 'An engaging blog post about quantum computing...';
      },
      genWithTools: async () => ({ llmOutput: 'Test', toolCalls: [] }),
    };

    const researcher = agent({
      llm: researcherLLM,
      name: 'researcher',
      description: 'Analyzes topics and identifies key facts',
      hideProgress: true
    }).then({ prompt: 'Research the given topic and provide key facts.' });

    const writer = agent({
      llm: writerLLM,
      name: 'writer',
      description: 'Transforms research into engaging content',
      hideProgress: true
    }).then({ prompt: 'Write the content based on the research.' });

    const results = await agent({ llm: mockLLM , hideProgress: true })
      .then({
        prompt: 'Write a blog post about quantum computing',
        agents: [researcher, writer]
      })
      .run();

    // Verify researcher was called
    expect(researcherCalled.called).toBe(true);
    // The task should contain the research prompt plus context
    expect(researcherCalled.task).toContain('Research the given topic');
    expect(researcherCalled.task).toContain('quantum computing basics');
    
    // Verify final output (DONE: prefix is stripped)
    expect(results[0].llmOutput).toBe('Blog post created successfully based on research.');
    
    // Verify agentCalls were tracked
    expect((results[0] as any).agentCalls).toBeDefined();
    expect((results[0] as any).agentCalls.length).toBeGreaterThan(0);
    expect((results[0] as any).agentCalls[0].name).toBe('researcher');
  });

  it('handles multiple agent calls in sequence', async () => {
    let callCount = 0;
    
    const coordinatorLLM: LLMHandle = {
      id: 'coordinator',
      model: 'test',
      client: null,
      gen: async (prompt: string) => {
        callCount++;
        if (callCount === 1) {
          return 'USE researcher: Research AI trends';
        } else if (callCount === 2 && prompt.includes("Agent 'researcher' completed their task")) {
          return 'USE writer: Write article about AI trends';
        } else if (callCount === 3 && prompt.includes("Agent 'writer' completed their task")) {
          return 'DONE: Article complete and polished.';
        }
      },
      genWithTools: async () => ({ llmOutput: 'Test', toolCalls: [] }),
    };

    const researcher = agent({
      llm: {
        id: 'researcher-llm',
        model: 'test',
        client: null,
        gen: async () => 'AI trends include LLMs, agents, and automation.',
        genWithTools: async () => ({ llmOutput: 'Test', toolCalls: [] }),
      },
      hideProgress: true,
      name: 'researcher',
      description: 'Researches topics'
    }).then({ prompt: 'Research the given topic' });

    const writer = agent({
      llm: {
        id: 'writer-llm',
        model: 'test',
        client: null,
        gen: async () => 'A compelling article about AI trends...',
        genWithTools: async () => ({ llmOutput: 'Test', toolCalls: [] }),
      },
      hideProgress: true,
      name: 'writer',
      description: 'Writes content'
    }).then({ prompt: 'Write the content' });

    const results = await agent({ llm: coordinatorLLM , hideProgress: true })
      .then({
        prompt: 'Create an article about AI',
        agents: [researcher, writer]
      })
      .run();

    // Verify both agents were called
    expect((results[0] as any).agentCalls).toHaveLength(2);
    expect((results[0] as any).agentCalls[0].name).toBe('researcher');
    expect((results[0] as any).agentCalls[1].name).toBe('writer');
    
    expect(results[0].llmOutput).toBe('Article complete and polished.');
  });

  it('handles agent not found error gracefully', async () => {
    let callCount = 0;
    
    const coordinatorLLM: LLMHandle = {
      id: 'coordinator',
      model: 'test',
      client: null,
      gen: async (prompt: string) => {
        callCount++;
        if (callCount === 1) {
          return 'USE nonexistent: Do something';
        } else if (callCount === 2) {
          // After error message, try valid agent
          return 'USE researcher: Research topic';
        } else {
          return 'DONE: Task completed.';
        }
      },
      genWithTools: async () => ({ llmOutput: 'Test', toolCalls: [] }),
    };

    const researcher = agent({
      llm: {
        id: 'researcher-llm',
        model: 'test',
        client: null,
        gen: async () => 'Research results',
        genWithTools: async () => ({ llmOutput: 'Test', toolCalls: [] }),
      },
      hideProgress: true,
      name: 'researcher',
      description: 'Researches topics'
    }).then({ prompt: 'Research the topic' });

    const results = await agent({ llm: coordinatorLLM , hideProgress: true })
      .then({
        prompt: 'Test error handling',
        agents: [researcher]
      })
      .run();

    // Should recover from error and complete
    expect(results[0].llmOutput).toBe('Task completed.');
  });

  it('works with run() and onStep callback', async () => {
    const agentsCalled: string[] = [];
    let coordinatorCallCount = 0;
    
    const coordinatorLLM: LLMHandle = {
      id: 'coordinator',
      model: 'test',
      client: null,
      gen: async (prompt: string) => {
        coordinatorCallCount++;
        if (coordinatorCallCount === 1) {
          // First call: delegate to researcher
          return 'USE researcher: Research topic';
        } else {
          // Second call: task complete
          return 'DONE: Complete.';
        }
      },
      genWithTools: async () => ({ llmOutput: 'Test', toolCalls: [] }),
    };

    const researcher = agent({
      llm: {
        id: 'researcher-llm',
        model: 'test',
        client: null,
        gen: async () => {
          agentsCalled.push('researcher');
          return 'Research done';
        },
        genWithTools: async () => ({ llmOutput: 'Test', toolCalls: [] }),
      },
      hideProgress: true,
      name: 'researcher',
      description: 'Researches'
    }).then({ prompt: 'Research' });

    const results: any[] = [];
    await agent({ llm: coordinatorLLM , hideProgress: true })
      .then({
        prompt: 'Test',
        agents: [researcher]
      })
      .run({ onStep: (step) => results.push(step) });

    expect(agentsCalled).toContain('researcher');
    expect(results[0].llmOutput).toBe('Complete.');
  });

  it('stops when coordinator says DONE (safety limit 20)', async () => {
    let iterations = 0;
    
    const coordinatorLLM: LLMHandle = {
      id: 'coordinator',
      model: 'test',
      client: null,
      gen: async () => {
        iterations++;
        // Never says DONE, keeps requesting agents
        return 'USE researcher: Keep researching';
      },
      genWithTools: async () => ({ llmOutput: 'Test', toolCalls: [] }),
    };

    const researcher = agent({
      llm: {
        id: 'researcher-llm',
        model: 'test',
        client: null,
        gen: async () => 'Research result',
        genWithTools: async () => ({ llmOutput: 'Test', toolCalls: [] }),
      },
      hideProgress: true,
      name: 'researcher',
      description: 'Researches'
    });

    const results = await agent({ llm: coordinatorLLM , hideProgress: true })
      .then({
        prompt: 'Test',
        agents: [researcher],
        // Coordinator decides when done (safety limit: 20)
      })
      .run();

    // Should stop at safety limit (10 iterations)
    expect(iterations).toBe(10);
    expect(results[0].llmOutput).toBeTruthy();
    expect((results[0] as any).agentCalls).toBeDefined();
  });

  it('handles agents missing name or description', async () => {
    const mockLLM: LLMHandle = {
      id: 'mock',
      model: 'test',
      client: null,
      gen: async () => 'Test',
      genWithTools: async () => ({ llmOutput: 'Test', toolCalls: [] }),
    };

    const invalidAgent = agent({ llm: mockLLM, hideProgress: true }); // No name or description

    const results = await agent({ llm: mockLLM , hideProgress: true })
      .then({
        prompt: 'Test',
        agents: [invalidAgent]
      })
      .run();

    expect(results[0].llmOutput).toContain('No agents available or agents missing name/description');
  });

  it('agent can have multi-step workflow when delegated to', async () => {
    const steps: string[] = [];
    
    const coordinatorLLM: LLMHandle = {
      id: 'coordinator',
      model: 'test',
      client: null,
      gen: async (prompt: string) => {
        if (!prompt.includes('completed')) {
          return 'USE researcher: Research quantum computing';
        }
        return 'DONE: Research completed.';
      },
      genWithTools: async () => ({ llmOutput: 'Test', toolCalls: [] }),
    };

    const researcherLLM: LLMHandle = {
      id: 'researcher-llm',
      model: 'test',
      client: null,
      gen: async (prompt: string) => {
        steps.push('researcher-' + prompt.substring(0, 20));
        return 'Step result';
      },
      genWithTools: async () => ({ llmOutput: 'Test', toolCalls: [] }),
    };

    // Researcher has multi-step workflow
    const researcher = agent({
      llm: researcherLLM,
      hideProgress: true,
      name: 'researcher',
      description: 'Researches topics'
    })
      .then({ prompt: 'Find sources' })
      .then({ prompt: 'Analyze data' })
      .then({ prompt: 'Summarize findings' });

    const results = await agent({ llm: coordinatorLLM , hideProgress: true })
      .then({
        prompt: 'Get research',
        agents: [researcher]
      })
      .run();

    // Researcher should have executed all 3 steps
    // When delegated to, it runs from the prompt given, not pre-configured steps
    expect(results[0].llmOutput).toBe('Research completed.');
  });
});

