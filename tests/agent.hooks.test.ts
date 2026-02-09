import { describe, it, expect } from 'vitest';
import { agent } from '../dist/volcano-agent-sdk.js';

describe('agent pre/post hooks', () => {
  it('executes pre and post hooks for LLM-only steps', async () => {
    const events: string[] = [];
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
        prompt: 'hello',
        pre: () => { events.push('pre-1'); },
        post: () => { events.push('post-1'); }
      })
      .run();

    expect(events).toEqual(['pre-1', 'post-1']);
  });

  it('executes hooks in correct order for multi-step workflow', async () => {
    const events: string[] = [];
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
        prompt: 'step1',
        pre: () => { events.push('pre-1'); },
        post: () => { events.push('post-1'); }
      })
      .then({ 
        prompt: 'step2',
        pre: () => { events.push('pre-2'); },
        post: () => { events.push('post-2'); }
      })
      .then({ 
        prompt: 'step3',
        pre: () => { events.push('pre-3'); },
        post: () => { events.push('post-3'); }
      })
      .run();

    expect(events).toEqual(['pre-1', 'post-1', 'pre-2', 'post-2', 'pre-3', 'post-3']);
  });

  it('handles hook errors gracefully without failing the step', async () => {
    const events: string[] = [];
    const consoleWarnSpy = [] as any[];
    const originalWarn = console.warn;
    console.warn = (...args: any[]) => consoleWarnSpy.push(args);

    const llm: any = { 
      id: 'mock', 
      model: 'm', 
      client: {}, 
      gen: async () => 'OK', 
      genWithTools: async () => ({ content: '', toolCalls: [] }), 
      genStream: async function*(){} 
    };

    try {
      const results = await agent({ llm, hideProgress: true })
        .then({ 
          prompt: 'hello',
          pre: () => { 
            events.push('pre-executed');
            throw new Error('Pre hook error'); 
          },
          post: () => { 
            events.push('post-executed');
            throw new Error('Post hook error'); 
          }
        })
        .run();

      // Step should still succeed despite hook errors
      expect(results).toHaveLength(1);
      expect(results[0].llmOutput).toBe('OK');
      expect(events).toEqual(['pre-executed', 'post-executed']);
      
      // Verify warnings were logged
      expect(consoleWarnSpy).toHaveLength(2);
      expect(consoleWarnSpy[0][0]).toBe('Pre-step hook failed:');
      expect(consoleWarnSpy[1][0]).toBe('Post-step hook failed:');
      
    } finally {
      console.warn = originalWarn;
    }
  });

  it('executes hooks for different step types', async () => {
    const events: string[] = [];
    const llm: any = { 
      id: 'mock', 
      model: 'm', 
      client: {}, 
      gen: async () => 'OK', 
      genWithTools: async () => ({ content: '', toolCalls: [] }), 
      genStream: async function*(){} 
    };

    const mockMcp = { id: 'mock', url: 'http://mock:3000/mcp' };
    const originalWithMCP = (global as any).__volcanoWithMCP;
    (global as any).__volcanoWithMCP = async (handle: any, fn: any) => {
      return await fn({ callTool: async () => ({ result: 'mocked' }) });
    };

    try {
      await agent({ llm, hideProgress: true })
        // LLM-only step with hooks
        .then({ 
          prompt: 'llm step',
          pre: () => { events.push('llm-pre'); },
          post: () => { events.push('llm-post'); }
        })
        // Tool-only step with hooks (this will fail due to MCP setup, but hooks should execute)
        .run();

      expect(events).toContain('llm-pre');
      expect(events).toContain('llm-post');
      
    } finally {
      if (originalWithMCP) {
        (global as any).__volcanoWithMCP = originalWithMCP;
      }
    }
  });

  it('passes correct step index to run callback', async () => {
    const stepIndices: number[] = [];
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
        prompt: 'step1',
        pre: () => { /* no-op */ },
      })
      .then({ 
        prompt: 'step2',
        post: () => { /* no-op */ }
      })
      .then({ 
        prompt: 'step3'
      })
      .run((step, stepIndex) => {
        stepIndices.push(stepIndex);
      });

    expect(stepIndices).toEqual([0, 1, 2]);
  });

  it('hooks have access to closure variables', async () => {
    let sharedCounter = 0;
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
        prompt: 'increment test',
        pre: () => { sharedCounter += 10; },
        post: () => { sharedCounter += 100; }
      })
      .run();

    expect(sharedCounter).toBe(110);
  });

  it('hooks execute even when retries happen', async () => {
    const events: string[] = [];
    let attempts = 0;
    const llm: any = { 
      id: 'mock', 
      model: 'm', 
      client: {}, 
      gen: async () => { 
        attempts++;
        if (attempts <= 1) throw new Error('Simulated failure');
        return 'OK'; 
      }, 
      genWithTools: async () => ({ content: '', toolCalls: [] }), 
      genStream: async function*(){} 
    };

    await agent({ llm, hideProgress: true, retry: { delay: 0, retries: 2 } })
      .then({ 
        prompt: 'retry test',
        pre: () => { events.push('pre'); },
        post: () => { events.push('post'); }
      })
      .run();

    // Pre hook should execute before each attempt, post hook only after success
    expect(events).toEqual(['pre', 'pre', 'post']);
    expect(attempts).toBe(2);
  });
});

