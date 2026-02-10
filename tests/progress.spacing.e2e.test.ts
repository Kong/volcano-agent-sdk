import { describe, it, expect } from 'vitest';
import { agent, llmOpenAI } from '../src/volcano-agent-sdk.js';
import { renderAnsi } from './progress.renderer.test.js';

describe('Progress spacing and clearing (e2e)', () => {
  it('ensures coordinator/agent spacing has no doubles and clears interim lines', { timeout: 90000 }, async () => {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required');

    const llm = llmOpenAI({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-4o-mini', options: { max_completion_tokens: 64, temperature: 0, top_p: 1 } });

    // Build two simple agents to force coordinator -> agent -> coordinator flow
    const researcher = agent({ llm, name: 'researcher', description: 'Research facts' });
    const writer = agent({ llm, name: 'writer', description: 'Write content' });

    const logs: string[] = [];
    const originalLog = console.log;
    const originalWrite = process.stdout.write.bind(process.stdout);

    console.log = (...args: any[]) => { logs.push(args.join(' ')); originalLog(...args); };
    process.stdout.write = (chunk: any): boolean => { logs.push(String(chunk)); return originalWrite(chunk); };

    try {
      await agent({ llm, timeout: 45 })
        .then({
          prompt: 'Pick an agent then finalize in one sentence.',
          agents: [researcher, writer],
        })
        .run();
    } finally {
      console.log = originalLog;
      process.stdout.write = originalWrite;
    }

    const outputRaw = logs.join('');
    const output = renderAnsi(outputRaw);

    // No duplicate blank lines between coordinator/agent sections
    expect(output).not.toMatch(/\n\n\n/);

    // Check for structured log format with timestamps
    expect(output).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z agent="untitled" status=init\] 🌋 running Volcano agent/);
    
    // Coordinator selecting agents
    expect(output).toMatch(/\[.*agent="untitled" status=init\] 🧠 selecting agents/);
    
    // Coordinator completion with agent selection
    expect(output).toMatch(/\[.*agent="untitled" status=complete\] 🧠 use "(researcher|writer)" agent/);
    
    // Agent execution (delegated agents don't have pre-defined steps)
    expect(output).toMatch(/\[.*agent="(researcher|writer)".*status=complete\] ✔ Complete/);
    
    // Final workflow completion
    expect(output).toMatch(/\[.*agent="untitled" status=complete\] 🎉 agent complete/);
  });
});


