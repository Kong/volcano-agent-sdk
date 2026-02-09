import { describe, it, expect } from 'vitest';
import { agent } from '../src/volcano-agent-sdk.js';

function makeMockLLM(responses: string[]) {
  let callCount = 0;
  return {
    id: 'mock',
    model: 'mock',
    client: {},
    gen: async (prompt: string) => {
      const response = responses[callCount % responses.length];
      callCount++;
      return response;
    },
    genWithTools: async () => ({ content: '', toolCalls: [] })
  } as any;
}

describe('Conversational Results API', () => {
  it('results.ask() answers questions about workflow execution', async () => {
    const workflowLlm = makeMockLLM(['Step 1 output', 'Step 2 output']);
    const summaryLlm = makeMockLLM(['The agent completed 2 steps successfully']);

    const results = await agent({ llm: workflowLlm, hideProgress: true })
      .then({ prompt: 'Task 1' })
      .then({ prompt: 'Task 2' })
      .run();

    const answer = await results.ask(summaryLlm, 'What did the agent do?');
    
    expect(answer).toBe('The agent completed 2 steps successfully');
    expect(results.length).toBe(2);
  });

  it('results.summary() provides overview of execution', async () => {
    const workflowLlm = makeMockLLM(['Analysis complete']);
    const summaryLlm = makeMockLLM(['Analyzed data and generated insights']);

    const results = await agent({ llm: workflowLlm, hideProgress: true })
      .then({ prompt: 'Analyze data' })
      .run();

    const summary = await results.summary(summaryLlm);
    
    expect(summary).toBe('Analyzed data and generated insights');
  });

  it('results.toolsUsed() lists tools that were called', async () => {
    const workflowLlm = makeMockLLM(['Done']);
    const summaryLlm = makeMockLLM(['No tools were used']);

    const results = await agent({ llm: workflowLlm, hideProgress: true })
      .then({ prompt: 'Simple task' })
      .run();

    const tools = await results.toolsUsed(summaryLlm);
    
    expect(tools).toBe('No tools were used');
  });

  it('results.errors() reports on execution errors', async () => {
    const workflowLlm = makeMockLLM(['Success']);
    const summaryLlm = makeMockLLM(['No errors detected.']);

    const results = await agent({ llm: workflowLlm, hideProgress: true })
      .then({ prompt: 'Task' })
      .run();

    const errors = await results.errors(summaryLlm);
    
    expect(errors).toBe('No errors detected.');
  });

  it('builds context with all step information', async () => {
    const workflowLlm = makeMockLLM(['Result 1', 'Result 2', 'Result 3']);
    let capturedPrompt = '';
    const summaryLlm = {
      id: 'inspector',
      model: 'inspector',
      client: {},
      gen: async (prompt: string) => {
        capturedPrompt = prompt;
        return 'Context validated';
      },
      genWithTools: async () => ({ content: '', toolCalls: [] })
    } as any;

    const results = await agent({ llm: workflowLlm, hideProgress: true })
      .then({ prompt: 'Task 1' })
      .then({ prompt: 'Task 2' })
      .then({ prompt: 'Task 3' })
      .run();

    const answer = await results.ask(summaryLlm, 'Test question');
    
    expect(answer).toBe('Context validated');
    expect(capturedPrompt).toContain('Step 1:');
    expect(capturedPrompt).toContain('Step 2:');
    expect(capturedPrompt).toContain('Step 3:');
    expect(capturedPrompt).toContain('Prompt: Task 1');
    expect(capturedPrompt).toContain('LLM Output: Result 1');
    expect(capturedPrompt).toContain('User Question: Test question');
  });

  it('can ask multiple questions about same results', async () => {
    const workflowLlm = makeMockLLM(['Completed task']);
    const summaryLlm = makeMockLLM([
      'Answer 1',
      'Answer 2',
      'Answer 3'
    ]);

    const results = await agent({ llm: workflowLlm, hideProgress: true })
      .then({ prompt: 'Do something' })
      .run();

    const q1 = await results.ask(summaryLlm, 'Question 1?');
    const q2 = await results.ask(summaryLlm, 'Question 2?');
    const q3 = await results.ask(summaryLlm, 'Question 3?');
    
    expect(q1).toBe('Answer 1');
    expect(q2).toBe('Answer 2');
    expect(q3).toBe('Answer 3');
  });

  it('works with multi-step workflows', async () => {
    const workflowLlm = makeMockLLM(['Step A', 'Step B', 'Step C', 'Step D', 'Step E']);
    const summaryLlm = makeMockLLM(['Executed 5 steps successfully']);

    const results = await agent({ llm: workflowLlm, hideProgress: true })
      .then({ prompt: 'First' })
      .then({ prompt: 'Second' })
      .then({ prompt: 'Third' })
      .then({ prompt: 'Fourth' })
      .then({ prompt: 'Fifth' })
      .run();

    expect(results.length).toBe(5);

    const summary = await results.summary(summaryLlm);
    expect(summary).toBe('Executed 5 steps successfully');
  });
});

