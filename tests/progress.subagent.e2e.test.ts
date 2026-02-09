import { describe, it, expect } from 'vitest';
import { agent, llmOpenAI } from '../src/volcano-agent-sdk.js';

describe('Sub-agent progress with structured logs (e2e)', () => {
  it('shows correct step numbering for sub-agents (Step 2/3, Step 3/3)', { timeout: 30000 }, async () => {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required');

    const llm = llmOpenAI({ 
      apiKey: process.env.OPENAI_API_KEY!, 
      model: 'gpt-4o-mini',
      options: { max_completion_tokens: 32, temperature: 0, top_p: 1 }
    });

    // Define sub-agents with progress
    const summarizer = agent({ llm })
      .then({ prompt: "Summarize in one word" });

    const formalizer = agent({ llm })
      .then({ prompt: "Make it formal" });

    const logs: string[] = [];
    const originalLog = console.log;
    const originalWrite = process.stdout.write.bind(process.stdout);

    console.log = (...args: any[]) => { logs.push(args.join(' ')); originalLog(...args); };
    process.stdout.write = (chunk: any): boolean => { logs.push(String(chunk)); return originalWrite(chunk); };

    try {
      await agent({ llm })
        .then({ prompt: "Text: 'Hello World'" })
        .runAgent(summarizer)
        .runAgent(formalizer)
        .run();
    } finally {
      console.log = originalLog;
      process.stdout.write = originalWrite;
    }

    const output = logs.join('');

    // CRITICAL: Verify parent shows header with structured log
    expect(output).toMatch(/\[.*agent="untitled" status=init\] 🌋 running Volcano agent/);
    
    // CRITICAL: Verify each step is numbered correctly (each agent numbers its own steps from 1)
    expect(output).toMatch(/\[.*agent="untitled" step=1 status=init\] Text: 'Hello World'/);  // Parent step
    expect(output).toMatch(/\[.*agent="untitled" step=1 status=init\] Summarize in one word/);  // Second step (sub-agent 1)
    expect(output).toMatch(/\[.*agent="untitled" step=1 status=init\] Make it formal/);  // Third step (sub-agent 2)
    
    // CRITICAL: Verify sub-agents don't show duplicate headers
    const headerMatches = output.match(/🌋 running Volcano agent/g);
    expect(headerMatches?.length).toBe(1);  // Only one header
    
    // CRITICAL: Verify only one final summary with structured log
    const summaryMatches = output.match(/\[.*agent="untitled" status=complete\] 🎉 agent complete/g);
    expect(summaryMatches?.length).toBe(1);
    
    // CRITICAL: Verify no triple newlines
    expect(output).not.toMatch(/\n\n\n/);
  });
});

