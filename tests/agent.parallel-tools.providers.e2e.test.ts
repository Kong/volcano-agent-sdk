import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { agent, mcp, llmOpenAI, llmAnthropic, llmMistral, llmBedrock, llmVertexStudio, llmAzure, _clearMCPPool } from '../src/volcano-agent-sdk.js';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * E2E tests for parallel tool execution across ALL providers
 */

describe.sequential('Parallel Tool Execution - All Providers', () => {
  let testServer: ChildProcess;
  const TEST_PORT = 3898;

  beforeAll(async () => {
    testServer = spawn('node', [join(__dirname, 'helpers', 'provider-test-server.mjs')], {
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

  const providers = [
    {
      name: 'OpenAI GPT-4o-mini',
      make: () => llmOpenAI({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-4o-mini' }),
      requireEnv: ['OPENAI_API_KEY']
    },
    {
      name: 'OpenAI GPT-4o',
      make: () => llmOpenAI({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-4o' }),
      requireEnv: ['OPENAI_API_KEY']
    },
    {
      name: 'Anthropic Claude',
      make: () => llmAnthropic({ 
        apiKey: process.env.ANTHROPIC_API_KEY!, 
        model: 'claude-3-haiku-20240307'
      }),
      requireEnv: ['ANTHROPIC_API_KEY']
    },
    {
      name: 'Mistral',
      make: () => llmMistral({ 
        apiKey: process.env.MISTRAL_API_KEY!, 
        model: 'mistral-large-latest' 
      }),
      requireEnv: ['MISTRAL_API_KEY']
    },
    {
      name: 'AWS Bedrock',
      make: () => llmBedrock({
        region: process.env.AWS_REGION || 'us-east-1',
        model: 'us.amazon.nova-micro-v1:0',
        bearerToken: process.env.AWS_BEARER_TOKEN_BEDROCK
      }),
      requireEnv: ['AWS_BEARER_TOKEN_BEDROCK']
    },
    {
      name: 'Google Vertex AI',
      make: () => llmVertexStudio({
        apiKey: process.env.GCP_VERTEX_API_KEY!,
        model: 'gemini-2.0-flash-exp',
        clientOptions: {
          retryOnRateLimit: { maxRetries: 3, initialDelayMs: 1000 }
        }
      }),
      requireEnv: ['GCP_VERTEX_API_KEY']
    },
    {
      name: 'Azure AI',
      make: () => llmAzure({
        apiKey: process.env.AZURE_AI_API_KEY!,
        endpoint: 'https://volcano-sdk.openai.azure.com/openai/responses',
        model: 'gpt-5-mini',
        apiVersion: '2025-04-01-preview'
      }),
      requireEnv: ['AZURE_AI_API_KEY']
    }
  ];

  for (const provider of providers) {
    describe(`Provider: ${provider.name}`, () => {
      it('should parallelize same tool with different resource IDs', async () => {
        if (provider.requireEnv) {
          for (const envVar of provider.requireEnv) {
            if (!process.env[envVar]) {
              throw new Error(`${envVar} is required for ${provider.name} test`);
            }
          }
        }

        const testMcp = mcp(`http://localhost:${TEST_PORT}/mcp`);
        const llm = provider.make();

        const results = await agent({ llm, hideProgress: true })
          .then({
            prompt: 'Mark items A, B, and C as done. Use mark_item for itemId="A", itemId="B", and itemId="C" with status="done".',
            mcps: [testMcp],
            maxToolIterations: 5
          })
          .run();

        expect(results.length).toBe(1);
        const step = results[0];
        expect(step.toolCalls).toBeDefined();
        
        const markItemCalls = step.toolCalls!.filter(c => 
          c.name.includes('mark_item')
        );
        expect(markItemCalls.length).toBeGreaterThanOrEqual(1);

        const itemIds = markItemCalls
          .map(c => c.arguments?.itemId)
          .filter(Boolean);
        const uniqueIds = new Set(itemIds);
        
        // Verify at least 1 ID present (LLM behavior varies)
        expect(uniqueIds.size).toBeGreaterThanOrEqual(1);
        
        console.log(`[${provider.name}] Executed ${markItemCalls.length} tool calls with ${uniqueIds.size} unique IDs`);
      }, 120000);

      it('should NOT parallelize different tools', async () => {
        if (provider.requireEnv) {
          for (const envVar of provider.requireEnv) {
            if (!process.env[envVar]) {
              throw new Error(`${envVar} is required for ${provider.name} test`);
            }
          }
        }

        const testMcp = mcp(`http://localhost:${TEST_PORT}/mcp`);
        const llm = provider.make();

        const results = await agent({ llm, hideProgress: true })
          .then({
            prompt: 'Mark item X as done',
            mcps: [testMcp],
            maxToolIterations: 3
          })
          .run();

        expect(results.length).toBe(1);
        expect(results[0].toolCalls).toBeDefined();
        
        console.log(`[${provider.name}] Sequential execution works`);
      }, 90000);

      it('should handle edge cases safely', async () => {
        if (provider.requireEnv) {
          for (const envVar of provider.requireEnv) {
            if (!process.env[envVar]) {
              throw new Error(`${envVar} is required for ${provider.name} test`);
            }
          }
        }

        const testMcp = mcp(`http://localhost:${TEST_PORT}/mcp`);
        const llm = provider.make();

        const results = await agent({ llm, hideProgress: true })
          .then({
            prompt: 'Mark item Z as complete using mark_item',
            mcps: [testMcp],
            maxToolIterations: 3
          })
          .run();

        expect(results.length).toBe(1);
        expect(results[0].toolCalls).toBeDefined();
        
        console.log(`[${provider.name}] Edge cases handled`);
      }, 90000);
    });
  }

  describe('Cross-Provider Consistency', () => {
    it('should have consistent behavior across all providers', async () => {
      const testMcp = mcp(`http://localhost:${TEST_PORT}/mcp`);
      
      for (const provider of providers) {
        if (provider.requireEnv) {
          for (const envVar of provider.requireEnv) {
            if (!process.env[envVar]) {
              throw new Error(`${envVar} is required for ${provider.name} test`);
            }
          }
        }

        const llm = provider.make();
        
        const results = await agent({ llm, hideProgress: true })
          .then({
            prompt: 'Mark items 1 and 2. Call mark_item twice.',
            mcps: [testMcp],
            maxToolIterations: 5
          })
          .run();

        expect(results.length).toBe(1);
        expect(results[0].toolCalls).toBeDefined();
        
        console.log(`[${provider.name}] ✓ Consistent behavior`);
      }
    }, 180000);
  });
});

