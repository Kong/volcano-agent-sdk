import { describe, it, expect, vi, beforeEach } from 'vitest';
import { agent, llmOpenAI } from '../dist/volcano-agent-sdk.js';

const createMockLLM = (responses: string[]) => {
  let callCount = 0;
  return {
    id: 'mock-llm',
    model: 'mock-model',
    client: {},
    gen: async (prompt: string) => {
      const response = responses[callCount % responses.length];
      callCount++;
      return response;
    },
    genWithTools: async () => ({ toolCalls: [] }),
    genStream: async function* () { yield 'test'; }
  };
};

describe('Advanced Workflow Patterns', () => {
  describe('Parallel Execution', () => {
    it('executes multiple steps in parallel (array mode)', async () => {
      const llm = createMockLLM(['Step 1 output', 'Step 2 output', 'Step 3 output']);
      
      const results = await agent({ llm: llm as any , hideProgress: true })
        .parallel([
          { prompt: 'Task 1' },
          { prompt: 'Task 2' },
          { prompt: 'Task 3' }
        ])
        .run();
      
      expect(results.length).toBe(1);
      expect(results[0].parallelResults).toBeDefined();
      expect(results[0].parallelResults?.length).toBe(3);
      expect(results[0].parallelResults?.[0].llmOutput).toBe('Step 1 output');
      expect(results[0].parallelResults?.[1].llmOutput).toBe('Step 2 output');
      expect(results[0].parallelResults?.[2].llmOutput).toBe('Step 3 output');
    });

    it('executes multiple steps in parallel (named dictionary mode)', async () => {
      const llm = createMockLLM(['Sentiment: positive', 'Entities: AI,ML', 'Summary: tech']);
      
      const results = await agent({ llm: llm as any , hideProgress: true })
        .parallel({
          sentiment: { prompt: 'Analyze sentiment' },
          entities: { prompt: 'Extract entities' },
          summary: { prompt: 'Summarize' }
        })
        .run();
      
      expect(results.length).toBe(1);
      expect(results[0].parallel).toBeDefined();
      expect(results[0].parallel?.sentiment.llmOutput).toBe('Sentiment: positive');
      expect(results[0].parallel?.entities.llmOutput).toBe('Entities: AI,ML');
      expect(results[0].parallel?.summary.llmOutput).toBe('Summary: tech');
    });
  });

  describe('Conditional Branching', () => {
    it('branches based on condition (true branch)', async () => {
      const llm = createMockLLM(['YES', 'Spam detected']);
      
      const results = await agent({ llm: llm as any , hideProgress: true })
        .then({ prompt: 'Is this spam? Reply YES or NO' })
        .branch(
          (history) => history[0].llmOutput?.includes('YES') || false,
          {
            true: (a) => a.then({ prompt: 'Handle spam' }),
            false: (a) => a.then({ prompt: 'Handle normal email' })
          }
        )
        .run();
      
      expect(results.length).toBe(2); // First step + branch result
      expect(results[0].llmOutput).toBe('YES');
      expect(results[1].llmOutput).toBe('Spam detected');
    });

    it('branches based on condition (false branch)', async () => {
      const llm = createMockLLM(['NO', 'Normal email processed']);
      
      const results = await agent({ llm: llm as any , hideProgress: true })
        .then({ prompt: 'Is this spam? Reply YES or NO' })
        .branch(
          (history) => history[0].llmOutput?.includes('YES') || false,
          {
            true: (a) => a.then({ prompt: 'Handle spam' }),
            false: (a) => a.then({ prompt: 'Handle normal email' })
          }
        )
        .run();
      
      expect(results.length).toBe(2);
      expect(results[0].llmOutput).toBe('NO');
      expect(results[1].llmOutput).toBe('Normal email processed');
    });

    it('switches based on value', async () => {
      const llm = createMockLLM(['HIGH', 'Escalated to manager']);
      
      const results = await agent({ llm: llm as any , hideProgress: true })
        .then({ prompt: 'Classify priority: HIGH, MEDIUM, or LOW' })
        .switch(
          (history) => history[0].llmOutput?.trim() || '',
          {
            'HIGH': (a) => a.then({ prompt: 'Escalate' }),
            'MEDIUM': (a) => a.then({ prompt: 'Queue' }),
            'LOW': (a) => a.then({ prompt: 'Auto-reply' }),
            default: (a) => a.then({ prompt: 'Unknown priority' })
          }
        )
        .run();
      
      expect(results.length).toBe(2);
      expect(results[0].llmOutput).toBe('HIGH');
      expect(results[1].llmOutput).toBe('Escalated to manager');
    });

    it('uses default case when no match', async () => {
      const llm = createMockLLM(['UNKNOWN', 'Handled by default']);
      
      const results = await agent({ llm: llm as any , hideProgress: true })
        .then({ prompt: 'Classify' })
        .switch(
          (history) => history[0].llmOutput?.trim() || '',
          {
            'HIGH': (a) => a.then({ prompt: 'Escalate' }),
            default: (a) => a.then({ prompt: 'Default handler' })
          }
        )
        .run();
      
      expect(results.length).toBe(2);
      expect(results[1].llmOutput).toBe('Handled by default');
    });
  });

  describe('Loops', () => {
    it('while loop executes until condition is false', async () => {
      const responses = ['CONTINUE', 'CONTINUE', 'COMPLETE'];
      const llm = createMockLLM(responses);
      
      const results = await agent({ llm: llm as any , hideProgress: true })
        .while(
          (history) => {
            if (history.length === 0) return true;
            const last = history[history.length - 1];
            return !last.llmOutput?.includes('COMPLETE');
          },
          (a) => a.then({ prompt: 'Process chunk' }),
          { maxIterations: 5 }
        )
        .run();
      
      expect(results.length).toBe(3); // Should have run 3 times
      expect(results[0].llmOutput).toBe('CONTINUE');
      expect(results[1].llmOutput).toBe('CONTINUE');
      expect(results[2].llmOutput).toBe('COMPLETE');
    });

    it('while loop respects maxIterations', async () => {
      const llm = createMockLLM(['CONTINUE']); // Always CONTINUE
      
      const results = await agent({ llm: llm as any , hideProgress: true })
        .while(
          () => true, // Always true
          (a) => a.then({ prompt: 'Process' }),
          { maxIterations: 3 }
        )
        .run();
      
      expect(results.length).toBe(3); // Should stop at max
    });

    it('forEach processes all items', async () => {
      const llm = createMockLLM(['Email 1 sent', 'Email 2 sent', 'Email 3 sent']);
      const emails = ['alice@test.com', 'bob@test.com', 'charlie@test.com'];
      
      const results = await agent({ llm: llm as any , hideProgress: true })
        .forEach(emails, (email, a) => 
          a.then({ prompt: `Send email to ${email}` })
        )
        .run();
      
      expect(results.length).toBe(3);
      expect(results[0].llmOutput).toBe('Email 1 sent');
      expect(results[1].llmOutput).toBe('Email 2 sent');
      expect(results[2].llmOutput).toBe('Email 3 sent');
    });

    it('retryUntil succeeds on first try', async () => {
      const llm = createMockLLM(['VALID haiku']);
      
      const results = await agent({ llm: llm as any , hideProgress: true })
        .retryUntil(
          (a) => a.then({ prompt: 'Generate haiku' }),
          (result) => result.llmOutput?.includes('VALID') || false,
          { maxAttempts: 3 }
        )
        .run();
      
      expect(results.length).toBe(1);
      expect(results[0].llmOutput).toBe('VALID haiku');
    });

    it('retryUntil retries until success', async () => {
      // Each retry creates a new sub-agent, so we need to track state externally
      let attemptCount = 0;
      const mockGen = async (prompt: string) => {
        attemptCount++;
        if (attemptCount < 3) return 'FAIL';
        return 'SUCCESS';
      };
      
      const llm = {
        id: 'mock-llm',
        model: 'mock-model',
        client: {},
        gen: mockGen,
        genWithTools: async () => ({ toolCalls: [] }),
        genStream: async function* () { yield 'test'; }
      };
      
      const results = await agent({ llm: llm as any , hideProgress: true })
        .retryUntil(
          (a) => a.then({ prompt: 'Generate haiku' }),
          (result) => result.llmOutput?.includes('SUCCESS') || false,
          { maxAttempts: 5 }
        )
        .run();
      
      expect(results.length).toBe(3); // 2 failures + 1 success
      expect(results[2].llmOutput).toBe('SUCCESS');
    });

    it('retryUntil throws after max attempts', async () => {
      // Create fresh mock that always returns FAIL
      const llm = {
        id: 'mock-llm',
        model: 'mock-model',
        client: {},
        gen: async (prompt: string) => 'FAIL', // Always returns FAIL
        genWithTools: async () => ({ toolCalls: [] }),
        genStream: async function* () { yield 'test'; }
      };
      
      await expect(
        agent({ llm: llm as any , hideProgress: true })
          .retryUntil(
            (a) => a.then({ prompt: 'Generate haiku' }),
            (result) => result.llmOutput?.includes('SUCCESS') || false,
            { maxAttempts: 2 }
          )
          .run()
      ).rejects.toThrow(/Failed to meet success condition/);
    });
  });

  describe('Sub-Agent Composition', () => {
    it('runs a sub-agent and includes its results', async () => {
      const llm = createMockLLM(['Intent extracted', 'Level determined', 'Response drafted']);
      
      // Define a reusable sub-agent
      const emailAnalyzer = agent({ llm: llm as any , hideProgress: true })
        .then({ prompt: 'Extract intent' })
        .then({ prompt: 'Classify urgency' });
      
      const results = await agent({ llm: llm as any , hideProgress: true })
        .runAgent(emailAnalyzer)
        .then({ prompt: 'Draft response' })
        .run();
      
      expect(results.length).toBe(3); // 2 from sub-agent + 1 main
      expect(results[0].llmOutput).toBe('Intent extracted');
      expect(results[1].llmOutput).toBe('Level determined');
      expect(results[2].llmOutput).toBe('Response drafted');
    });

    it('composes multiple sub-agents', async () => {
      const llm = createMockLLM(['R1', 'R2', 'R3', 'R4']);
      
      const agent1 = agent({ llm: llm as any , hideProgress: true }).then({ prompt: 'Step A' });
      const agent2 = agent({ llm: llm as any , hideProgress: true }).then({ prompt: 'Step B' });
      
      const results = await agent({ llm: llm as any , hideProgress: true })
        .runAgent(agent1)
        .runAgent(agent2)
        .run();
      
      expect(results.length).toBe(2);
      expect(results[0].llmOutput).toBe('R1');
      expect(results[1].llmOutput).toBe('R2');
    });
  });

  describe('Combined Patterns', () => {
    it('combines parallel + branch + forEach', async () => {
      const llm = createMockLLM([
        'positive', 'negative', 'neutral', // parallel
        'YES', // branch condition
        'Item 1 processed', 'Item 2 processed' // forEach
      ]);
      
      const results = await agent({ llm: llm as any , hideProgress: true })
        .parallel({
          sentiment: { prompt: 'Analyze sentiment' },
          intent: { prompt: 'Extract intent' },
          category: { prompt: 'Categorize' }
        })
        .then({ prompt: 'Is urgent? YES/NO' })
        .branch(
          (h) => h[h.length - 1].llmOutput?.includes('YES') || false,
          {
            true: (a) => a.forEach(['item1', 'item2'], (item, ag) => 
              ag.then({ prompt: `Process ${item}` })
            ),
            false: (a) => a.then({ prompt: 'Queue for later' })
          }
        )
        .run();
      
      // 1 parallel step + 1 then + 2 forEach
      expect(results.length).toBe(4);
      expect(results[0].parallel).toBeDefined();
      expect(results[1].llmOutput).toBe('YES');
      expect(results[2].llmOutput).toBe('Item 1 processed');
      expect(results[3].llmOutput).toBe('Item 2 processed');
    });
  });
});
