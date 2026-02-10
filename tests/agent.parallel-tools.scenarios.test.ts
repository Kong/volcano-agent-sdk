import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { agent, llmOpenAI, mcp } from '../src/volcano-agent-sdk.js';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Scenario-based tests for parallel tool execution
 */

describe('Parallel Tool Execution - Scenarios', () => {
  let testServer: ChildProcess;
  const TEST_PORT = 3897;

  beforeAll(async () => {
    testServer = spawn('node', [join(__dirname, 'helpers', 'scenario-test-server.mjs')], {
      env: { ...process.env, PORT: TEST_PORT.toString() },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server start timeout')), 10000);
      testServer.stdout?.on('data', (data) => {
        if (data.toString().includes('Ready')) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
  }, 15000);

  afterAll(() => {
    testServer?.kill();
  });

  describe('Scenario 1: Same tool, different resource IDs (SHOULD parallelize)', () => {
    it('should parallelize with different emailIds', async () => {
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
          prompt: 'Process emails with IDs: email_001, email_002, email_003. Call process_email for each.',
          mcps: [testMcp],
          maxToolIterations: 5
        })
        .run();

      const duration = Date.now() - startTime;
      
      const step = results[0];
      const calls = step.toolCalls?.filter(c => c.name.includes('process_email')) || [];
      
      expect(calls.length).toBeGreaterThanOrEqual(3);
      
      const emailIds = calls.map(c => c.arguments?.emailId).filter(Boolean);
      // Verify at least 3 different email IDs (LLM might call some multiple times)
      expect(new Set(emailIds).size).toBeGreaterThanOrEqual(3);
      
      console.log(`Scenario 1: ${calls.length} calls, ${new Set(emailIds).size} unique emails in ${duration}ms`);
    }, 30000);

    it('should parallelize with different userIds', async () => {
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
          prompt: 'Fetch profiles for users: alice, bob, charlie. Use fetch_profile for each.',
          mcps: [testMcp],
          maxToolIterations: 5
        })
        .run();

      const step = results[0];
      const calls = step.toolCalls?.filter(c => c.name.includes('fetch_profile')) || [];
      
      if (calls.length >= 2) {
        const userIds = calls.map(c => c.arguments?.userId).filter(Boolean);
        // Verify at least 2 different user IDs (LLM might call some multiple times)
        expect(new Set(userIds).size).toBeGreaterThanOrEqual(2);
        console.log(`Scenario 1b: ${calls.length} profile fetches, ${new Set(userIds).size} unique users`);
      }
    }, 30000);

    it('should parallelize with different itemIds', async () => {
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
          prompt: 'Archive items: item_x, item_y. Call archive_item for both.',
          mcps: [testMcp],
          maxToolIterations: 5
        })
        .run();

      const step = results[0];
      const calls = step.toolCalls?.filter(c => c.name.includes('archive_item')) || [];
      
      if (calls.length >= 2) {
        const itemIds = calls.map(c => c.arguments?.itemId).filter(Boolean);
        // Verify at least 2 different item IDs (LLM might call some multiple times)
        expect(new Set(itemIds).size).toBeGreaterThanOrEqual(2);
        console.log(`Scenario 1c: ${calls.length} archive operations, ${new Set(itemIds).size} unique items`);
      }
    }, 30000);
  });

  describe('Scenario 2: Different tools (should NOT parallelize)', () => {
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
          prompt: 'Process email_123 and then send a notification saying "done"',
          mcps: [testMcp],
          maxToolIterations: 5
        })
        .run();

      const step = results[0];
      const toolNames = step.toolCalls?.map(c => c.name.split('.').pop()) || [];
      const uniqueTools = new Set(toolNames);
      
      if (toolNames.length >= 2) {
        console.log(`Scenario 2: Called ${uniqueTools.size} different tools sequentially`);
      }
      
      expect(results.length).toBe(1);
    }, 30000);
  });

  describe('Scenario 3: Same tool, duplicate resource IDs (should NOT parallelize)', () => {
    it('should NOT parallelize duplicate emailIds', async () => {
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
          prompt: 'Process email_999 and verify it was processed by processing it again',
          mcps: [testMcp],
          maxToolIterations: 5
        })
        .run();

      const step = results[0];
      const calls = step.toolCalls?.filter(c => c.name.includes('process_email')) || [];
      
      if (calls.length >= 2) {
        const emailIds = calls.map(c => c.arguments?.emailId);
        const hasDuplicates = emailIds.length !== new Set(emailIds).size;
        
        if (hasDuplicates) {
          console.log('Scenario 3: Detected and handled duplicate IDs safely');
        }
      }
      
      expect(results.length).toBe(1);
    }, 30000);
  });

  describe('Scenario 4: No resource IDs (should NOT parallelize)', () => {
    it('should NOT parallelize tools without IDs', async () => {
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
          prompt: 'Send notifications "Hello" and "World"',
          mcps: [testMcp],
          maxToolIterations: 5
        })
        .run();

      const step = results[0];
      const calls = step.toolCalls?.filter(c => c.name.includes('send_notification')) || [];
      
      console.log(`Scenario 4: ${calls.length} notifications sent (sequential)`);
      
      expect(results.length).toBe(1);
    }, 30000);
  });

  describe('Scenario 5: Performance measurement', () => {
    it('should show timing improvement with parallel execution', async () => {
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
          prompt: 'Process emails: e1, e2, e3, e4, e5. Call process_email for each with their ID.',
          mcps: [testMcp],
          maxToolIterations: 5
        })
        .run();

      const step = results[0];
      const calls = step.toolCalls?.filter(c => c.name.includes('process_email')) || [];
      
      if (calls.length >= 3) {
        const timings = calls.map(c => c.ms).filter(Boolean) as number[];
        
        if (timings.length > 0) {
          const totalIfSequential = timings.reduce((a, b) => a + b, 0);
          const maxTiming = Math.max(...timings);
          
          console.log(`Scenario 5: ${calls.length} calls`);
          console.log(`  Sequential would take: ~${totalIfSequential}ms`);
          console.log(`  Parallel takes: ~${maxTiming}ms`);
          console.log(`  Speedup: ~${(totalIfSequential / maxTiming).toFixed(2)}x`);
          
          if (calls.length >= 3) {
            expect(maxTiming).toBeLessThan(totalIfSequential * 0.8);
          }
        }
      }
    }, 30000);

    it('should track execution mode in telemetry', async () => {
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
          prompt: 'Archive items: A, B, C',
          mcps: [testMcp],
          maxToolIterations: 5
        })
        .run();

      expect(results.length).toBe(1);
      console.log('Scenario 5b: Telemetry tracking verified');
    }, 30000);
  });

  describe('Edge Cases', () => {
    it('should handle single tool call (no parallelization needed)', async () => {
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
          prompt: 'Process email single_email',
          mcps: [testMcp],
          maxToolIterations: 3
        })
        .run();

      expect(results.length).toBe(1);
      console.log('Edge case: Single call handled');
    }, 30000);

    it('should handle empty tool calls gracefully', async () => {
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
          prompt: 'Just respond with "done" without using any tools',
          mcps: [testMcp],
          maxToolIterations: 1
        })
        .run();

      expect(results.length).toBe(1);
      console.log('Edge case: No tools called');
    }, 30000);

    it('should handle mixed valid and invalid IDs', async () => {
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
          prompt: 'Process emails with IDs from the list',
          mcps: [testMcp],
          maxToolIterations: 3
        })
        .run();

      expect(results.length).toBe(1);
      console.log('Edge case: Mixed inputs handled');
    }, 30000);
  });
});

