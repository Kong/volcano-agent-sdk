import { describe, it, expect } from 'vitest';
import { agent, mcp, MCPConnectionError } from '../src/volcano-agent-sdk.js';

function makeMockLLM() {
  return {
    id: 'mock',
    model: 'mock',
    client: {},
    gen: async () => 'OK',
    genWithTools: async () => ({ content: '', toolCalls: [] }),
    genStream: async function*(){}
  } as any;
}

describe('MCP Connection Failure Handling', () => {
  describe('fails fast when MCP server unreachable', () => {
    it('throws MCPConnectionError when discovery fails', async () => {
      const unreachableMcp = mcp('http://localhost:9999/mcp'); // Non-existent server
      
      let error: any;
      try {
        await agent({ llm: makeMockLLM() , hideProgress: true })
          .then({ 
            prompt: "Use tools from unreachable server",
            mcps: [unreachableMcp]
          })
          .run();
      } catch (e) {
        error = e;
      }
      
      // Should throw, not continue
      expect(error).toBeDefined();
      expect(error.name).toBe('MCPConnectionError');
      expect(error.message).toMatch(/fetch failed|ECONNREFUSED|connection/i);
    }, 20000);
    
    it('workflow stops on MCP connection failure', async () => {
      const unreachableMcp = mcp('http://localhost:9999/mcp');
      let step2Executed = false;
      
      let error: any;
      try {
        await agent({ llm: makeMockLLM() , hideProgress: true })
          .then({ 
            prompt: "Step 1 - will fail",
            mcps: [unreachableMcp]
          })
          .then({ 
            prompt: "Step 2 - should not execute",
            pre: () => { step2Executed = true; }
          })
          .run();
      } catch (e) {
        error = e;
      }
      
      // Should throw (connection errors from discovery may not have stepId)
      expect(error).toBeDefined();
      expect(error.name).toBe('MCPConnectionError');
      
      // Step 2 should never execute
      expect(step2Executed).toBe(false);
    }, 20000);
    
    it('error metadata indicates retryable connection error', async () => {
      const unreachableMcp = mcp('http://localhost:9999/mcp');
      
      let error: any;
      try {
        await agent({ llm: makeMockLLM() , hideProgress: true })
          .then({ 
            prompt: "Test",
            mcps: [unreachableMcp]
          })
          .run();
      } catch (e) {
        error = e;
      }
      
      expect(error.meta).toBeDefined();
      expect(error.meta.provider).toMatch(/mcp:/);
      expect(error.meta.retryable).toBe(true); // Connection errors are retryable
    }, 20000);
    
    it('retries connection errors based on retry config', async () => {
      const unreachableMcp = mcp('http://localhost:9999/mcp');
      let attempts = 0;
      
      let error: any;
      try {
        await agent({ 
          llm: makeMockLLM(),
          hideProgress: true,
          retry: { retries: 3, delay: 0 } // 3 attempts, immediate
        })
          .then({ 
            prompt: "Test retries",
            mcps: [unreachableMcp],
            pre: () => { attempts++; }
          })
          .run();
      } catch (e) {
        error = e;
      }
      
      // Should have retried 3 times
      expect(attempts).toBe(3);
      expect(error).toBeDefined();
      expect(error.name).toBe('MCPConnectionError');
    }, 20000);
  });
  
  describe('explicit MCP tool call failures', () => {
    it('throws when explicit tool call fails due to connection', async () => {
      const unreachableMcp = mcp('http://localhost:9999/mcp');
      
      let error: any;
      try {
        await agent({ llm: makeMockLLM() , hideProgress: true })
          .then({ 
            mcp: unreachableMcp,
            tool: 'some_tool',
            args: {}
          })
          .run();
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      // Explicit tool calls fail as MCPToolError (wraps connection error)
      expect(error.name).toBe('MCPToolError');
      expect(error.meta?.stepId).toBe(0);
    }, 20000);
    
    it('stops multi-step workflow on MCP failure', async () => {
      const unreachableMcp = mcp('http://localhost:9999/mcp');
      let step3Executed = false;
      
      let error: any;
      try {
        await agent({ llm: makeMockLLM() , hideProgress: true })
          .then({ prompt: "Step 1 - OK" })
          .then({ 
            mcp: unreachableMcp,
            tool: 'will_fail',
            args: {}
          })
          .then({ 
            prompt: "Step 3 - should not run",
            pre: () => { step3Executed = true; }
          })
          .run();
      } catch (e) {
        error = e;
      }
      
      // Error on step 1 (0-indexed)
      expect(error.meta?.stepId).toBe(1);
      
      // Step 3 never executes
      expect(step3Executed).toBe(false);
    }, 20000);
  });
  
  describe('LLM failure handling (should already fail fast)', () => {
    it('stops workflow when LLM call fails in step 1', async () => {
      const failingLLM: any = {
        id: 'failing-llm',
        model: 'fail',
        client: {},
        gen: async () => { throw new Error('LLM API Error'); },
        genWithTools: async () => { throw new Error('LLM API Error'); },
        genStream: async function*(){}
      };
      
      let step2Executed = false;
      
      let error: any;
      try {
        await agent({ llm: failingLLM , hideProgress: true })
          .then({ prompt: "This will fail" })
          .then({ 
            prompt: "This should not execute",
            pre: () => { step2Executed = true; }
          })
          .run();
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.name).toBe('LLMError');
      expect(error.meta.stepId).toBe(0); // Failed on first step
      expect(step2Executed).toBe(false);
    }, 20000);
    
    it('two-step workflow: LLM fails in step 1, step 2 never runs', async () => {
      const failingLLM: any = {
        id: 'rate-limited-llm',
        model: 'test',
        client: {},
        gen: async () => { 
          const err: any = new Error('Rate limit exceeded');
          err.status = 429;
          throw err;
        },
        genWithTools: async () => ({ content: '', toolCalls: [] }),
        genStream: async function*(){}
      };
      
      const goodLLM = makeMockLLM();
      let step2Started = false;
      let step2Completed = false;
      
      let error: any;
      try {
        await agent({ hideProgress: true })
          .then({ 
            llm: failingLLM,
            prompt: "Step 1 - will hit rate limit"
          })
          .then({ 
            llm: goodLLM,
            prompt: "Step 2 - should never start",
            pre: () => { step2Started = true; },
            post: () => { step2Completed = true; }
          })
          .run();
      } catch (e) {
        error = e;
      }
      
      // Verify error details
      expect(error).toBeDefined();
      expect(error.name).toBe('LLMError');
      expect(error.meta.stepId).toBe(0);
      expect(error.meta.provider).toMatch(/llm:/);
      expect(error.meta.retryable).toBe(true); // 429 is retryable
      
      // Step 2 never started
      expect(step2Started).toBe(false);
      expect(step2Completed).toBe(false);
    }, 20000);
    
    it('LLM errors include proper metadata', async () => {
      const failingLLM: any = {
        id: 'test-llm',
        model: 'test-model',
        client: {},
        gen: async () => { throw new Error('Rate limit exceeded'); },
        genWithTools: async () => ({ content: '', toolCalls: [] }),
        genStream: async function*(){}
      };
      
      let error: any;
      try {
        await agent({ llm: failingLLM , hideProgress: true })
          .then({ prompt: "Test" })
          .run();
      } catch (e) {
        error = e;
      }
      
      expect(error.name).toBe('LLMError');
      expect(error.meta.stepId).toBe(0);
      expect(error.meta.provider).toMatch(/llm:/);
    }, 20000);
  });
});
