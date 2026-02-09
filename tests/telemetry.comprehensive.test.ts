import { describe, it, expect } from 'vitest';
import { agent } from '../dist/volcano-agent-sdk.js';

/**
 * Comprehensive Telemetry Test Suite
 * 
 * Validates that all telemetry metrics are properly recorded across:
 * - Simple LLM steps
 * - MCP automatic tool selection  
 * - Agent crews
 * - Sub-agents (.runAgent)
 * - Anonymous vs named agents
 * - Multi-step workflows
 * - All metric types: agent.*, llm.*, workflow.*, mcp.*
 */

describe('Telemetry - Comprehensive Coverage', () => {
  
  function createMockTelemetry() {
    const recordedMetrics: Array<{name: string; value: number; attrs: any}> = [];
    const recordedSpans: Array<{name: string; attrs: any}> = [];
    
    return {
      telemetry: {
        startAgentSpan: (stepCount: number, agentName?: string) => {
          recordedSpans.push({ 
            name: 'agent.run', 
            attrs: { 
              stepCount, 
              agentName: agentName || 'anonymous' 
            } 
          });
          return { spanId: 'mock-agent-span' } as any;
        },
        startStepSpan: (parent: any, stepIndex: number, stepType: string) => {
          recordedSpans.push({ 
            name: 'step.execute', 
            attrs: { stepIndex, stepType } 
          });
          return { spanId: 'mock-step-span' } as any;
        },
        startLLMSpan: (parent: any, llm: any, prompt: string) => {
          recordedSpans.push({ 
            name: 'llm.generate', 
            attrs: { 
              provider: llm.id, 
              model: llm.model 
            } 
          });
          return { spanId: 'mock-llm-span' } as any;
        },
        startMCPSpan: () => ({ spanId: 'mock-mcp-span' } as any),
        endSpan: () => {},
        recordMetric: (name: string, value: number, attrs: any) => {
          recordedMetrics.push({ name, value, attrs });
        },
        flush: async () => {}
      },
      recordedMetrics,
      recordedSpans
    };
  }

  function createMockLLM(id: string, model: string, tokenUsage = { input: 100, output: 50 }) {
    let lastUsage = {
      inputTokens: tokenUsage.input,
      outputTokens: tokenUsage.output,
      totalTokens: tokenUsage.input + tokenUsage.output
    };
    
    return {
      id,
      model,
      client: {},
      gen: async (prompt: string) => 'Mock response',
      genWithTools: async (prompt: string, tools: any[]) => ({
        content: 'Mock tool response',
        toolCalls: []
      }),
      genStream: async function*() {
        yield 'Mock';
        yield ' stream';
      },
      getUsage: () => lastUsage
    };
  }

  describe('Basic Agent Metrics', () => {
    it('records agent.execution for named agent', async () => {
      const mock = createMockTelemetry();
      const llm = createMockLLM('test-provider', 'test-model') as any;
      
      await agent({ 
        llm, 
        telemetry: mock.telemetry, 
        hideProgress: true,
        name: 'test-agent'
      })
        .then({ prompt: 'Test' })
        .run();
      
      const execMetric = mock.recordedMetrics.find(m => m.name === 'agent.execution');
      expect(execMetric).toBeDefined();
      expect(execMetric!.value).toBe(1);
      expect(execMetric!.attrs.agent_name).toBe('test-agent');
      expect(execMetric!.attrs.parent_agent).toBe('none');
      expect(execMetric!.attrs.is_subagent).toBe('false');
    });

    it('records agent.execution for anonymous agent', async () => {
      const mock = createMockTelemetry();
      const llm = createMockLLM('test-provider', 'test-model') as any;
      
      await agent({ 
        llm, 
        telemetry: mock.telemetry, 
        hideProgress: true
        // No name specified
      })
        .then({ prompt: 'Test' })
        .run();
      
      const execMetric = mock.recordedMetrics.find(m => m.name === 'agent.execution');
      expect(execMetric).toBeDefined();
      expect(execMetric!.value).toBe(1);
      expect(execMetric!.attrs.agent_name).toBe('anonymous');
    });

    it('records agent.duration with step count', async () => {
      const mock = createMockTelemetry();
      const llm = createMockLLM('test-provider', 'test-model') as any;
      
      await agent({ llm, telemetry: mock.telemetry, hideProgress: true })
        .then({ prompt: 'Step 1' })
        .then({ prompt: 'Step 2' })
        .then({ prompt: 'Step 3' })
        .run();
      
      const durationMetric = mock.recordedMetrics.find(m => m.name === 'agent.duration');
      expect(durationMetric).toBeDefined();
      expect(durationMetric!.value).toBeGreaterThanOrEqual(0); // Can be 0 in fast unit tests
      expect(durationMetric!.attrs.steps).toBe(3);
    });

    it('records workflow.steps with agent name', async () => {
      const mock = createMockTelemetry();
      const llm = createMockLLM('test-provider', 'test-model') as any;
      
      await agent({ 
        llm, 
        telemetry: mock.telemetry, 
        hideProgress: true,
        name: 'workflow-test'
      })
        .then({ prompt: 'Step 1' })
        .then({ prompt: 'Step 2' })
        .run();
      
      const stepsMetric = mock.recordedMetrics.find(m => m.name === 'workflow.steps');
      expect(stepsMetric).toBeDefined();
      expect(stepsMetric!.value).toBe(2);
      expect(stepsMetric!.attrs.agent_name).toBe('workflow-test');
    });
  });

  describe('Token Tracking', () => {
    it('records llm.tokens.* for simple LLM steps', async () => {
      const mock = createMockTelemetry();
      const llm = createMockLLM('OpenAI-test', 'gpt-4o-mini', { input: 150, output: 75 }) as any;
      
      await agent({ llm, telemetry: mock.telemetry, hideProgress: true })
        .then({ prompt: 'Test prompt' })
        .run();
      
      const inputMetric = mock.recordedMetrics.find(m => m.name === 'llm.tokens.input');
      const outputMetric = mock.recordedMetrics.find(m => m.name === 'llm.tokens.output');
      const totalMetric = mock.recordedMetrics.find(m => m.name === 'llm.tokens.total');
      
      expect(inputMetric).toBeDefined();
      expect(inputMetric!.value).toBe(150);
      expect(inputMetric!.attrs.provider).toBe('OpenAI-test');
      expect(inputMetric!.attrs.model).toBe('gpt-4o-mini');
      
      expect(outputMetric).toBeDefined();
      expect(outputMetric!.value).toBe(75);
      
      expect(totalMetric).toBeDefined();
      expect(totalMetric!.value).toBe(225);
    });

    it('records agent.tokens for named agents', async () => {
      const mock = createMockTelemetry();
      const llm = createMockLLM('test-provider', 'test-model', { input: 100, output: 50 }) as any;
      
      await agent({ 
        llm, 
        telemetry: mock.telemetry, 
        hideProgress: true,
        name: 'token-test-agent'
      })
        .then({ prompt: 'Test' })
        .run();
      
      const agentTokens = mock.recordedMetrics.find(m => 
        m.name === 'agent.tokens' && m.attrs.agent_name === 'token-test-agent'
      );
      
      expect(agentTokens).toBeDefined();
      expect(agentTokens!.value).toBe(150); // input + output
    });

    it('records agent.tokens for anonymous agents', async () => {
      const mock = createMockTelemetry();
      const llm = createMockLLM('test-provider', 'test-model', { input: 100, output: 50 }) as any;
      
      await agent({ llm, telemetry: mock.telemetry, hideProgress: true })
        .then({ prompt: 'Test' })
        .run();
      
      const agentTokens = mock.recordedMetrics.find(m => 
        m.name === 'agent.tokens'
      );
      
      expect(agentTokens).toBeDefined();
      expect(agentTokens!.value).toBe(150);
      expect(agentTokens!.attrs.agent_name).toBe('anonymous');
    });

    it('accumulates tokens across multiple steps', async () => {
      const mock = createMockTelemetry();
      const llm = createMockLLM('test-provider', 'test-model', { input: 100, output: 50 }) as any;
      
      await agent({ 
        llm, 
        telemetry: mock.telemetry, 
        hideProgress: true,
        name: 'multi-step'
      })
        .then({ prompt: 'Step 1' })
        .then({ prompt: 'Step 2' })
        .then({ prompt: 'Step 3' })
        .run();
      
      const agentTokensMetrics = mock.recordedMetrics.filter(m => 
        m.name === 'agent.tokens' && m.attrs.agent_name === 'multi-step'
      );
      
      // Should have 3 recordings (one per step)
      expect(agentTokensMetrics.length).toBe(3);
      expect(agentTokensMetrics[0].value).toBe(150); // First step
      expect(agentTokensMetrics[1].value).toBe(150); // Second step
      expect(agentTokensMetrics[2].value).toBe(150); // Third step
    });

    // Note: MCP-specific telemetry tests (with actual MCP server connections)
    // are in telemetry.all-providers.e2e.test.ts and telemetry.tokens.e2e.test.ts
  });

  describe('LLM Metrics', () => {
    it('records llm.call and llm.duration', async () => {
      const mock = createMockTelemetry();
      const llm = createMockLLM('OpenAI-test', 'gpt-4o-mini') as any;
      
      await agent({ llm, telemetry: mock.telemetry, hideProgress: true })
        .then({ prompt: 'Test' })
        .run();
      
      const callMetric = mock.recordedMetrics.find(m => m.name === 'llm.call');
      expect(callMetric).toBeDefined();
      expect(callMetric!.value).toBe(1);
      expect(callMetric!.attrs.provider).toBe('OpenAI-test');
      expect(callMetric!.attrs.error).toBe(false);
      
      const durationMetric = mock.recordedMetrics.find(m => m.name === 'llm.duration');
      expect(durationMetric).toBeDefined();
      expect(durationMetric!.value).toBeGreaterThanOrEqual(0); // Can be 0 in fast unit tests
      expect(durationMetric!.attrs.provider).toBe('OpenAI-test');
      expect(durationMetric!.attrs.model).toBe('gpt-4o-mini');
    });

    it('records separate LLM metrics for each step', async () => {
      const mock = createMockTelemetry();
      const llm = createMockLLM('test-provider', 'test-model') as any;
      
      await agent({ llm, telemetry: mock.telemetry, hideProgress: true })
        .then({ prompt: 'Step 1' })
        .then({ prompt: 'Step 2' })
        .run();
      
      const callMetrics = mock.recordedMetrics.filter(m => m.name === 'llm.call');
      expect(callMetrics.length).toBeGreaterThanOrEqual(2);
      
      const durationMetrics = mock.recordedMetrics.filter(m => m.name === 'llm.duration');
      expect(durationMetrics.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Step Metrics', () => {
    it('records step.duration for each step', async () => {
      const mock = createMockTelemetry();
      const llm = createMockLLM('test-provider', 'test-model') as any;
      
      await agent({ llm, telemetry: mock.telemetry, hideProgress: true })
        .then({ prompt: 'Step 1' })
        .then({ prompt: 'Step 2' })
        .run();
      
      const stepDurations = mock.recordedMetrics.filter(m => m.name === 'step.duration');
      expect(stepDurations.length).toBe(2);
      
      stepDurations.forEach(metric => {
        expect(metric.value).toBeGreaterThanOrEqual(0); // Can be 0 in fast unit tests
        expect(metric.attrs.type).toBeDefined();
      });
    });

    it('correctly identifies step type', async () => {
      const mock = createMockTelemetry();
      const llm = createMockLLM('test-provider', 'test-model') as any;
      
      await agent({ llm, telemetry: mock.telemetry, hideProgress: true })
        .then({ prompt: 'Simple step' })
        .run();
      
      const stepDuration = mock.recordedMetrics.find(m => m.name === 'step.duration');
      expect(stepDuration).toBeDefined();
      expect(stepDuration!.attrs.type).toBe('llm');
    });
  });

  // Note: MCP-specific telemetry with real servers is tested in:
  // - telemetry.all-providers.e2e.test.ts
  // - telemetry.tokens.e2e.test.ts  
  // - volcano.flow.test.ts
  // Those tests validate:
  // - Token tracking for MCP workflows
  // - mcp.call metrics
  // - step.duration with type='mcp_auto'
  // - MCP tool duration metrics

  describe('Sub-Agent Metrics', () => {
    it('records parent-child relationship for sub-agents', async () => {
      const mock = createMockTelemetry();
      const llm = createMockLLM('test-provider', 'test-model') as any;
      
      const subAgent = agent({ 
        llm, 
        telemetry: mock.telemetry, 
        hideProgress: true,
        name: 'sub-agent'
      })
        .then({ prompt: 'Sub task' });
      
      await agent({ 
        llm, 
        telemetry: mock.telemetry, 
        hideProgress: true,
        name: 'parent-agent'
      })
        .then({ prompt: 'Parent task' })
        .runAgent(subAgent)
        .run();
      
      // Check parent agent execution
      const parentExec = mock.recordedMetrics.find(m => 
        m.name === 'agent.execution' && 
        m.attrs.agent_name === 'parent-agent' &&
        m.attrs.is_subagent === 'false'
      );
      expect(parentExec).toBeDefined();
      
      // Check sub-agent execution
      const subExec = mock.recordedMetrics.find(m => 
        m.name === 'agent.execution' && 
        m.attrs.agent_name === 'sub-agent'
      );
      expect(subExec).toBeDefined();
      expect(subExec!.attrs.is_subagent).toBe('true');
    });

    it('tracks tokens for both parent and sub-agent', async () => {
      const mock = createMockTelemetry();
      const llm = createMockLLM('test-provider', 'test-model', { input: 100, output: 50 }) as any;
      
      const subAgent = agent({ 
        llm, 
        telemetry: mock.telemetry, 
        hideProgress: true,
        name: 'sub'
      })
        .then({ prompt: 'Sub task' });
      
      await agent({ 
        llm, 
        telemetry: mock.telemetry, 
        hideProgress: true,
        name: 'parent'
      })
        .then({ prompt: 'Parent task' })
        .runAgent(subAgent)
        .run();
      
      const parentTokens = mock.recordedMetrics.filter(m => 
        m.name === 'agent.tokens' && m.attrs.agent_name === 'parent'
      );
      const subTokens = mock.recordedMetrics.filter(m => 
        m.name === 'agent.tokens' && m.attrs.agent_name === 'sub'
      );
      
      expect(parentTokens.length).toBeGreaterThan(0);
      expect(subTokens.length).toBeGreaterThan(0);
    });

    it('records subagent_call metric when delegating', async () => {
      const mock = createMockTelemetry();
      const coordinatorLlm: any = {
        id: 'coordinator-llm',
        model: 'test',
        client: {},
        gen: async (prompt: string) => {
          // Simulate coordinator deciding to use an agent
          return 'USE agent1: Do the task';
        },
        genWithTools: async () => ({ content: '', toolCalls: [] }),
        genStream: async function*() {},
        getUsage: () => ({ inputTokens: 50, outputTokens: 25, totalTokens: 75 })
      };
      
      const agent1Llm = createMockLLM('agent1-llm', 'test-model') as any;
      
      const agent1 = agent({
        llm: agent1Llm,
        telemetry: mock.telemetry,
        hideProgress: true,
        name: 'agent1',
        description: 'Does tasks'
      })
        .then({ prompt: 'Execute task' });
      
      await agent({
        llm: coordinatorLlm,
        telemetry: mock.telemetry,
        hideProgress: true,
        name: 'coordinator'
      })
        .then({
          prompt: 'Delegate this task',
          agents: [agent1],
        })
        .run();
      
      const subagentCall = mock.recordedMetrics.find(m => m.name === 'agent.subagent_call');
      expect(subagentCall).toBeDefined();
      expect(subagentCall!.value).toBe(1);
      expect(subagentCall!.attrs.parent_agent_name).toBe('coordinator');
      expect(subagentCall!.attrs.agent_name).toBe('agent1');
    });
  });

  describe('Span Creation', () => {
    it('creates agent span with step count', async () => {
      const mock = createMockTelemetry();
      const llm = createMockLLM('test-provider', 'test-model') as any;
      
      await agent({ 
        llm, 
        telemetry: mock.telemetry, 
        hideProgress: true,
        name: 'span-test'
      })
        .then({ prompt: 'Step 1' })
        .then({ prompt: 'Step 2' })
        .run();
      
      const agentSpan = mock.recordedSpans.find(s => s.name === 'agent.run');
      expect(agentSpan).toBeDefined();
      expect(agentSpan!.attrs.stepCount).toBe(2);
      expect(agentSpan!.attrs.agentName).toBe('span-test');
    });

    it('creates step spans for each step', async () => {
      const mock = createMockTelemetry();
      const llm = createMockLLM('test-provider', 'test-model') as any;
      
      await agent({ llm, telemetry: mock.telemetry, hideProgress: true })
        .then({ prompt: 'Step 1' })
        .then({ prompt: 'Step 2' })
        .then({ prompt: 'Step 3' })
        .run();
      
      const stepSpans = mock.recordedSpans.filter(s => s.name === 'step.execute');
      expect(stepSpans.length).toBe(3);
      
      stepSpans.forEach((span, idx) => {
        expect(span.attrs.stepIndex).toBe(idx);
      });
    });

    it('creates LLM spans with provider info', async () => {
      const mock = createMockTelemetry();
      const llm = createMockLLM('OpenAI-gpt4', 'gpt-4o-mini') as any;
      
      await agent({ llm, telemetry: mock.telemetry, hideProgress: true })
        .then({ prompt: 'Test' })
        .run();
      
      const llmSpan = mock.recordedSpans.find(s => s.name === 'llm.generate');
      expect(llmSpan).toBeDefined();
      expect(llmSpan!.attrs.provider).toBe('OpenAI-gpt4');
      expect(llmSpan!.attrs.model).toBe('gpt-4o-mini');
    });
  });

  describe('Multi-Provider Scenarios', () => {
    it('tracks tokens separately per provider', async () => {
      const mock = createMockTelemetry();
      const openaiLlm = createMockLLM('OpenAI-gpt4', 'gpt-4o-mini', { input: 100, output: 50 }) as any;
      const claudeLlm = createMockLLM('Anthropic-claude', 'claude-3-haiku', { input: 150, output: 75 }) as any;
      
      await agent({ telemetry: mock.telemetry, hideProgress: true })
        .then({ llm: openaiLlm, prompt: 'Use OpenAI' })
        .then({ llm: claudeLlm, prompt: 'Use Claude' })
        .run();
      
      const openaiTokens = mock.recordedMetrics.find(m => 
        m.name === 'llm.tokens.total' && m.attrs.provider === 'OpenAI-gpt4'
      );
      const claudeTokens = mock.recordedMetrics.find(m => 
        m.name === 'llm.tokens.total' && m.attrs.provider === 'Anthropic-claude'
      );
      
      expect(openaiTokens).toBeDefined();
      expect(openaiTokens!.value).toBe(150);
      expect(openaiTokens!.attrs.model).toBe('gpt-4o-mini');
      
      expect(claudeTokens).toBeDefined();
      expect(claudeTokens!.value).toBe(225);
      expect(claudeTokens!.attrs.model).toBe('claude-3-haiku');
    });
  });

  describe('Error Scenarios', () => {
    it('handles missing getUsage gracefully', async () => {
      const mock = createMockTelemetry();
      const llmWithoutUsage: any = {
        id: 'no-usage-llm',
        model: 'test',
        client: {},
        gen: async () => 'Response',
        genWithTools: async () => ({ content: '', toolCalls: [] }),
        genStream: async function*() {}
        // No getUsage method
      };
      
      await agent({ llm: llmWithoutUsage, telemetry: mock.telemetry, hideProgress: true })
        .then({ prompt: 'Test' })
        .run();
      
      // Should still record basic metrics
      const callMetric = mock.recordedMetrics.find(m => m.name === 'llm.call');
      expect(callMetric).toBeDefined();
      
      // But no token metrics
      const tokenMetrics = mock.recordedMetrics.filter(m => m.name.startsWith('llm.tokens.'));
      expect(tokenMetrics.length).toBe(0);
    });

    it('handles null usage gracefully', async () => {
      const mock = createMockTelemetry();
      const llmWithNullUsage: any = {
        id: 'null-usage-llm',
        model: 'test',
        client: {},
        gen: async () => 'Response',
        genWithTools: async () => ({ content: '', toolCalls: [] }),
        genStream: async function*() {},
        getUsage: () => null
      };
      
      await agent({ llm: llmWithNullUsage, telemetry: mock.telemetry, hideProgress: true })
        .then({ prompt: 'Test' })
        .run();
      
      const callMetric = mock.recordedMetrics.find(m => m.name === 'llm.call');
      expect(callMetric).toBeDefined();
      
      const tokenMetrics = mock.recordedMetrics.filter(m => m.name.startsWith('llm.tokens.'));
      expect(tokenMetrics.length).toBe(0);
    });
  });

  describe('Complete Workflow Validation', () => {
    it('records all expected metric types for a multi-step workflow', async () => {
      const mock = createMockTelemetry();
      const llm = createMockLLM('OpenAI-test', 'gpt-4o', { input: 200, output: 100 }) as any;
      
      await agent({ 
        llm, 
        telemetry: mock.telemetry, 
        hideProgress: true,
        name: 'complete-test'
      })
        .then({ prompt: 'Step 1' })
        .then({ prompt: 'Step 2' })
        .run();
      
      const metricNames = new Set(mock.recordedMetrics.map(m => m.name));
      
      // Verify all expected metrics are present
      expect(metricNames.has('agent.execution')).toBe(true);
      expect(metricNames.has('agent.duration')).toBe(true);
      expect(metricNames.has('agent.tokens')).toBe(true);
      expect(metricNames.has('workflow.steps')).toBe(true);
      expect(metricNames.has('llm.call')).toBe(true);
      expect(metricNames.has('llm.duration')).toBe(true);
      expect(metricNames.has('llm.tokens.input')).toBe(true);
      expect(metricNames.has('llm.tokens.output')).toBe(true);
      expect(metricNames.has('llm.tokens.total')).toBe(true);
      expect(metricNames.has('step.duration')).toBe(true);
    });

    it('all metrics have required attributes', async () => {
      const mock = createMockTelemetry();
      const llm = createMockLLM('test-provider', 'test-model') as any;
      
      await agent({ 
        llm, 
        telemetry: mock.telemetry, 
        hideProgress: true,
        name: 'attr-test'
      })
        .then({ prompt: 'Test' })
        .run();
      
      // Validate agent.execution attributes
      const execMetric = mock.recordedMetrics.find(m => m.name === 'agent.execution');
      expect(execMetric!.attrs.agent_name).toBeDefined();
      expect(execMetric!.attrs.parent_agent).toBeDefined();
      expect(execMetric!.attrs.is_subagent).toBeDefined();
      
      // Validate llm.tokens.* attributes
      const tokenMetric = mock.recordedMetrics.find(m => m.name === 'llm.tokens.total');
      expect(tokenMetric!.attrs.provider).toBeDefined();
      expect(tokenMetric!.attrs.model).toBeDefined();
      expect(tokenMetric!.attrs.agent_name).toBeDefined();
      
      // Validate step.duration attributes
      const stepDuration = mock.recordedMetrics.find(m => m.name === 'step.duration');
      expect(stepDuration!.attrs.type).toBeDefined();
    });
  });

  describe('Telemetry Flush', () => {
    it('flush() method exists and is callable', async () => {
      const mock = createMockTelemetry();
      const llm = createMockLLM('test-provider', 'test-model') as any;
      
      await agent({ llm, telemetry: mock.telemetry, hideProgress: true })
        .then({ prompt: 'Test' })
        .run();
      
      // Flush should not throw
      await expect(mock.telemetry.flush()).resolves.not.toThrow();
    });
  });
});

