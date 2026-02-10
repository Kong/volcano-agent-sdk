import { describe, it, expect, vi } from 'vitest';
import { agent } from '../dist/volcano-agent-sdk.js';

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

describe('Advanced Pattern Hooks', () => {
  describe('Parallel Hooks', () => {
    it('executes pre and post hooks for parallel', async () => {
      const llm = createMockLLM(['R1', 'R2']);
      const preCalled = vi.fn();
      const postCalled = vi.fn();
      
      await agent({ llm: llm as any , hideProgress: true })
        .parallel(
          [{ prompt: 'Task 1' }, { prompt: 'Task 2' }],
          {
            pre: preCalled,
            post: postCalled
          }
        )
        .run();
      
      expect(preCalled).toHaveBeenCalledTimes(1);
      expect(postCalled).toHaveBeenCalledTimes(1);
    });
  });

  describe('Branch Hooks', () => {
    it('executes pre and post hooks for branch', async () => {
      const llm = createMockLLM(['YES', 'Handled']);
      const preCalled = vi.fn();
      const postCalled = vi.fn();
      
      await agent({ llm: llm as any , hideProgress: true })
        .then({ prompt: 'Check' })
        .branch(
          (h) => h[0].llmOutput?.includes('YES') || false,
          {
            true: (a) => a.then({ prompt: 'Yes path' }),
            false: (a) => a.then({ prompt: 'No path' })
          },
          {
            pre: preCalled,
            post: postCalled
          }
        )
        .run();
      
      expect(preCalled).toHaveBeenCalledTimes(1);
      expect(postCalled).toHaveBeenCalledTimes(1);
    });
  });

  describe('Switch Hooks', () => {
    it('executes pre and post hooks for switch', async () => {
      const llm = createMockLLM(['HIGH', 'Escalated']);
      const preCalled = vi.fn();
      const postCalled = vi.fn();
      
      await agent({ llm: llm as any , hideProgress: true })
        .then({ prompt: 'Priority?' })
        .switch(
          (h) => h[0].llmOutput?.trim() || '',
          {
            'HIGH': (a) => a.then({ prompt: 'Escalate' }),
            'LOW': (a) => a.then({ prompt: 'Queue' }),
            default: (a) => a.then({ prompt: 'Default' })
          },
          {
            pre: preCalled,
            post: postCalled
          }
        )
        .run();
      
      expect(preCalled).toHaveBeenCalledTimes(1);
      expect(postCalled).toHaveBeenCalledTimes(1);
    });
  });

  describe('While Hooks', () => {
    it('executes pre and post hooks for while loop', async () => {
      const llm = createMockLLM(['CONTINUE', 'DONE']);
      const preCalled = vi.fn();
      const postCalled = vi.fn();
      let iterations = 0;
      
      await agent({ llm: llm as any , hideProgress: true })
        .while(
          (h) => {
            if (h.length === 0) return true;
            iterations++;
            return iterations < 2;
          },
          (a) => a.then({ prompt: 'Process' }),
          {
            maxIterations: 5,
            pre: preCalled,
            post: postCalled
          }
        )
        .run();
      
      expect(preCalled).toHaveBeenCalledTimes(1); // Once for entire loop
      expect(postCalled).toHaveBeenCalledTimes(1); // Once after loop completes
    });
  });

  describe('ForEach Hooks', () => {
    it('executes pre and post hooks for forEach', async () => {
      const llm = createMockLLM(['Item 1', 'Item 2', 'Item 3']);
      const preCalled = vi.fn();
      const postCalled = vi.fn();
      
      await agent({ llm: llm as any , hideProgress: true })
        .forEach(
          ['a', 'b', 'c'],
          (item, a) => a.then({ prompt: `Process ${item}` }),
          {
            pre: preCalled,
            post: postCalled
          }
        )
        .run();
      
      expect(preCalled).toHaveBeenCalledTimes(1); // Once for entire loop
      expect(postCalled).toHaveBeenCalledTimes(1); // Once after all items
    });
  });

  describe('RetryUntil Hooks', () => {
    it('executes pre and post hooks for retryUntil', async () => {
      let attemptCount = 0;
      const mockGen = async () => {
        attemptCount++;
        return attemptCount >= 2 ? 'SUCCESS' : 'FAIL';
      };
      
      const llm = {
        id: 'mock',
        model: 'mock',
        client: {},
        gen: mockGen,
        genWithTools: async () => ({ toolCalls: [] }),
        genStream: async function* () { yield 'test'; }
      };
      
      const preCalled = vi.fn();
      const postCalled = vi.fn();
      
      await agent({ llm: llm as any , hideProgress: true })
        .retryUntil(
          (a) => a.then({ prompt: 'Try' }),
          (r) => r.llmOutput?.includes('SUCCESS') || false,
          {
            maxAttempts: 5,
            pre: preCalled,
            post: postCalled
          }
        )
        .run();
      
      expect(preCalled).toHaveBeenCalledTimes(1); // Once for entire retry sequence
      expect(postCalled).toHaveBeenCalledTimes(1); // Once after success
    });
  });

  describe('RunAgent Hooks', () => {
    it('executes pre and post hooks for runAgent', async () => {
      const llm = createMockLLM(['Sub-agent result', 'Main result']);
      const preCalled = vi.fn();
      const postCalled = vi.fn();
      
      const subAgent = agent({ llm: llm as any , hideProgress: true })
        .then({ prompt: 'Sub task' });
      
      await agent({ llm: llm as any , hideProgress: true })
        .runAgent(subAgent, {
          pre: preCalled,
          post: postCalled
        })
        .run();
      
      expect(preCalled).toHaveBeenCalledTimes(1);
      expect(postCalled).toHaveBeenCalledTimes(1);
    });
  });

  describe('Mixed Patterns with Hooks', () => {
    it('executes hooks in correct order for complex workflow', async () => {
      const llm = createMockLLM(['P1', 'P2', 'YES', 'Branch result']);
      const callLog: string[] = [];
      
      await agent({ llm: llm as any , hideProgress: true })
        .parallel(
          [{ prompt: 'T1' }, { prompt: 'T2' }],
          {
            pre: () => callLog.push('parallel-pre'),
            post: () => callLog.push('parallel-post')
          }
        )
        .then({ prompt: 'Check' })
        .branch(
          (h) => true,
          {
            true: (a) => a.then({ prompt: 'Yes' }),
            false: (a) => a.then({ prompt: 'No' })
          },
          {
            pre: () => callLog.push('branch-pre'),
            post: () => callLog.push('branch-post')
          }
        )
        .run();
      
      expect(callLog).toEqual(['parallel-pre', 'parallel-post', 'branch-pre', 'branch-post']);
    });
  });
});
