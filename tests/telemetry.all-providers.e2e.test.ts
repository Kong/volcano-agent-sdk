import { describe, it, expect } from 'vitest';
import { agent, llmOpenAI, llmAnthropic, llmMistral, llmLlama, llmBedrock, llmVertexStudio, llmAzure, createVolcanoTelemetry } from '../src/volcano-agent-sdk.js';

describe('Telemetry E2E - All Providers with Live Observability', () => {
  function createMockTelemetry() {
    const recordedMetrics: Array<{name: string; value: number; attrs: any}> = [];
    const recordedSpans: Array<{name: string; attrs: any}> = [];
    
    return {
      telemetry: {
        startAgentSpan: (stepCount: number) => {
          recordedSpans.push({ name: 'agent.run', attrs: { stepCount } });
          return { spanId: 'mock-agent-span' } as any;
        },
        startStepSpan: (parent: any, stepIndex: number, stepType: string) => {
          recordedSpans.push({ name: 'step.execute', attrs: { stepIndex, stepType } });
          return { spanId: 'mock-step-span' } as any;
        },
        startLLMSpan: (parent: any, llm: any, prompt: string) => {
          recordedSpans.push({ name: 'llm.generate', attrs: { provider: llm.id, model: llm.model } });
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

  it('OpenAI: Full observability with tokens, spans, and agent metrics', async () => {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required');
    
    const mock = createMockTelemetry();
    const llm = llmOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o-mini'
    });
    
    await agent({ 
      llm, 
      telemetry: mock.telemetry, 
      hideProgress: true,
      name: 'test-openai-agent'
    })
      .then({ prompt: 'Say "hello" in one word' })
      .then({ prompt: 'Say "world" in one word' })
      .run();
    
    // Verify spans were created
    const agentSpan = mock.recordedSpans.find(s => s.name === 'agent.run');
    const llmSpans = mock.recordedSpans.filter(s => s.name === 'llm.generate');
    expect(agentSpan).toBeDefined();
    expect(llmSpans.length).toBe(2);
    
    // Verify token metrics
    const inputTokens = mock.recordedMetrics.filter(m => m.name === 'llm.tokens.input');
    const outputTokens = mock.recordedMetrics.filter(m => m.name === 'llm.tokens.output');
    const totalTokens = mock.recordedMetrics.filter(m => m.name === 'llm.tokens.total');
    
    expect(inputTokens.length).toBe(2); // One per step
    expect(outputTokens.length).toBe(2);
    expect(totalTokens.length).toBe(2);
    
    expect(inputTokens[0].value).toBeGreaterThan(0);
    expect(inputTokens[0].attrs.provider).toContain('OpenAI');
    expect(inputTokens[0].attrs.model).toBe('gpt-4o-mini');
    expect(inputTokens[0].attrs.agent_name).toBe('test-openai-agent');
    
    // Verify agent metrics
    const agentExec = mock.recordedMetrics.find(m => m.name === 'agent.execution');
    const agentTokens = mock.recordedMetrics.filter(m => m.name === 'agent.tokens');
    
    expect(agentExec).toBeDefined();
    expect(agentExec!.attrs.agent_name).toBe('test-openai-agent');
    expect(agentTokens.length).toBe(2); // One per step
  }, 30000);

  it('Anthropic: Full observability with tokens and metrics', async () => {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY required');
    
    const mock = createMockTelemetry();
    const llm = llmAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: 'claude-3-haiku-20240307'
    });
    
    await agent({ llm, telemetry: mock.telemetry, hideProgress: true, name: 'claude-agent' })
      .then({ prompt: 'Reply "OK"' })
      .run();
    
    const tokens = mock.recordedMetrics.filter(m => m.name.includes('tokens'));
    expect(tokens.length).toBeGreaterThanOrEqual(3); // input, output, total
    expect(tokens[0].attrs.provider).toContain('Anthropic');
  }, 15000);

  it('Mistral: Full observability with tokens and metrics', async () => {
    if (!process.env.MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY required');
    
    const mock = createMockTelemetry();
    const llm = llmMistral({
      apiKey: process.env.MISTRAL_API_KEY!,
      model: 'mistral-small-latest'
    });
    
    await agent({ llm, telemetry: mock.telemetry, hideProgress: true })
      .then({ prompt: 'Reply "OK"' })
      .run();
    
    const tokens = mock.recordedMetrics.filter(m => m.name.includes('tokens'));
    expect(tokens.length).toBeGreaterThanOrEqual(3);
    expect(tokens[0].attrs.provider).toContain('Mistral');
  }, 15000);

  it('Bedrock: Full observability with tokens and metrics', async () => {
    if (!process.env.AWS_BEARER_TOKEN_BEDROCK) throw new Error('AWS_BEARER_TOKEN_BEDROCK required');
    
    const mock = createMockTelemetry();
    const llm = llmBedrock({
      model: process.env.BEDROCK_MODEL || 'amazon.nova-micro-v1:0',
      region: process.env.AWS_REGION || 'us-east-1',
      token: process.env.AWS_BEARER_TOKEN_BEDROCK!
    });
    
    await agent({ llm, telemetry: mock.telemetry, hideProgress: true })
      .then({ prompt: 'Reply "OK"' })
      .run();
    
    const tokens = mock.recordedMetrics.filter(m => m.name.includes('tokens'));
    expect(tokens.length).toBeGreaterThanOrEqual(3);
    expect(tokens[0].attrs.provider).toContain('Bedrock');
  }, 15000);

  it('Vertex Studio: Full observability with tokens and metrics', async () => {
    if (!process.env.GCP_VERTEX_API_KEY) throw new Error('GCP_VERTEX_API_KEY required');
    
    const mock = createMockTelemetry();
    const llm = llmVertexStudio({
      model: process.env.VERTEX_MODEL || 'gemini-2.5-flash-lite',
      apiKey: process.env.GCP_VERTEX_API_KEY!
    });
    
    await agent({ llm, telemetry: mock.telemetry, hideProgress: true })
      .then({ prompt: 'Reply "OK"' })
      .run();
    
    const tokens = mock.recordedMetrics.filter(m => m.name.includes('tokens'));
    expect(tokens.length).toBeGreaterThanOrEqual(3);
    expect(tokens[0].attrs.provider).toContain('VertexStudio');
  }, 15000);

  it('Azure: Full observability with tokens and metrics', async () => {
    if (!process.env.AZURE_AI_API_KEY) throw new Error('AZURE_AI_API_KEY required');
    
    const mock = createMockTelemetry();
    const llm = llmAzure({
      model: 'gpt-5-mini',
      endpoint: 'https://volcano-sdk.openai.azure.com/openai/responses',
      apiKey: process.env.AZURE_AI_API_KEY!
    });
    
    await agent({ llm, telemetry: mock.telemetry, hideProgress: true })
      .then({ prompt: 'Reply "OK"' })
      .run();
    
    // Azure may or may not return usage
    const tokens = mock.recordedMetrics.filter(m => m.name.includes('tokens'));
    if (tokens.length > 0) {
      expect(tokens[0].attrs.provider).toContain('Azure');
    }
  }, 15000);

  it('Multi-provider workflow: Tracks tokens per provider correctly', async () => {
    if (!process.env.OPENAI_API_KEY || !process.env.ANTHROPIC_API_KEY) {
      throw new Error('OPENAI_API_KEY and ANTHROPIC_API_KEY required');
    }
    
    const mock = createMockTelemetry();
    
    const openai = llmOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o-mini'
    });
    
    const claude = llmAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: 'claude-3-haiku-20240307'
    });
    
    await agent({ telemetry: mock.telemetry, hideProgress: true })
      .then({ llm: openai, prompt: 'Say "A"' })
      .then({ llm: claude, prompt: 'Say "B"' })
      .run();
    
    // Verify both providers recorded tokens
    const openaiTokens = mock.recordedMetrics.filter(m => 
      m.name.includes('tokens') && m.attrs.provider?.includes('OpenAI')
    );
    const claudeTokens = mock.recordedMetrics.filter(m => 
      m.name.includes('tokens') && m.attrs.provider?.includes('Anthropic')
    );
    
    expect(openaiTokens.length).toBeGreaterThanOrEqual(3);
    expect(claudeTokens.length).toBeGreaterThanOrEqual(3);
  }, 30000);

  it('Agent crews: Tracks tokens per agent with parent relationships', async () => {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required');
    
    const mock = createMockTelemetry();
    const llm = llmOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o-mini'
    });
    
    const researcher = agent({
      llm,
      telemetry: mock.telemetry,
      hideProgress: true,
      name: 'researcher',
      description: 'Researches'
    })
      .then({ prompt: 'Research the topic' });
    
    const writer = agent({
      llm,
      telemetry: mock.telemetry,
      hideProgress: true,
      name: 'writer',
      description: 'Writes'
    })
      .then({ prompt: 'Write the content' });
    
    const results = await agent({ 
      llm, 
      telemetry: mock.telemetry,
      hideProgress: true,
      name: 'coordinator'
    })
      .then({
        prompt: 'Research AI and then write a brief explanation',
        agents: [researcher, writer],
      })
      .run();
    
    // Debug: Check what happened
    const allMetrics = mock.recordedMetrics.map(m => m.name);
    if (!allMetrics.includes('agent.subagent_call')) {
      console.log('No agent.subagent_call found. All metrics:', allMetrics);
      console.log('Results:', results.map(r => ({ prompt: r.prompt, llmOutput: r.llmOutput?.substring(0, 100) })));
    }
    
    // Verify parent-child relationship was recorded
    const subAgentCalls = mock.recordedMetrics.filter(m => m.name === 'agent.subagent_call');
    expect(subAgentCalls.length).toBeGreaterThan(0);
    
    const firstCall = subAgentCalls[0];
    expect(firstCall.attrs.parent_agent_name).toBe('coordinator');
    expect(['researcher', 'writer']).toContain(firstCall.attrs.agent_name);
    
    // Verify agent token tracking
    const agentTokenMetrics = mock.recordedMetrics.filter(m => m.name === 'agent.tokens');
    expect(agentTokenMetrics.length).toBeGreaterThan(0);
    
    // Coordinator should have tokens
    const coordTokens = agentTokenMetrics.find(m => m.attrs.agent_name === 'coordinator');
    if (coordTokens) {
      expect(coordTokens.value).toBeGreaterThan(0);
    }
  }, 60000);

  it('All metrics have correct labels and structure', async () => {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required');
    
    const mock = createMockTelemetry();
    const llm = llmOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o-mini'
    });
    
    await agent({ llm, telemetry: mock.telemetry, hideProgress: true, name: 'label-test' })
      .then({ prompt: 'Test' })
      .run();
    
    // Verify all LLM token metrics have required labels
    const llmTokenMetrics = mock.recordedMetrics.filter(m => 
      m.name === 'llm.tokens.input' || m.name === 'llm.tokens.output' || m.name === 'llm.tokens.total'
    );
    for (const metric of llmTokenMetrics) {
      expect(metric.attrs).toHaveProperty('provider');
      expect(metric.attrs).toHaveProperty('model');
      expect(metric.attrs).toHaveProperty('agent_name');
      expect(metric.value).toBeGreaterThan(0);
    }
    
    // Verify agent token metrics have agent_name
    const agentTokenMetrics = mock.recordedMetrics.filter(m => m.name === 'agent.tokens');
    for (const metric of agentTokenMetrics) {
      expect(metric.attrs).toHaveProperty('agent_name');
      expect(metric.value).toBeGreaterThan(0);
    }
    
    // Verify agent execution metric has correct structure
    const agentExec = mock.recordedMetrics.find(m => m.name === 'agent.execution');
    expect(agentExec).toBeDefined();
    expect(agentExec!.attrs).toHaveProperty('agent_name');
    expect(agentExec!.attrs).toHaveProperty('parent_agent');
    expect(agentExec!.attrs).toHaveProperty('is_subagent');
    
    // Verify workflow metrics
    const workflowSteps = mock.recordedMetrics.find(m => m.name === 'workflow.steps');
    expect(workflowSteps).toBeDefined();
    expect(workflowSteps!.value).toBe(1);
  }, 15000);
});

