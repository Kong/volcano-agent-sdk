import { describe, it, expect } from 'vitest';
import { agent, llmOpenAI, llmVertexStudio } from '../dist/volcano-agent-sdk.js';

describe('agent run() with onStep callback (live APIs)', () => {
  it('provides OpenAI workflow results in real-time via onStep', async () => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for this test');
    }

    const llm = llmOpenAI({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-5-mini' });
    const stepResults: any[] = [];
    const timestamps: number[] = [];

    await agent({ llm, hideProgress: true })
      .then({ prompt: 'Say "Step 1 complete"' })
      .then({ prompt: 'Say "Step 2 complete"' })
      .run({ 
        onStep: (step, stepIndex) => {
          console.log(`Live onStep - Step ${stepIndex + 1}: ${step.llmOutput}`);
          timestamps.push(Date.now());
          stepResults.push(step);
        }
      });

    expect(stepResults).toHaveLength(2);
    expect(stepResults[0].llmOutput).toContain('Step 1');
    expect(stepResults[1].llmOutput).toContain('Step 2');
    expect(timestamps[1] - timestamps[0]).toBeGreaterThan(100); // Real delay between steps
  }, 30000);

  it('provides Vertex Studio workflow results via onStep', async () => {
    if (!process.env.GCP_VERTEX_API_KEY) {
      throw new Error('GCP_VERTEX_API_KEY is required for this test');
    }

    const llm = llmVertexStudio({ 
      apiKey: process.env.GCP_VERTEX_API_KEY!, 
      model: 'gemini-2.5-flash-lite' 
    });
    const stepResults: any[] = [];

    await agent({ llm, hideProgress: true })
      .then({ prompt: 'Reply with: VERTEX_STREAM_1' })
      .then({ prompt: 'Reply with: VERTEX_STREAM_2' })
      .run({ 
        onStep: (step) => {
          stepResults.push(step);
          console.log(`Vertex onStep result: ${step.llmOutput}`);
        }
      });

    expect(stepResults).toHaveLength(2);
    expect(stepResults[0].llmOutput).toContain('VERTEX_STREAM_1');
    expect(stepResults[1].llmOutput).toContain('VERTEX_STREAM_2');
  }, 30000);

  it('compares run() with and without onStep callback for same workflow', async () => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for this test');
    }

    const llm = llmOpenAI({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-5-mini' });
    
    const runResults = await agent({ llm, hideProgress: true })
      .then({ prompt: 'Count to 2' })
      .then({ prompt: 'Say done' })
      .run();

    const callbackResults: any[] = [];
    await agent({ llm, hideProgress: true })
      .then({ prompt: 'Count to 2' })
      .then({ prompt: 'Say done' })
      .run({ 
        onStep: (step) => callbackResults.push(step)
      });

    // Both should produce equivalent results
    expect(callbackResults).toHaveLength(runResults.length);
    expect(callbackResults[0].prompt).toBe(runResults[0].prompt);
    expect(callbackResults[1].prompt).toBe(runResults[1].prompt);
    // Content may vary slightly due to LLM non-determinism, so just check structure
    expect(typeof callbackResults[0].llmOutput).toBe('string');
    expect(typeof callbackResults[1].llmOutput).toBe('string');
  }, 30000);
});
