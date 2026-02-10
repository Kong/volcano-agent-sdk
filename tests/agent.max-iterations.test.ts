import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { agent, mcp } from '../src/volcano-agent-sdk.js';

function waitForOutput(proc: any, match: RegExp, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for: ${match}`)), timeoutMs);
    const handler = (data: Buffer) => {
      if (match.test(data.toString())) {
        clearTimeout(timer);
        proc.stdout?.off('data', handler);
        proc.stderr?.off('data', handler);
        resolve(true);
      }
    };
    proc.stdout?.on('data', handler);
    proc.stderr?.on('data', handler);
  });
}

function startServer(cmd: string, args: string[], env: Record<string, string | undefined> = {}) {
  const proc = spawn(cmd, args, { env: { ...process.env, ...env } });
  return proc;
}

describe('maxToolIterations Configuration', () => {
  let astroProc: any;
  
  beforeAll(async () => {
    astroProc = startServer('node', ['mcp/astro/server.mjs'], { PORT: '3101' });
    await waitForOutput(astroProc, /listening on :3101/);
  }, 30000);
  
  afterAll(async () => {
    astroProc?.kill();
  });
  
  describe('agent-level configuration', () => {
    it('defaults to 4 iterations when not configured', async () => {
      const astro = mcp('http://localhost:3101/mcp');
      let llmCallCount = 0;
      
      const llm: any = {
        id: 'test',
        model: 'test',
        client: {},
        gen: async () => 'OK',
        genWithTools: async (_p: string, tools: any[]) => {
          llmCallCount++;
          
          // First 3 calls: request tools
          if (llmCallCount <= 3) {
            const tool = tools.find(t => t.name.endsWith('.get_sign'));
            return {
              content: '',
              toolCalls: [{
                name: tool!.name,
                arguments: { birthdate: '1993-07-11' },
                mcpHandle: astro
              }]
            };
          }
          
          // 4th call: finish
          return { content: 'Done after 4 iterations', toolCalls: [] };
        },
        genStream: async function*(){}
      };
      
      await agent({ llm, hideProgress: true }) // No maxToolIterations specified
        .then({ prompt: 'Test', mcps: [astro] })
        .run();
      
      // Should allow up to 4 iterations
      expect(llmCallCount).toBe(4);
    }, 20000);
    
    it('respects agent-level maxToolIterations', async () => {
      const astro = mcp('http://localhost:3101/mcp');
      let llmCallCount = 0;
      
      const llm: any = {
        id: 'test',
        model: 'test',
        client: {},
        gen: async () => 'OK',
        genWithTools: async (_p: string, tools: any[]) => {
          llmCallCount++;
          
          // Always request more tools (will be cut off by maxIterations)
          const tool = tools.find(t => t.name.endsWith('.get_sign'));
          return {
            content: '',
            toolCalls: [{
              name: tool!.name,
              arguments: { birthdate: '1993-07-11' },
              mcpHandle: astro
            }]
          };
        },
        genStream: async function*(){}
      };
      
      await agent({ llm, maxToolIterations: 2 , hideProgress: true }) // Limit to 2
        .then({ prompt: 'Test', mcps: [astro] })
        .run();
      
      // Should stop at 2 iterations
      expect(llmCallCount).toBe(2);
    }, 20000);
    
    it('maxToolIterations: 1 only allows single tool call', async () => {
      const astro = mcp('http://localhost:3101/mcp');
      let llmCallCount = 0;
      let toolCallCount = 0;
      
      const llm: any = {
        id: 'test',
        model: 'test',
        client: {},
        gen: async () => 'OK',
        genWithTools: async (_p: string, tools: any[]) => {
          llmCallCount++;
          
          const tool = tools.find(t => t.name.endsWith('.get_sign'));
          toolCallCount++;
          
          return {
            content: '',
            toolCalls: [{
              name: tool!.name,
              arguments: { birthdate: '1993-07-11' },
              mcpHandle: astro
            }]
          };
        },
        genStream: async function*(){}
      };
      
      const results = await agent({ llm, maxToolIterations: 1 , hideProgress: true })
        .then({ prompt: 'Test', mcps: [astro] })
        .run();
      
      // Only 1 LLM call allowed
      expect(llmCallCount).toBe(1);
      expect(toolCallCount).toBe(1);
      expect(results[0].toolCalls?.length).toBe(1);
    }, 20000);
  });
  
  describe('per-step configuration', () => {
    it('per-step maxToolIterations overrides agent-level', async () => {
      const astro = mcp('http://localhost:3101/mcp');
      let step1LlmCalls = 0;
      let step2LlmCalls = 0;
      
      const llm: any = {
        id: 'test',
        model: 'test',
        client: {},
        gen: async () => 'OK',
        genWithTools: async (_p: string, tools: any[]) => {
          // Count which step we're in based on prompt
          if (_p.includes('Step 1')) {
            step1LlmCalls++;
            if (step1LlmCalls < 3) {
              const tool = tools.find(t => t.name.endsWith('.get_sign'));
              return {
                content: '',
                toolCalls: [{ name: tool!.name, arguments: { birthdate: '1993-07-11' }, mcpHandle: astro }]
              };
            }
          } else if (_p.includes('Step 2')) {
            step2LlmCalls++;
            if (step2LlmCalls < 10) { // Would go forever without limit
              const tool = tools.find(t => t.name.endsWith('.get_sign'));
              return {
                content: '',
                toolCalls: [{ name: tool!.name, arguments: { birthdate: '2000-01-01' }, mcpHandle: astro }]
              };
            }
          }
          
          return { content: 'Done', toolCalls: [] };
        },
        genStream: async function*(){}
      };
      
      await agent({ llm, maxToolIterations: 3 , hideProgress: true }) // Default 3
        .then({ prompt: 'Step 1', mcps: [astro] }) // Uses default 3
        .then({ 
          prompt: 'Step 2', 
          mcps: [astro],
          maxToolIterations: 1  // Override to 1
        })
        .run();
      
      // Step 1: 3 iterations (agent default)
      expect(step1LlmCalls).toBe(3);
      
      // Step 2: 1 iteration (per-step override)
      expect(step2LlmCalls).toBe(1);
    }, 20000);
  });
  
  describe('performance impact', () => {
    it('fewer iterations = faster execution', async () => {
      const astro = mcp('http://localhost:3101/mcp');
      
      const makeLLM = () => ({
        id: 'test',
        model: 'test',
        client: {},
        gen: async () => 'OK',
        genWithTools: async (_p: string, tools: any[]) => {
          // Simulate 100ms per LLM call
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const tool = tools.find(t => t.name.endsWith('.get_sign'));
          return {
            content: '',
            toolCalls: [{
              name: tool!.name,
              arguments: { birthdate: '1993-07-11' },
              mcpHandle: astro
            }]
          };
        },
        genStream: async function*(){}
      } as any);
      
      // Run with maxIterations: 4
      const start4 = Date.now();
      await agent({ llm: makeLLM(), maxToolIterations: 4 , hideProgress: true })
        .then({ prompt: 'Test', mcps: [astro] })
        .run();
      const duration4 = Date.now() - start4;
      
      // Run with maxIterations: 1  
      const start1 = Date.now();
      await agent({ llm: makeLLM(), maxToolIterations: 1 , hideProgress: true })
        .then({ prompt: 'Test', mcps: [astro] })
        .run();
      const duration1 = Date.now() - start1;
      
      // maxIterations:1 should be significantly faster
      // (4 iterations × 100ms vs 1 iteration × 100ms)
      expect(duration1).toBeLessThan(duration4);
      
      // Rough validation: 1 iteration should be ~1/4 the time
      expect(duration1).toBeLessThan(duration4 / 2);
    }, 20000);
  });
});
