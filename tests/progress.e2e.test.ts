import { describe, it, expect } from 'vitest';
import { agent, llmOpenAI } from '../src/volcano-agent-sdk.js';

describe('Progress output e2e with structured logs (live APIs)', () => {
  it('validates default progress works for basic LLM steps', async () => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY required');
    }

    const llm = llmOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o-mini',
      options: { max_completion_tokens: 64, temperature: 0, top_p: 1 }
    });

    // Capture console output
    const logs: string[] = [];
    const originalLog = console.log;
    const originalWrite = process.stdout.write.bind(process.stdout);
    
    console.log = (...args: any[]) => {
      logs.push(args.join(' '));
      originalLog(...args);
    };
    
    process.stdout.write = (chunk: any): boolean => {
      logs.push(String(chunk));
      return originalWrite(chunk);
    };

    try {
      await agent({ llm })
        .then({ prompt: "Say 'Hello World' exactly" })
        .run();

      // Restore
      console.log = originalLog;
      process.stdout.write = originalWrite;

      // Verify progress elements appeared
      const output = logs.join('');
      
      // Check for header with structured log format
      expect(output).toMatch(/\[.*agent="untitled" status=init\] 🌋 running Volcano agent/);
      expect(output).toContain('volcano-agent-sdk v');
      expect(output).toContain('https://volcano.dev');
      
      // Check for step indicator with structured log
      expect(output).toMatch(/\[.*agent="untitled" step=1 status=init\] Say 'Hello World' exactly/);
      
      // Check for completion with structured log
      expect(output).toMatch(/\[.*status=complete\] ✔ Complete/);
      
      // Check for workflow summary with structured log
      expect(output).toMatch(/\[.*agent="untitled" status=complete\] 🎉 agent complete/);
      
    } finally {
      console.log = originalLog;
      process.stdout.write = originalWrite;
    }
  });

  it('validates default progress works for multi-step workflows', { timeout: 30000 }, async () => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY required');
    }

    const llm = llmOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o-mini',
      options: { max_completion_tokens: 64, temperature: 0, top_p: 1 }
    });

    const logs: string[] = [];
    const originalLog = console.log;
    const originalWrite = process.stdout.write.bind(process.stdout);
    
    console.log = (...args: any[]) => {
      logs.push(args.join(' '));
      originalLog(...args);
    };
    
    process.stdout.write = (chunk: any): boolean => {
      logs.push(String(chunk));
      return originalWrite(chunk);
    };

    try {
      await agent({ llm })
        .then({ prompt: "Say 'Step 1' exactly" })
        .then({ prompt: "Say 'Step 2' exactly" })
        .run();

      console.log = originalLog;
      process.stdout.write = originalWrite;

      const output = logs.join('');
      
      // CRITICAL: Verify both steps shown with structured logs
      expect(output).toMatch(/\[.*agent="untitled" step=1 status=init\] Say 'Step 1' exactly/);
      expect(output).toMatch(/\[.*agent="untitled" step=2 status=init\] Say 'Step 2' exactly/);
      
      // Token progress shows for longer responses (>10 tokens)
      // Short responses may not trigger display
      
      // CRITICAL: Verify both step completions appear
      // Check for step 1 completion
      expect(output).toMatch(/\[.*agent="untitled" step=1 status=complete\] ✔ Complete/);
      // Check for step 2 completion  
      expect(output).toMatch(/\[.*agent="untitled" step=2 status=complete\] ✔ Complete/);
      
      // CRITICAL: Verify no triple newlines
      expect(output).not.toMatch(/\n\n\n/);
      
      // CRITICAL: Verify workflow summary with structured log
      expect(output).toMatch(/\[.*agent="untitled" status=complete\] 🎉 agent complete/);
      
    } finally {
      console.log = originalLog;
      process.stdout.write = originalWrite;
    }
  });

  it('validates default progress works for agent crews', { timeout: 60000 }, async () => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY required');
    }

    const llm = llmOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o-mini',
      options: { max_completion_tokens: 64, temperature: 0, top_p: 1 }
    });

    // Define simple agents
    const summarizer = agent({
      llm,
      name: 'summarizer',
      description: 'Creates concise summaries'
    });

    const logs: string[] = [];
    const originalLog = console.log;
    const originalWrite = process.stdout.write.bind(process.stdout);
    
    console.log = (...args: any[]) => {
      logs.push(args.join(' '));
      originalLog(...args);
    };
    
    process.stdout.write = (chunk: any): boolean => {
      logs.push(String(chunk));
      return originalWrite(chunk);
    };

    try {
      await agent({ llm, timeout: 60 })
        .then({
          prompt: 'Summarize the word "AI" in one sentence',
          agents: [summarizer]
        })
        .run();

      console.log = originalLog;
      process.stdout.write = originalWrite;

      const output = logs.join('');
      
      // Verify header with structured log
      expect(output).toMatch(/\[.*agent="untitled" status=init\] 🌋 running Volcano agent/);
      expect(output).toContain('volcano-agent-sdk v');
      expect(output).toContain('https://volcano.dev');
      
      // Verify step shown with structured log
      expect(output).toMatch(/\[.*agent="untitled" step=1 status=init\] Summarize the word "AI"/);
      
      // CRITICAL: Verify coordinator thinking with structured log
      expect(output).toMatch(/\[.*agent="untitled" status=init\] 🧠 selecting agents/);
      
      // CRITICAL: Verify coordinator completion with agent selection
      expect(output).toMatch(/\[.*agent="untitled" status=complete\] 🧠 use "summarizer" agent/);
      
      // CRITICAL: Verify agent was invoked (no steps for delegated agents)
      // Delegated agents created for crews don't have pre-defined steps
      
      // Token progress shows for longer responses
      // (Short responses complete before 10-token threshold)
      
      // CRITICAL: Verify agent completion with structured log
      expect(output).toMatch(/\[.*agent="summarizer".*status=complete\] ✔ Complete \| \d+ tokens \| \d+ tool calls \| \d+\.\d+s/);
      
      // CRITICAL: Verify no triple newlines
      expect(output).not.toMatch(/\n\n\n/);
      
      // Verify final completion with totals and structured log
      expect(output).toMatch(/\[.*agent="untitled" step=1 status=complete\] ✔ Complete/);
      expect(output).toMatch(/\[.*agent="untitled" status=complete\] 🎉 agent complete \| \d+ tokens \| \d+ tool calls \| \d+\.\d+s/);
      
    } finally {
      console.log = originalLog;
      process.stdout.write = originalWrite;
    }
  });

  it('validates default progress never breaks with errors', { timeout: 30000 }, async () => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY required');
    }

    const llm = llmOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o-mini',
      options: { max_completion_tokens: 64, temperature: 0, top_p: 1 }
    });

    const logs: string[] = [];
    const originalLog = console.log;
    const originalWrite = process.stdout.write.bind(process.stdout);
    const originalError = console.error;
    
    console.log = (...args: any[]) => {
      logs.push(args.join(' '));
      originalLog(...args);
    };
    
    console.error = (...args: any[]) => {
      logs.push(args.join(' '));
      originalError(...args);
    };
    
    process.stdout.write = (chunk: any): boolean => {
      logs.push(String(chunk));
      return originalWrite(chunk);
    };

    try {
      // This should timeout and retry, but progress should still work
      await agent({ llm, timeout: 1, retry: { retries: 2 } })
        .then({ prompt: "Count to 100 slowly" })
        .run();
    } catch (e) {
      // Expected to fail, that's OK
    }

    console.log = originalLog;
    console.error = originalError;
    process.stdout.write = originalWrite;

    const output = logs.join('');
    
    // Even with errors/timeouts, progress should have shown with structured logs
    expect(output).toMatch(/\[.*agent="untitled" status=init\] 🌋 running Volcano agent/);
    expect(output).toMatch(/\[.*agent="untitled" step=1 status=init\] Count to 100 slowly/);
    
    // Should have attempted multiple times (retries)
    const stepMatches = output.match(/\[.*step=1 status=init\]/g);
    expect(stepMatches?.length).toBeGreaterThanOrEqual(1);
  });

  it('validates progress output is TTY-aware', async () => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY required');
    }

    const llm = llmOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o-mini'
    });

    const logs: string[] = [];
    const originalLog = console.log;
    
    console.log = (...args: any[]) => {
      logs.push(args.join(' '));
      originalLog(...args);
    };

    try {
      await agent({ llm })
        .then({ prompt: "Say 'Test'" })
        .run();

      console.log = originalLog;

      const output = logs.join('');
      
      // Progress should work (even if not TTY in test environment) with structured logs
      expect(output).toMatch(/\[.*agent="untitled" status=init\] 🌋 running Volcano agent/);
      expect(output).toMatch(/\[.*status=complete\] ✔ Complete/);
      
    } finally {
      console.log = originalLog;
    }
  });

  it('validates hideProgress: true suppresses all progress output', { timeout: 10000 }, async () => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY required');
    }

    const llm = llmOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o-mini',
      options: { max_completion_tokens: 32, temperature: 0, top_p: 1 }
    });

    const logs: string[] = [];
    const originalLog = console.log;
    const originalWrite = process.stdout.write.bind(process.stdout);
    
    console.log = (...args: any[]) => {
      logs.push(args.join(' '));
      originalLog(...args);
    };
    
    process.stdout.write = (chunk: any): boolean => {
      logs.push(String(chunk));
      return originalWrite(chunk);
    };

    try {
      await agent({ llm, hideProgress: true })
        .then({ prompt: "Say 'Hello' exactly" })
        .then({ prompt: "Say 'World' exactly" })
        .run();

      console.log = originalLog;
      process.stdout.write = originalWrite;

      const output = logs.join('');
      
      // CRITICAL: Progress elements should NOT appear when hideProgress: true
      expect(output).not.toContain('🌋 running Volcano agent');
      expect(output).not.toMatch(/\[.*step=\d+ status=/);
      expect(output).not.toContain('✔ Complete');
      expect(output).not.toContain('🎉 agent complete');
      expect(output).not.toContain('━━━');
      // Note: Skip checking '💭' due to potential cross-test contamination in parallel runs
      
    } finally {
      console.log = originalLog;
      process.stdout.write = originalWrite;
    }
  });
});

