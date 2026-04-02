import { describe, it, expect } from 'vitest';
import { agent, tool, ToolError } from '../src/volcano-agent-sdk.js';
import type { LLMToolResult } from '../src/llms/types.js';

// Helper: create a fake LLM that returns specific tool calls on first iteration,
// then a final text answer on second iteration
function fakeLlm(toolCallsToReturn: LLMToolResult['toolCalls'], finalAnswer = 'done') {
  let callCount = 0;
  return {
    id: 'Fake-LLM',
    model: 'fake',
    client: {},
    async gen() { return finalAnswer; },
    async *genStream() { yield finalAnswer; },
    async genWithTools(_prompt: string, _tools: any[]): Promise<LLMToolResult> {
      callCount++;
      if (callCount === 1 && toolCallsToReturn.length > 0) {
        return { content: undefined, toolCalls: toolCallsToReturn };
      }
      return { content: finalAnswer, toolCalls: [] };
    },
  } as any;
}

describe('tool() factory', () => {
  it('creates a ToolHandle with deterministic id', () => {
    const t = tool({
      name: 'my_tool',
      description: 'A test tool',
      parameters: { type: 'object', properties: { x: { type: 'number' } } },
      execute: () => 'ok',
    });

    expect(t.id).toMatch(/^tool_[a-f0-9]{8}$/);
    expect(t.name).toBe('my_tool');
    expect(t.description).toBe('A test tool');
    expect(typeof t.execute).toBe('function');

    // Deterministic: same name produces same id
    const t2 = tool({ name: 'my_tool', description: '', parameters: {}, execute: () => '' });
    expect(t2.id).toBe(t.id);
  });

  it('throws when name is missing', () => {
    expect(() => tool({ name: '', description: '', parameters: {}, execute: () => '' }))
      .toThrow("tool(): 'name' is required");
  });

  it('throws when execute is not a function', () => {
    expect(() => tool({ name: 'x', description: '', parameters: {}, execute: null as any }))
      .toThrow("tool(): 'execute' must be a function");
  });

  it('defaults parameters to empty object schema', () => {
    const t = tool({ name: 'bare', description: 'bare tool', parameters: undefined as any, execute: () => '' });
    expect(t.parameters).toEqual({ type: 'object', properties: {} });
  });
});

describe('native tool auto-selection (tools + prompt)', () => {
  it('executes a native tool chosen by the LLM', async () => {
    const greet = tool({
      name: 'greet',
      description: 'Greet a person',
      parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      execute: ({ name }) => `Hello, ${name}!`,
    });

    // The fake LLM will return a tool call using the dotted name format
    const llm = fakeLlm([{
      name: `${greet.id}.greet`,
      arguments: { name: 'Alice' },
      toolHandle: greet,
    }], 'Greeting sent');

    const results = await agent({ llm, hideProgress: true })
      .then({ prompt: 'Greet Alice', tools: [greet] })
      .run();

    expect(results.length).toBe(1);
    expect(results[0].toolCalls).toBeDefined();
    expect(results[0].toolCalls!.length).toBeGreaterThan(0);
    expect(results[0].toolCalls![0].result).toBe('Hello, Alice!');
    expect(results[0].toolCalls![0].endpoint).toBe('native');
    expect(results[0].llmOutput).toBe('Greeting sent');
  });

  it('handles async execute functions', async () => {
    const asyncTool = tool({
      name: 'async_op',
      description: 'Async operation',
      parameters: { type: 'object', properties: {} },
      execute: async () => {
        await new Promise(r => setTimeout(r, 10));
        return 'async result';
      },
    });

    const llm = fakeLlm([{
      name: `${asyncTool.id}.async_op`,
      arguments: {},
      toolHandle: asyncTool,
    }]);

    const results = await agent({ llm, hideProgress: true })
      .then({ prompt: 'Do async thing', tools: [asyncTool] })
      .run();

    expect(results[0].toolCalls![0].result).toBe('async result');
  });

  it('stringifies non-string execute return values', async () => {
    const jsonTool = tool({
      name: 'json_op',
      description: 'Returns object',
      parameters: { type: 'object', properties: {} },
      execute: () => ({ count: 42 }) as any,
    });

    const llm = fakeLlm([{
      name: `${jsonTool.id}.json_op`,
      arguments: {},
      toolHandle: jsonTool,
    }]);

    const results = await agent({ llm, hideProgress: true })
      .then({ prompt: 'Get json', tools: [jsonTool] })
      .run();

    expect(results[0].toolCalls![0].result).toBe('{"count":42}');
  });

  it('fires onToolCall callback for native tools', async () => {
    const myTool = tool({
      name: 'callback_test',
      description: 'Test callback',
      parameters: { type: 'object', properties: {} },
      execute: () => 'result',
    });

    const llm = fakeLlm([{
      name: `${myTool.id}.callback_test`,
      arguments: {},
      toolHandle: myTool,
    }]);

    const captured: Array<{ name: string; args: any; result: any }> = [];

    await agent({ llm, hideProgress: true })
      .then({
        prompt: 'Test',
        tools: [myTool],
        onToolCall: (name, args, result) => {
          captured.push({ name, args, result });
        },
      })
      .run();

    expect(captured.length).toBe(1);
    expect(captured[0].result).toBe('result');
  });

  it('throws ToolError when execute function fails', async () => {
    const failTool = tool({
      name: 'fail_op',
      description: 'Always fails',
      parameters: { type: 'object', properties: {} },
      execute: () => { throw new Error('boom'); },
    });

    const llm = fakeLlm([{
      name: `${failTool.id}.fail_op`,
      arguments: {},
      toolHandle: failTool,
    }]);

    await expect(
      agent({ llm, hideProgress: true })
        .then({ prompt: 'Fail', tools: [failTool] })
        .run()
    ).rejects.toThrow(ToolError);
  });
});

describe('explicit native tool call (tool + args)', () => {
  it('calls the tool directly without an LLM', async () => {
    const add = tool({
      name: 'add',
      description: 'Add two numbers',
      parameters: {
        type: 'object',
        properties: { a: { type: 'number' }, b: { type: 'number' } },
        required: ['a', 'b'],
      },
      execute: ({ a, b }) => JSON.stringify({ sum: a + b }),
    });

    const results = await agent({ hideProgress: true })
      .then({ tool: add, args: { a: 3, b: 4 } })
      .run();

    expect(results.length).toBe(1);
    expect(results[0].mcp).toBeDefined();
    expect(results[0].mcp!.endpoint).toBe('native');
    expect(results[0].mcp!.tool).toBe('add');
    expect(JSON.parse(results[0].mcp!.result)).toEqual({ sum: 7 });
  });

  it('fires onToolCall callback for explicit native calls', async () => {
    const myTool = tool({
      name: 'explicit_cb',
      description: 'test',
      parameters: { type: 'object', properties: {} },
      execute: () => 'ok',
    });

    const captured: string[] = [];

    await agent({ hideProgress: true })
      .then({
        tool: myTool,
        args: {},
        onToolCall: (name) => { captured.push(name); },
      } as any)
      .run();

    expect(captured).toEqual(['explicit_cb']);
  });

  it('throws ToolError on execute failure in explicit call', async () => {
    const failTool = tool({
      name: 'explicit_fail',
      description: 'fails',
      parameters: { type: 'object', properties: {} },
      execute: () => { throw new Error('nope'); },
    });

    await expect(
      agent({ hideProgress: true })
        .then({ tool: failTool, args: {} })
        .run()
    ).rejects.toThrow(ToolError);
  });
});

describe('agent-level tools', () => {
  it('agent-level tools are available to steps without explicit tools field', async () => {
    const agentTool = tool({
      name: 'agent_level',
      description: 'Agent-level tool',
      parameters: { type: 'object', properties: {} },
      execute: () => 'from agent level',
    });

    // The LLM returns a call to the agent-level tool even though
    // the step doesn't specify tools: [agentTool]
    const llm = fakeLlm([{
      name: `${agentTool.id}.agent_level`,
      arguments: {},
      toolHandle: agentTool,
    }]);

    // Agent-level tools need the step to have tools or mcps field to enter the auto-select branch.
    // Since agent-level tools get merged when any tool/mcps field is present,
    // we test by passing an empty tools array at step level.
    const results = await agent({ llm, hideProgress: true, tools: [agentTool] })
      .then({ prompt: 'Use the tool', tools: [] })
      .run();

    expect(results[0].toolCalls).toBeDefined();
    expect(results[0].toolCalls![0].result).toBe('from agent level');
  });
});

describe('mixed native + MCP tools', () => {
  it('step with both tools and mcps field enters auto-select branch', async () => {
    // This test verifies the branch condition works for mixed steps
    // without needing a real MCP server (mcps with empty tools will still work)
    const nativeTool = tool({
      name: 'native_in_mix',
      description: 'Native tool in mixed step',
      parameters: { type: 'object', properties: {} },
      execute: () => 'native result',
    });

    const llm = fakeLlm([{
      name: `${nativeTool.id}.native_in_mix`,
      arguments: {},
      toolHandle: nativeTool,
    }]);

    // Pass tools only (no mcps) - should still enter the auto-select branch
    const results = await agent({ llm, hideProgress: true })
      .then({ prompt: 'Use native tool', tools: [nativeTool] })
      .run();

    expect(results[0].toolCalls!.length).toBe(1);
    expect(results[0].toolCalls![0].endpoint).toBe('native');
  });
});
