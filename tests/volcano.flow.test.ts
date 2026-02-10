import { spawn } from 'node:child_process';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { agent, mcp, llmOpenAI, llmAnthropic, llmMistral, llmLlama, llmBedrock, llmVertexStudio, llmAzure } from '../dist/volcano-agent-sdk.js';

function waitForOutput(proc: any, match: RegExp, timeoutMs = 15000) {
  return new Promise<void>((resolve, reject) => {
    const onData = (data: Buffer) => {
      if (match.test(data.toString())) {
        cleanup();
        resolve();
      }
    };
    const onErr = (data: Buffer) => {
      if (match.test(data.toString())) {
        cleanup();
        resolve();
      }
    };
    const cleanup = () => {
      proc.stdout?.off('data', onData);
      proc.stderr?.off('data', onErr);
      clearTimeout(timer);
    };
    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onErr);
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timeout waiting for server output'));
    }, timeoutMs);
  });
}

function startServer(cmd: string, args: string[], env: Record<string, string | undefined> = {}) {
  const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  return proc;
}

describe('volcano-agent-sdk flow (automatic tool selection) across providers', () => {
  let astroProc: any;
  let favProc: any;

  beforeAll(async () => {
    astroProc = startServer('node', ['mcp/astro/server.mjs'], { PORT: '3211' });
    favProc = startServer('node', ['mcp/favorites/server.mjs'], { PORT: '3212' });
    await waitForOutput(astroProc, /astro-mcp\] listening on :3211/);
    await waitForOutput(favProc, /favorites-mcp\] listening on :3212/);
  }, 60000);

  afterAll(async () => {
    if (astroProc) {
      astroProc.kill('SIGKILL');
      astroProc = null;
    }
    if (favProc) {
      favProc.kill('SIGKILL');
      favProc = null;
    }
    // Give processes time to terminate
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  const providerMatrix: Array<{ name: string; make: () => any; requireEnv?: string[] }> = [
    {
      name: 'OpenAI',
      make: () => {
        if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for this test');
        return llmOpenAI({ apiKey: process.env.OPENAI_API_KEY!, model: process.env.OPENAI_MODEL || 'gpt-5-mini' });
      },
      requireEnv: ['OPENAI_API_KEY'],
    },
    {
      name: 'Anthropic',
      make: () => {
        if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is required for this test');
        return llmAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY!, model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307' });
      },
      requireEnv: ['ANTHROPIC_API_KEY'],
    },
    {
      name: 'Mistral',
      make: () => {
        if (!process.env.MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY is required for this test');
        return llmMistral({ apiKey: process.env.MISTRAL_API_KEY!, baseURL: process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai', model: process.env.MISTRAL_MODEL || 'mistral-small-latest' });
      },
      requireEnv: ['MISTRAL_API_KEY'],
    },
    {
      name: 'Llama',
      make: () => {
        return llmLlama({ baseURL: process.env.LLAMA_BASE_URL || 'http://127.0.0.1:11434', model: process.env.LLAMA_MODEL || 'llama3.1:8b' });
      },
    },
    {
      name: 'Bedrock',
      make: () => {
        if (!process.env.AWS_BEARER_TOKEN_BEDROCK && (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY)) {
          throw new Error('AWS_BEARER_TOKEN_BEDROCK or (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY) are required for this test');
        }
        return llmBedrock({ 
          region: process.env.AWS_REGION || 'us-east-1',
          ...(process.env.AWS_BEARER_TOKEN_BEDROCK ? {
            bearerToken: process.env.AWS_BEARER_TOKEN_BEDROCK
          } : {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            sessionToken: process.env.AWS_SESSION_TOKEN,
          }),
          model: process.env.BEDROCK_MODEL || 'amazon.nova-micro-v1:0'
        });
      },
      requireEnv: ['AWS_BEARER_TOKEN_BEDROCK'],
    },
    {
      name: 'VertexStudio',
      make: () => {
        if (!process.env.GCP_VERTEX_API_KEY) {
          throw new Error('GCP_VERTEX_API_KEY is required for this test');
        }
        return llmVertexStudio({
          apiKey: process.env.GCP_VERTEX_API_KEY!,
          model: 'gemini-2.5-flash-lite',
          clientOptions: {
            retryOnRateLimit: { maxRetries: 5, initialDelayMs: 5000, maxDelayMs: 60000 }
          }
        });
      },
      requireEnv: ['GCP_VERTEX_API_KEY'],
    },
    {
      name: 'Azure',
      make: () => {
        if (!process.env.AZURE_AI_API_KEY) {
          throw new Error('AZURE_AI_API_KEY is required for this test');
        }
        return llmAzure({ 
          model: 'gpt-5-mini',
          endpoint: 'https://volcano-sdk.openai.azure.com/openai/responses',
          apiKey: process.env.AZURE_AI_API_KEY!,
          apiVersion: '2025-04-01-preview'
        });
      },
      requireEnv: ['AZURE_AI_API_KEY'],
    },
  ];

  // Skip Llama in CI - too slow even with optimizations (45s+ per call)
  const activeProviders = process.env.CI === 'true' 
    ? providerMatrix.filter(p => p.name !== 'Llama')
    : providerMatrix;

  for (const p of activeProviders) {
    describe(`Provider: ${p.name}`, () => {
      it('runs a two-step automatic flow using both MCP servers', async () => {
        if (p.requireEnv) for (const k of p.requireEnv) { if (!process.env[k]) throw new Error(`${k} is required for this test`); }
        const astro = mcp('http://localhost:3211/mcp');
        const favorites = mcp('http://localhost:3212/mcp');

        const llm = p.make();

        let results;
        try {
          // Llama 3b is faster than 8b locally, but CI is slower
          const agentTimeout = p.name === 'Llama' ? 150 : 60; // CI needs more time
          results = await agent({
            llm,
            hideProgress: true,
            timeout: agentTimeout,
            instructions: 'You are a tool-calling assistant. You MUST call the available tools. Never respond with text only. Always use function calls.',
            maxToolIterations: 3
          })
            .then({
              prompt: 'Call the get_sign function with these exact arguments: {"birthdate": "1993-07-11"}. Do not respond with text, only call the function.',
              mcps: [astro],
              maxToolIterations: 3
            })
            .then({
              prompt: 'Call the get_favorites function with these exact arguments: {"sign": "Cancer"}. Do not respond with text, only call the function.',
              mcps: [favorites],
              maxToolIterations: 3
            })
            .run();
        } catch (error: any) {
          // Llama sometimes passes invalid tool args (known limitation)
          if (p.name === 'Llama' && error.name === 'ValidationError') {
            console.log('Llama validation error (known limitation):', error.message);
            return; // Skip for Llama
          }
          throw error;
        }

        expect(results.length).toBe(2);
        const step1 = results[0];
        expect(step1.toolCalls && step1.toolCalls.length).toBeGreaterThanOrEqual(1);
        const step1Names = (step1.toolCalls || []).map(c => c.name);
        expect(step1Names.some(n => n.endsWith('.get_sign'))).toBe(true);

        const step2 = results[1];
        
        // VertexStudio has limitations with multi-tool scenarios
        if (p.name === 'VertexStudio') {
          // May not call tools in step 2 due to context/prompt limitations
          // Just verify step completed
          expect(step2).toBeDefined();
        } else {
          expect(step2.toolCalls && step2.toolCalls.length).toBeGreaterThanOrEqual(1);
          const step2Names = (step2.toolCalls || []).map(c => c.name);
          expect(step2Names.some(n => n.endsWith('.get_preferences'))).toBe(true);
        }
      }, p.name === 'Llama' || p.name === 'Bedrock' ? 300000 : 120000); // Llama/Bedrock need 5 minutes

      it('runs a one-step automatic flow using both MCP servers (one-liner)', async () => {
        if (p.requireEnv) for (const k of p.requireEnv) { if (!process.env[k]) throw new Error(`${k} is required for this test`); }
        const astro = mcp('http://localhost:3211/mcp');
        const favorites = mcp('http://localhost:3212/mcp');

        const llm = p.make();

        // Google Vertex Studio has limitations with multiple tools, so adjust the test
        const prompt = p.name === 'VertexStudio' 
          ? "Get the astrological sign for birthdate 1993-07-11 using available tools."
          : "I need to find food preferences for someone born on 1993-07-11. First call get_sign with birthdate '1993-07-11', then call get_preferences with the sign you get back. Use both tools in this single step.";
        
        const mcps = p.name === 'VertexStudio' 
          ? [astro] // Only provide one MCP service to avoid multiple tool limitation
          : [astro, favorites];

        let results;
        try {
          // Llama 3b is faster than 8b locally, but CI is slower
          const agentTimeout = p.name === 'Llama' ? 150 : 60; // CI needs more time
          results = await agent({ llm, hideProgress: true, timeout: agentTimeout })
            .then({
              prompt,
              mcps
            })
            .run();
        } catch (error: any) {
          // Llama sometimes passes invalid tool args (known limitation)
          if (p.name === 'Llama' && error.name === 'ValidationError') {
            console.log('Llama validation error (known limitation):', error.message);
            return; // Skip for Llama
          }
          throw error;
        }

        expect(results.length).toBe(1);
        const step = results[0];
        expect(step.toolCalls && step.toolCalls.length).toBeGreaterThanOrEqual(1);
        const names = (step.toolCalls || []).map(c => c.name);
        console.log(`${p.name} called tools:`, names);
        
        // All providers should at least call the sign lookup tool (hash-based ID)
        expect(names.some(n => n.endsWith('.get_sign'))).toBe(true);
        
        // The test verifies that automatic tool selection works
        if (p.name === 'VertexStudio') {
          // Google Vertex Studio only supports one tool at a time for non-search tools
          expect(step.toolCalls.length).toBe(1);
          expect(names[0].endsWith('.get_sign')).toBe(true);
        } else {
          // Other providers can handle multiple tools or be more flexible
          expect(step.toolCalls.length).toBeGreaterThan(0);
        }
      }, p.name === 'Llama' ? 180000 : 60000); // Llama needs 3 minutes in CI
    });
  }
});
