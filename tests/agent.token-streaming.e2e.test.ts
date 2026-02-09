import { describe, it, expect } from 'vitest';
import { agent, llmOpenAI, llmBedrock, type TokenMetadata } from '../src/volcano-agent-sdk.js';

describe('Token streaming e2e (live APIs)', () => {
  it('validates per-step onToken with live OpenAI', async () => {
    const tokens: string[] = [];
    let tokenCount = 0;

    const llm = llmOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o-mini'
    });

    const results = await agent({ llm, hideProgress: true })
      .then({
        prompt: 'Say "Hello World" exactly.',
        onToken: (token: string) => {
          tokens.push(token);
          tokenCount++;
        }
      })
      .run();

    // Verify tokens were received
    expect(tokenCount).toBeGreaterThan(0);
    expect(tokens.length).toBeGreaterThan(0);
    
    // Verify tokens concatenate to final output
    const concatenated = tokens.join('');
    expect(concatenated).toBe(results[0].llmOutput);
    
    // Verify output contains expected content
    expect(results[0].llmOutput).toContain('Hello');
    expect(results[0].llmOutput).toContain('World');
  });

  it('validates run-level onToken with metadata using live OpenAI', async () => {
    const tokens: string[] = [];
    const metadata: TokenMetadata[] = [];

    const llm = llmOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o-mini'
    });

    const results = await agent({ llm, hideProgress: true })
      .then({ prompt: 'Count to 3.' })
      .run({
        onToken: (token, meta) => {
          tokens.push(token);
          metadata.push({ ...meta });
        }
      });

    // Verify tokens were received
    expect(tokens.length).toBeGreaterThan(0);
    
    // Verify metadata
    expect(metadata.length).toBe(tokens.length);
    for (const meta of metadata) {
      expect(meta.stepIndex).toBe(0);
      expect(meta.handledByStep).toBe(false);
      expect(meta.stepPrompt).toBe('Count to 3.');
      expect(meta.llmProvider).toContain('OpenAI');
    }
    
    // Verify tokens concatenate correctly
    expect(tokens.join('')).toBe(results[0].llmOutput);
  });

  it('validates multi-step with OpenAI and Bedrock with mixed onToken callbacks', async () => {
    const step1Tokens: string[] = [];
    const streamTokens: string[] = [];
    const streamMetadata: TokenMetadata[] = [];

    const openai = llmOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o-mini'
    });

    const bedrock = llmBedrock({
      model: process.env.BEDROCK_MODEL || 'amazon.nova-micro-v1:0',
      region: process.env.AWS_REGION || 'us-east-1',
      token: process.env.AWS_BEARER_TOKEN_BEDROCK!
    });

    const results = await agent()
      .then({
        llm: openai,
        prompt: 'Say "OpenAI" exactly.',
        onToken: (token) => {
          // Step-level handler for step 1
          step1Tokens.push(token);
        }
      })
      .then({
        llm: bedrock,
        prompt: 'Say "Bedrock" exactly.',
        // No step-level onToken, so run-level will handle it
      })
      .run({
        onToken: (token, meta) => {
          // Run-level handler
          streamTokens.push(token);
          streamMetadata.push({ ...meta });
        }
      });

    // Verify step 1 used step-level onToken
    expect(step1Tokens.length).toBeGreaterThan(0);
    expect(step1Tokens.join('')).toBe(results[0].llmOutput);
    
    // Verify step 2 used run-level onToken
    expect(streamTokens.length).toBeGreaterThan(0);
    expect(streamTokens.join('')).toBe(results[1].llmOutput);
    
    // Verify metadata for step 2 only (step 1 was handled by step-level)
    expect(streamMetadata.length).toBe(streamTokens.length);
    for (const meta of streamMetadata) {
      expect(meta.stepIndex).toBe(1);
      expect(meta.handledByStep).toBe(false);
      expect(meta.stepPrompt).toBe('Say "Bedrock" exactly.');
      expect(meta.llmProvider).toContain('Bedrock');
    }
    
    // Verify both steps completed
    expect(results).toHaveLength(2);
    expect(results[0].llmOutput).toContain('OpenAI');
    expect(results[1].llmOutput).toContain('Bedrock');
  });

  it('validates handledByStep flag accurately in mixed scenarios', { timeout: 30000 }, async () => {
    const allMetadata: TokenMetadata[] = [];
    const step2Tokens: string[] = [];

    const llm = llmOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o-mini'
    });

    const results = await agent({ llm, hideProgress: true })
      .then({ 
        prompt: 'Say "Step1".',
        // No step-level onToken - uses run-level
      })
      .then({ 
        prompt: 'Say "Step2".',
        onToken: (token) => {
          // Has step-level onToken
          step2Tokens.push(token);
        }
      })
      .then({ 
        prompt: 'Say "Step3".',
        // No step-level onToken - uses run-level
      })
      .run({
        onToken: (token, meta) => {
          allMetadata.push({ ...meta });
        }
      });

    // Run-level should only receive tokens from steps 0 and 2 (not step 1)
    const step0Metadata = allMetadata.filter(m => m.stepIndex === 0);
    const step1Metadata = allMetadata.filter(m => m.stepIndex === 1);
    const step2Metadata = allMetadata.filter(m => m.stepIndex === 2);

    // Step 0: run-level handled it
    expect(step0Metadata.length).toBeGreaterThan(0);
    expect(step0Metadata.every(m => m.handledByStep === false)).toBe(true);
    expect(step0Metadata.every(m => m.stepPrompt === 'Say "Step1".')).toBe(true);

    // Step 1: step-level handled it, so NO metadata in run-level
    expect(step1Metadata.length).toBe(0);

    // Step 2: run-level handled it
    expect(step2Metadata.length).toBeGreaterThan(0);
    expect(step2Metadata.every(m => m.handledByStep === false)).toBe(true);
    expect(step2Metadata.every(m => m.stepPrompt === 'Say "Step3".')).toBe(true);

    // Verify step 2 tokens were collected by step-level handler
    expect(step2Tokens.length).toBeGreaterThan(0);
    expect(step2Tokens.join('')).toBe(results[1].llmOutput);

    // Verify all steps completed
    expect(results).toHaveLength(3);
    // Allow for minor formatting variations (Step1, Step 1, Step 1., etc)
    expect(results[0].llmOutput.replace(/\s+/g, '')).toMatch(/Step1/i);
    expect(results[1].llmOutput.replace(/\s+/g, '')).toMatch(/Step2/i);
    expect(results[2].llmOutput.replace(/\s+/g, '')).toMatch(/Step3/i);
  });

  it('validates onStep callback works alongside onToken', { timeout: 15000 }, async () => {
    const tokens: string[] = [];
    const completedSteps: Array<{ index: number; duration: number | undefined }> = [];

    const llm = llmOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o-mini'
    });

    const results = await agent({ llm, hideProgress: true })
      .then({ prompt: 'Say "One".' })
      .then({ prompt: 'Say "Two".' })
      .run({
        onToken: (token) => {
          tokens.push(token);
        },
        onStep: (step, index) => {
          completedSteps.push({ index, duration: step.durationMs });
        }
      });

    // Verify both callbacks fired
    expect(tokens.length).toBeGreaterThan(0);
    expect(completedSteps).toHaveLength(2);
    
    // Verify onStep received correct indices
    expect(completedSteps[0].index).toBe(0);
    expect(completedSteps[1].index).toBe(1);
    
    // Verify duration was tracked
    expect(completedSteps[0].duration).toBeGreaterThan(0);
    expect(completedSteps[1].duration).toBeGreaterThan(0);
    
    // Verify results
    expect(results).toHaveLength(2);
  });

  it('validates backward compatibility with old run(callback) API', async () => {
    const completedSteps: any[] = [];

    const llm = llmOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o-mini'
    });

    // Old API: pass callback directly (no object)
    const results = await agent({ llm, hideProgress: true })
      .then({ prompt: 'Say "Test".' })
      .run((step, stepIndex) => {
        completedSteps.push({ stepIndex, output: step.llmOutput });
      });

    // Old API should still work
    expect(completedSteps).toHaveLength(1);
    expect(completedSteps[0].stepIndex).toBe(0);
    expect(completedSteps[0].output).toContain('Test');
    expect(results).toHaveLength(1);
  });
});

