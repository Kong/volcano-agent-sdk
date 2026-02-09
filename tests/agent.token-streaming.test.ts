import { describe, it, expect } from 'vitest';
import { agent, type TokenMetadata } from '../src/volcano-agent-sdk.js';
import type { LLMHandle } from '../src/llms/types.js';

describe('Token-level streaming', () => {
  // Per-step onToken tests
  describe('per-step onToken', () => {
    it('calls onToken for each token when provided', async () => {
      const tokens: string[] = [];
      
      const mockLLM: LLMHandle = {
        id: 'mock-llm',
        model: 'mock-model',
        client: null,
        gen: async () => 'Hello world',
        genWithTools: async () => ({ llmOutput: 'Hello', toolCalls: [] }),
        async *genStream() {
          yield 'Hello';
          yield ' ';
          yield 'world';
        },
      };

      const results = await agent({ llm: mockLLM , hideProgress: true })
        .then({
          prompt: 'Say hello',
          onToken: (token: string) => {
            tokens.push(token);
          },
        })
        .run();

      expect(tokens).toEqual(['Hello', ' ', 'world']);
      expect(results[0].llmOutput).toBe('Hello world');
    });

    it('falls back to gen() when onToken is not provided', async () => {
      let genCalled = false;

      const mockLLM: LLMHandle = {
        id: 'mock-llm',
        model: 'mock-model',
        client: null,
        gen: async () => {
          genCalled = true;
          return 'gen called';
        },
        genWithTools: async () => ({ llmOutput: 'Test', toolCalls: [] }),
        async *genStream() {
          yield 'stream';
        },
      };

      const results = await agent({ llm: mockLLM , hideProgress: true })
        .then({ prompt: 'Test' })
        .run();

      expect(genCalled).toBe(true);
      expect(results[0].llmOutput).toBe('gen called');
    });

    it('works in multi-step workflows', async () => {
      const step1Tokens: string[] = [];
      const step2Tokens: string[] = [];

      const mockLLM: LLMHandle = {
        id: 'mock-llm',
        model: 'mock-model',
        client: null,
        gen: async () => 'Gen response',
        genWithTools: async () => ({ llmOutput: 'Tools response', toolCalls: [] }),
        async *genStream(prompt: string) {
          if (prompt.includes('step 1')) {
            yield 'First';
            yield ' step';
          } else {
            yield 'Second';
            yield ' step';
          }
        },
      };

      const results = await agent({ llm: mockLLM , hideProgress: true })
        .then({
          prompt: 'This is step 1',
          onToken: (token) => step1Tokens.push(token),
        })
        .then({
          prompt: 'This is step 2',
          onToken: (token) => step2Tokens.push(token),
        })
        .run();

      expect(step1Tokens).toEqual(['First', ' step']);
      expect(step2Tokens).toEqual(['Second', ' step']);
      expect(results[0].llmOutput).toBe('First step');
      expect(results[1].llmOutput).toBe('Second step');
    });

    it('onToken is ignored when using mcps (automatic tool selection)', async () => {
      const tokens: string[] = [];

      const mockLLM: LLMHandle = {
        id: 'mock-llm',
        model: 'mock-model',
        client: null,
        gen: async () => 'Direct response',
        genWithTools: async (prompt: string, tools: any[]) => {
          return {
            llmOutput: 'Used genWithTools',
            toolCalls: [],
          };
        },
        async *genStream() {
          yield 'This';
          yield ' should';
          yield ' not';
          yield ' fire';
        },
      };

      const results = await agent({ llm: mockLLM , hideProgress: true })
        .then({
          prompt: 'Test with mcps',
          mcps: [], // Triggers automatic tool selection path
          onToken: (token: string) => {
            // Should NOT be called with mcps
            tokens.push(token);
          },
        })
        .run();

      // onToken should be ignored when mcps is present
      expect(tokens).toEqual([]);
      // Should use genWithTools, not genStream
      expect(results[0].llmOutput).toContain('No tools available');
    });
  });

  // Run-level onToken tests
  describe('run-level onToken with metadata', () => {
    it('calls run-level onToken with metadata when no step-level onToken', async () => {
      const tokens: string[] = [];
      const metadataReceived: TokenMetadata[] = [];
      
      const mockLLM: LLMHandle = {
        id: 'test-provider',
        model: 'test-model',
        client: null,
        gen: async () => 'Test',
        genWithTools: async () => ({ llmOutput: 'Test', toolCalls: [] }),
        async *genStream() {
          yield 'A';
          yield 'B';
          yield 'C';
        },
      };

      const results = await agent({ llm: mockLLM , hideProgress: true })
        .then({ prompt: 'Test prompt' })
        .run({
          onToken: (token, meta) => {
            tokens.push(token);
            metadataReceived.push({ ...meta });
          }
        });

      expect(tokens).toEqual(['A', 'B', 'C']);
      expect(metadataReceived).toHaveLength(3);
      expect(metadataReceived[0]).toMatchObject({
        stepIndex: 0,
        handledByStep: false,
        stepPrompt: 'Test prompt',
        llmProvider: 'test-provider'
      });
      expect(results[0].llmOutput).toBe('ABC');
    });

    it('step-level onToken takes precedence over run-level', async () => {
      const runTokens: string[] = [];
      const stepTokens: string[] = [];
      
      const mockLLM: LLMHandle = {
        id: 'mock-llm',
        model: 'mock-model',
        client: null,
        gen: async () => 'Test',
        genWithTools: async () => ({ llmOutput: 'Test', toolCalls: [] }),
        async *genStream() {
          yield 'tok';
          yield 'en';
        },
      };

      const results = await agent({ llm: mockLLM , hideProgress: true })
        .then({
          prompt: 'Test',
          onToken: (token) => {
            stepTokens.push(token);
          }
        })
        .run({
          onToken: (token, meta) => {
            runTokens.push(token);
          }
        });

      expect(stepTokens).toEqual(['tok', 'en']);
      expect(runTokens).toEqual([]); // Should NOT be called
      expect(results[0].llmOutput).toBe('token');
    });

    it('provides correct metadata for different LLM providers in multi-step workflow', async () => {
      const allMetadata: TokenMetadata[] = [];
      
      const mockLLM1: LLMHandle = {
        id: 'openai-gpt-4',
        model: 'gpt-4',
        client: null,
        gen: async () => 'Test',
        genWithTools: async () => ({ llmOutput: 'Test', toolCalls: [] }),
        async *genStream() {
          yield 'GPT';
        },
      };

      const mockLLM2: LLMHandle = {
        id: 'anthropic-claude',
        model: 'claude-3',
        client: null,
        gen: async () => 'Test',
        genWithTools: async () => ({ llmOutput: 'Test', toolCalls: [] }),
        async *genStream() {
          yield 'Claude';
        },
      };

      await agent()
        .then({ llm: mockLLM1, prompt: 'Use GPT' })
        .then({ llm: mockLLM2, prompt: 'Use Claude' })
        .run({
          onToken: (token, meta) => {
            allMetadata.push({ ...meta });
          }
        });

      expect(allMetadata).toHaveLength(2);
      expect(allMetadata[0]).toMatchObject({
        stepIndex: 0,
        handledByStep: false,
        stepPrompt: 'Use GPT',
        llmProvider: 'openai-gpt-4'
      });
      expect(allMetadata[1]).toMatchObject({
        stepIndex: 1,
        handledByStep: false,
        stepPrompt: 'Use Claude',
        llmProvider: 'anthropic-claude'
      });
    });

    it('correctly sets handledByStep flag', async () => {
      const allMetadata: TokenMetadata[] = [];
      
      const mockLLM: LLMHandle = {
        id: 'test-llm',
        model: 'test',
        client: null,
        gen: async () => 'Test',
        genWithTools: async () => ({ llmOutput: 'Test', toolCalls: [] }),
        async *genStream() {
          yield 'x';
        },
      };

      await agent({ llm: mockLLM , hideProgress: true })
        .then({ prompt: 'No step handler' })
        .then({ prompt: 'Has step handler', onToken: () => {} })
        .then({ prompt: 'No step handler again' })
        .run({
          onToken: (token, meta) => {
            allMetadata.push({ ...meta });
          }
        });

      // Should only receive tokens from steps 0 and 2 (not step 1 with handler)
      expect(allMetadata).toHaveLength(2);
      expect(allMetadata[0].handledByStep).toBe(false);
      expect(allMetadata[0].stepIndex).toBe(0);
      expect(allMetadata[1].handledByStep).toBe(false);
      expect(allMetadata[1].stepIndex).toBe(2);
    });

    it('supports onStep callback for step completion tracking', async () => {
      const completedSteps: any[] = [];
      
      const mockLLM: LLMHandle = {
        id: 'test-llm',
        model: 'test',
        client: null,
        gen: async () => 'Test',
        genWithTools: async () => ({ llmOutput: 'Test', toolCalls: [] }),
        async *genStream() {
          yield 'ok';
        },
      };

      await agent({ llm: mockLLM , hideProgress: true })
        .then({ prompt: 'First' })
        .then({ prompt: 'Second' })
        .run({
          onStep: (step, stepIndex) => {
            completedSteps.push({ stepIndex, output: step.llmOutput });
          }
        });

      expect(completedSteps).toEqual([
        { stepIndex: 0, output: 'Test' },
        { stepIndex: 1, output: 'Test' }
      ]);
    });

    it('maintains backward compatibility with run(callback)', async () => {
      const completedSteps: any[] = [];
      
      const mockLLM: LLMHandle = {
        id: 'test-llm',
        model: 'test',
        client: null,
        gen: async () => 'Test',
        genWithTools: async () => ({ llmOutput: 'Test', toolCalls: [] }),
        async *genStream() {
          yield 'ok';
        },
      };

      await agent({ llm: mockLLM , hideProgress: true })
        .then({ prompt: 'Test' })
        .run((step, stepIndex) => {
          completedSteps.push({ stepIndex, output: step.llmOutput });
        });

      expect(completedSteps).toEqual([{ stepIndex: 0, output: 'Test' }]);
    });
  });
});

