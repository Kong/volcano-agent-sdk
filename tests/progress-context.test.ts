import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { agent } from '../src/volcano-agent-sdk.js';

describe('Progress and Context for Ask/Summary', () => {
  let logs: string[] = [];
  let originalLog: typeof console.log;
  
  beforeEach(() => {
    logs = [];
    originalLog = console.log;
    console.log = (...args: any[]) => {
      logs.push(args.join(' '));
    };
  });
  
  afterEach(() => {
    console.log = originalLog;
  });
  
  it('should show structured logs for ask() operations', async () => {
    const mockLLM = {
      gen: async (prompt: string) => {
        // Simulate token generation time
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'This is the answer to your question.';
      }
    };
    
    // Create some results to ask about
    const results = await agent({ llm: mockLLM })
      .then({ prompt: 'Test task' })
      .run();
    
    // Use ask() method
    await results.ask(mockLLM, 'What happened?');
    
    // Check that structured logs were generated
    const output = logs.join('\n');
    
    // Should have ask init log
    expect(output).toMatch(/\[.*agent="untitled" step=ask status=init\] answering "What happened\?"/);
    
    // Should have ask complete log  
    expect(output).toMatch(/\[.*agent="untitled" step=ask status=complete\] ✔ Complete/);
  });
  
  it('should show structured logs for summary() operations', async () => {
    const mockLLM = {
      gen: async (prompt: string) => {
        return 'Summary: Task completed successfully.';
      }
    };
    
    const results = await agent({ llm: mockLLM })
      .then({ prompt: 'Process data' })
      .run();
    
    await results.summary(mockLLM);
    
    const output = logs.join('\n');
    
    // summary() internally calls ask() with a specific question
    expect(output).toMatch(/\[.*agent="untitled" step=ask status=init\] answering "Provide a brief summary/);
    expect(output).toMatch(/\[.*agent="untitled" step=ask status=complete\] ✔ Complete/);
  });
  
  it('should show proper metrics in ask() complete logs', async () => {
    let tokenCount = 0;
    const mockLLM = {
      genStream: async function* (prompt: string) {
        const response = 'Token by token response for testing metrics';
        for (const char of response) {
          tokenCount++;
          yield char;
        }
      },
      getUsage: () => ({ total_tokens: 150 }) // Simulate token usage
    };
    
    const results = await agent({ llm: mockLLM })
      .then({ prompt: 'Stream test' })
      .run();
    
    await results.ask(mockLLM, 'How did it go?');
    
    const output = logs.join('\n');
    
    // Should show token count and duration
    expect(output).toMatch(/✔ Complete \| \d+ tokens \| 0 tool calls \| \d+\.\d+s/);
    
    // Should use actual token count from usage if available
    expect(output).toContain('150 tokens');
  });
  
  it('should include multi-agent context in ask prompts', async () => {
    let capturedAskPrompt = '';
    let coordinatorCallCount = 0;
    
    const coordinator = {
      gen: async (prompt: string) => {
        coordinatorCallCount++;
        
        // First call: initial prompt with agent context
        if (coordinatorCallCount === 1 && prompt.includes('You can coordinate work')) {
          return 'USE researcher: Find information about testing';
        }
        
        // Second call: after delegation completes
        if (coordinatorCallCount === 2 && prompt.includes("Agent 'researcher' completed their task")) {
          return 'DONE: Report created with research findings';
        }
        
        // Third call: the ask() prompt
        if (prompt.includes('You are analyzing the results')) {
          capturedAskPrompt = prompt;
          return 'The researcher agent was used to find information.';
        }
        
        return 'Default response';
      },
      getUsage: () => ({ total_tokens: 100 })
    };
    
    const researcherLLM = {
      gen: async () => 'Research findings: Found 10 items about testing',
      getUsage: () => ({ total_tokens: 50 })
    };
    
    const researcher = agent({
      llm: researcherLLM,
      name: 'researcher',
      description: 'Finds information'
    }).then({ prompt: 'Research the topic' });
    
    // Run multi-agent workflow
    const results = await agent({ llm: coordinator })
      .then({ 
        prompt: 'Create report',
        agents: [researcher]
      })
      .run();
    
    // Ask about the agents
    await results.ask(coordinator, 'Which agents were used?');
    
    // Check the captured prompt includes agent context
    expect(capturedAskPrompt).toContain('Agent Execution Results:');
    expect(capturedAskPrompt).toContain('Agents Used:');
    expect(capturedAskPrompt).toContain('- researcher: Find information about testing');
  });
  
  it('should handle parallel ask() calls', async () => {
    const mockLLM = {
      gen: async (prompt: string) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        if (prompt.includes('first question')) return 'First answer';
        if (prompt.includes('second question')) return 'Second answer';
        return 'Default answer';
      }
    };
    
    const results = await agent({ llm: mockLLM })
      .then({ prompt: 'Parallel test' })
      .run();
    
    // Run multiple ask() calls in parallel
    const [answer1, answer2] = await Promise.all([
      results.ask(mockLLM, 'first question'),
      results.ask(mockLLM, 'second question')
    ]);
    
    expect(answer1).toBe('First answer');
    expect(answer2).toBe('Second answer');
    
    const output = logs.join('\n');
    
    // Should have logs for both ask operations
    expect(output).toMatch(/answering "first question"/);
    expect(output).toMatch(/answering "second question"/);
  });
  
  it('should not show header for ask() operations', async () => {
    const mockLLM = {
      gen: async () => 'Response'
    };
    
    const results = await agent({ llm: mockLLM, hideProgress: true })
      .then({ prompt: 'No progress test' })
      .run();
    
    // Clear logs from the run
    logs = [];
    
    // Call ask - should still show logs even with hideProgress
    await results.ask(mockLLM, 'Question');
    
    const output = logs.join('\n');
    
    // Should NOT have the volcano header
    expect(output).not.toContain('🌋 running Volcano agent');
    
    // Should have ask logs
    expect(output).toContain('answering "Question"');
  });
});
