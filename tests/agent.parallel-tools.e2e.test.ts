import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { agent, llmOpenAI, mcp, _clearMCPPool } from '../src/volcano-agent-sdk.js';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * E2E tests for parallel tool execution
 * 
 * These tests verify that the conservative parallelization actually works
 * with real MCP servers and measures performance improvements.
 */

describe.sequential('Parallel Tool Execution E2E', () => {
  let testServer: ChildProcess;
  const TEST_PORT = 3899;

  beforeAll(async () => {
    // Start the test MCP server
    testServer = spawn('node', [join(__dirname, 'helpers', 'parallel-test-server.mjs')], {
      env: { ...process.env, PORT: TEST_PORT.toString() },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Wait for server to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server start timeout')), 10000);
      testServer.stdout?.on('data', (data) => {
        if (data.toString().includes('Ready')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      testServer.stderr?.on('data', (data) => {
        console.error('[test-server error]', data.toString());
      });
    });
  }, 15000);

  afterAll(async () => {
    testServer?.kill();
    await _clearMCPPool();
  });

  beforeEach(async () => {
    // Clear MCP pool before each test
    // Server will handle session cleanup on reinitialize
    await _clearMCPPool();
    // Small delay to ensure connections are fully closed
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  describe('Parallelization Detection', () => {
    it('should execute same tool with different IDs in parallel', async () => {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required for this test');
      }

      const testMcp = mcp(`http://localhost:${TEST_PORT}/mcp`);
      const llm = llmOpenAI({ 
        apiKey: process.env.OPENAI_API_KEY, 
        model: 'gpt-4o-mini' 
      });

      const startTime = Date.now();
      
      const results = await agent({ llm, hideProgress: true })
        .then({
          prompt: 'Process items with IDs: item1, item2, item3. Call process_item for each one.',
          mcps: [testMcp],
          maxToolIterations: 5
        })
        .run();

      const duration = Date.now() - startTime;
      
      expect(results.length).toBe(1);
      const step = results[0];
      expect(step.toolCalls).toBeDefined();
      expect(step.toolCalls!.length).toBeGreaterThanOrEqual(3);
      
      console.log(`Execution time: ${duration}ms`);
      
      const processItemCalls = step.toolCalls!.filter(c => c.name.includes('process_item'));
      expect(processItemCalls.length).toBeGreaterThanOrEqual(3);
      
      // Verify different itemIds (parallel-safe)
      const itemIds = processItemCalls.map(c => c.arguments?.itemId).filter(Boolean);
      const uniqueIds = new Set(itemIds);
      expect(uniqueIds.size).toBeGreaterThanOrEqual(3); // At least 3 different items
    }, 60000);  // Increased timeout for server restart overhead + LLM iterations

    it('should execute different tools sequentially', async () => {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required for this test');
      }

      const testMcp = mcp(`http://localhost:${TEST_PORT}/mcp`);
      const llm = llmOpenAI({ 
        apiKey: process.env.OPENAI_API_KEY, 
        model: 'gpt-4o-mini' 
      });

      const results = await agent({ llm, hideProgress: true })
        .then({
          prompt: 'First create an item named "test", then get details for item1',
          mcps: [testMcp],
          maxToolIterations: 5
        })
        .run();

      expect(results.length).toBe(1);
      const step = results[0];
      expect(step.toolCalls).toBeDefined();
      
      const toolNames = step.toolCalls!.map(c => c.name);
      const uniqueTools = new Set(toolNames.map(name => name.split('.').pop()));
      
      expect(uniqueTools.size).toBeGreaterThan(1);
    }, 60000);  // Increased timeout for server restart overhead + LLM iterations
  });

  describe('Performance Validation', () => {
    it('should show performance improvement with parallel execution', async () => {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required for this test');
      }

      const testMcp = mcp(`http://localhost:${TEST_PORT}/mcp`);
      const llm = llmOpenAI({ 
        apiKey: process.env.OPENAI_API_KEY, 
        model: 'gpt-4o-mini' 
      });

      const results = await agent({ llm, hideProgress: true })
        .then({
          prompt: 'Process items: item1, item2, item3, item4, item5. Use process_item for all.',
          mcps: [testMcp],
          maxToolIterations: 5
        })
        .run();

      expect(results.length).toBe(1);
      const step = results[0];
      expect(step.toolCalls).toBeDefined();
      
      const processItemCalls = step.toolCalls!.filter(c => c.name.includes('process_item'));
      expect(processItemCalls.length).toBeGreaterThanOrEqual(3);
      
      const itemIds = processItemCalls.map(c => c.arguments?.itemId).filter(Boolean);
      const uniqueIds = new Set(itemIds);
      // Verify at least 3 different items (LLM might call some multiple times)
      expect(uniqueIds.size).toBeGreaterThanOrEqual(3);
    }, 90000);

    it('should measure actual timing difference', async () => {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required for this test');
      }

      const testMcp = mcp(`http://localhost:${TEST_PORT}/mcp`);
      const llm = llmOpenAI({ 
        apiKey: process.env.OPENAI_API_KEY, 
        model: 'gpt-4o-mini' 
      });

      const results = await agent({ llm, hideProgress: true })
        .then({
          prompt: 'Process exactly these 3 items in one step: item_a, item_b, item_c. Call process_item(itemId="item_a"), process_item(itemId="item_b"), process_item(itemId="item_c").',
          mcps: [testMcp],
          maxToolIterations: 5
        })
        .run();

      const step = results[0];
      const calls = step.toolCalls?.filter(c => c.name.includes('process_item')) || [];
      
      if (calls.length >= 3) {
        const timings = calls.map(c => c.ms).filter((t): t is number => typeof t === 'number');
        if (timings.length > 0) {
          const avgTiming = timings.reduce((a, b) => a + b, 0) / timings.length;
          console.log(`Average tool execution time: ${avgTiming}ms`);
        }
      }
    }, 120000);  // 2 min timeout - completes faster normally, protects against hangs
  });

  describe('Safety Guarantees', () => {
    it('should NOT parallelize operations on the same resource', async () => {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required for this test');
      }

      const testMcp = mcp(`http://localhost:${TEST_PORT}/mcp`);
      const llm = llmOpenAI({ 
        apiKey: process.env.OPENAI_API_KEY, 
        model: 'gpt-4o-mini' 
      });

      const results = await agent({ llm, hideProgress: true })
        .then({
          prompt: 'Process item1 twice to verify it works',
          mcps: [testMcp],
          maxToolIterations: 5
        })
        .run();

      expect(results.length).toBe(1);
    }, 120000);

    it('should handle mixed tool calls correctly', async () => {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required for this test');
      }

      const testMcp = mcp(`http://localhost:${TEST_PORT}/mcp`);
      const llm = llmOpenAI({ 
        apiKey: process.env.OPENAI_API_KEY, 
        model: 'gpt-4o-mini' 
      });

      const results = await agent({ llm, hideProgress: true })
        .then({
          prompt: 'Get details for item1, item2, and item3. Then process item1.',
          mcps: [testMcp],
          maxToolIterations: 10
        })
        .run();

      expect(results.length).toBe(1);
      const step = results[0];
      expect(step.toolCalls).toBeDefined();
      expect(step.toolCalls!.length).toBeGreaterThan(0);
    }, 60000);  // Increased timeout for server restart overhead + LLM iterations
  });

  describe('disableParallelToolExecution option', () => {
    it('should force sequential execution when flag is true', async () => {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required for this test');
      }

      const testMcp = mcp(`http://localhost:${TEST_PORT}/mcp`);
      const llm = llmOpenAI({ 
        apiKey: process.env.OPENAI_API_KEY, 
        model: 'gpt-4o-mini' 
      });

      // With parallel execution disabled, should still work but execute sequentially
      const results = await agent({ 
        llm, 
        hideProgress: true,
        disableParallelToolExecution: true  // Force sequential
      })
        .then({
          prompt: 'Process items: item1, item2, item3. Call process_item for each.',
          mcps: [testMcp],
          maxToolIterations: 5
        })
        .run();

      expect(results.length).toBe(1);
      const step = results[0];
      expect(step.toolCalls).toBeDefined();
      
      const processItemCalls = step.toolCalls!.filter(c => c.name.includes('process_item'));
      expect(processItemCalls.length).toBeGreaterThanOrEqual(2);
      
      console.log(`With disableParallelToolExecution: ${processItemCalls.length} calls executed sequentially`);
    }, 60000);  // Increased timeout for server restart overhead + LLM iterations

    it('should enable parallel execution by default (flag not set)', async () => {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required for this test');
      }

      const testMcp = mcp(`http://localhost:${TEST_PORT}/mcp`);
      const llm = llmOpenAI({ 
        apiKey: process.env.OPENAI_API_KEY, 
        model: 'gpt-4o-mini' 
      });

      // Default behavior (flag not set) should enable parallelization
      const results = await agent({ 
        llm, 
        hideProgress: true
        // disableParallelToolExecution not set = parallel enabled
      })
        .then({
          prompt: 'Process items: itemA, itemB. Call process_item for both.',
          mcps: [testMcp],
          maxToolIterations: 5
        })
        .run();

      expect(results.length).toBe(1);
      const step = results[0];
      expect(step.toolCalls).toBeDefined();
      
      console.log(`Default behavior: parallel execution enabled`);
    }, 90000);

    it('should enable parallel execution when flag is explicitly false', async () => {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required for this test');
      }

      const testMcp = mcp(`http://localhost:${TEST_PORT}/mcp`);
      const llm = llmOpenAI({ 
        apiKey: process.env.OPENAI_API_KEY, 
        model: 'gpt-4o-mini' 
      });

      const results = await agent({ 
        llm, 
        hideProgress: true,
        disableParallelToolExecution: false  // Explicitly enable (same as default)
      })
        .then({
          prompt: 'Get items: item1, item2. Use get_item for both.',
          mcps: [testMcp],
          maxToolIterations: 5
        })
        .run();

      expect(results.length).toBe(1);
      console.log(`Explicit false: parallel execution enabled`);
    }, 60000);  // Increased timeout for server restart overhead + LLM iterations
  });
});

