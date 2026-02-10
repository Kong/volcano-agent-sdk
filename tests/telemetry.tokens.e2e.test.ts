import { describe, it, expect } from 'vitest';
import { agent, llmOpenAI, llmAnthropic, llmMistral, llmLlama, llmBedrock, llmVertexStudio, llmAzure, createVolcanoTelemetry } from '../src/volcano-agent-sdk.js';

describe('Telemetry - Token Tracking (E2E)', () => {
  it('OpenAI tracks tokens correctly', async () => {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required');
    
    const llm = llmOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o-mini'
    });
    
    // Call LLM
    await agent({ llm, hideProgress: true })
      .then({ prompt: 'Say "test" in one word' })
      .run();
    
    // Verify usage was captured
    const usage = llm.getUsage?.();
    expect(usage).toBeDefined();
    expect(usage?.inputTokens).toBeGreaterThan(0);
    expect(usage?.outputTokens).toBeGreaterThan(0);
    expect(usage?.totalTokens).toBeGreaterThan(0);
    expect(usage?.totalTokens).toBe((usage?.inputTokens || 0) + (usage?.outputTokens || 0));
  }, 15000);

  it('Anthropic tracks tokens correctly', async () => {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY required');
    
    const llm = llmAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: 'claude-3-haiku-20240307'
    });
    
    await agent({ llm, hideProgress: true })
      .then({ prompt: 'Say "test"' })
      .run();
    
    const usage = llm.getUsage?.();
    expect(usage).toBeDefined();
    expect(usage?.inputTokens).toBeGreaterThan(0);
    expect(usage?.outputTokens).toBeGreaterThan(0);
    expect(usage?.totalTokens).toBeGreaterThan(0);
  }, 15000);

  it('Mistral tracks tokens correctly', async () => {
    if (!process.env.MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY required');
    
    const llm = llmMistral({
      apiKey: process.env.MISTRAL_API_KEY!,
      model: 'mistral-small-latest'
    });
    
    await agent({ llm, hideProgress: true })
      .then({ prompt: 'Say "test"' })
      .run();
    
    const usage = llm.getUsage?.();
    expect(usage).toBeDefined();
    expect(usage?.inputTokens).toBeGreaterThan(0);
    expect(usage?.outputTokens).toBeGreaterThan(0);
  }, 15000);

  // Skip in CI - Llama is too slow (29s+ per call even with optimizations)
  (process.env.CI === 'true' ? it.skip : it)('Llama tracks tokens correctly (if available)', async () => {
    const llm = llmLlama({
      baseURL: process.env.LLAMA_BASE_URL || 'http://127.0.0.1:11434',
      model: process.env.LLAMA_MODEL || 'llama3.1:8b'
    });
    
    await agent({ llm, hideProgress: true })
      .then({ prompt: 'Say "test"' })
      .run();
    
    const usage = llm.getUsage?.();
    // Llama might not return usage depending on server
    if (usage) {
      expect(usage.totalTokens).toBeGreaterThan(0);
    }
  }, 60000);

  it('Bedrock tracks tokens correctly', async () => {
    if (!process.env.AWS_BEARER_TOKEN_BEDROCK) throw new Error('AWS_BEARER_TOKEN_BEDROCK required');
    
    const llm = llmBedrock({
      model: process.env.BEDROCK_MODEL || 'amazon.nova-micro-v1:0',
      region: process.env.AWS_REGION || 'us-east-1',
      token: process.env.AWS_BEARER_TOKEN_BEDROCK!
    });
    
    await agent({ llm, hideProgress: true })
      .then({ prompt: 'Say "test"' })
      .run();
    
    const usage = llm.getUsage?.();
    expect(usage).toBeDefined();
    expect(usage?.inputTokens).toBeGreaterThan(0);
    expect(usage?.outputTokens).toBeGreaterThan(0);
  }, 15000);

  it('Vertex Studio tracks tokens correctly', async () => {
    if (!process.env.GCP_VERTEX_API_KEY) throw new Error('GCP_VERTEX_API_KEY required');
    
    const llm = llmVertexStudio({
      model: process.env.VERTEX_MODEL || 'gemini-2.5-flash-lite',
      apiKey: process.env.GCP_VERTEX_API_KEY!
    });
    
    await agent({ llm, hideProgress: true })
      .then({ prompt: 'Say "test"' })
      .run();
    
    const usage = llm.getUsage?.();
    expect(usage).toBeDefined();
    expect(usage?.inputTokens).toBeGreaterThan(0);
    expect(usage?.outputTokens).toBeGreaterThan(0);
  }, 15000);

  it('Azure tracks tokens correctly', async () => {
    if (!process.env.AZURE_AI_API_KEY) throw new Error('AZURE_AI_API_KEY required');
    
    const llm = llmAzure({
      model: 'gpt-5-mini',
      endpoint: 'https://volcano-sdk.openai.azure.com/openai/responses',
      apiKey: process.env.AZURE_AI_API_KEY!
    });
    
    await agent({ llm, hideProgress: true })
      .then({ prompt: 'Say "test"' })
      .run();
    
    const usage = llm.getUsage?.();
    // Azure might not return usage depending on API version
    if (usage) {
      expect(usage.totalTokens).toBeGreaterThan(0);
    }
  }, 15000);

  it('Telemetry records token metrics', async () => {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required');
    
    const recordedMetrics: Array<{name: string; value: number; attrs: any}> = [];
    const mockTelemetry = {
      startAgentSpan: () => null,
      startStepSpan: () => null,
      startLLMSpan: () => null,
      startMCPSpan: () => null,
      endSpan: () => {},
      recordMetric: (name: string, value: number, attrs: any) => {
        recordedMetrics.push({ name, value, attrs });
      },
      flush: async () => {}
    };
    
    const llm = llmOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o-mini'
    });
    
    await agent({ llm, telemetry: mockTelemetry, hideProgress: true })
      .then({ prompt: 'Say "test"' })
      .run();
    
    // Verify token metrics were recorded
    const inputMetric = recordedMetrics.find(m => m.name === 'llm.tokens.input');
    const outputMetric = recordedMetrics.find(m => m.name === 'llm.tokens.output');
    const totalMetric = recordedMetrics.find(m => m.name === 'llm.tokens.total');
    
    expect(inputMetric).toBeDefined();
    expect(outputMetric).toBeDefined();
    expect(totalMetric).toBeDefined();
    
    expect(inputMetric!.value).toBeGreaterThan(0);
    expect(outputMetric!.value).toBeGreaterThan(0);
    expect(totalMetric!.value).toBe(inputMetric!.value + outputMetric!.value);
    
    expect(inputMetric!.attrs.provider).toContain('OpenAI');
    expect(inputMetric!.attrs.model).toBe('gpt-4o-mini');
  }, 15000);

  it('Telemetry records agent execution metrics', async () => {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required');
    
    const recordedMetrics: Array<{name: string; value: number; attrs: any}> = [];
    const mockTelemetry = {
      startAgentSpan: () => null,
      startStepSpan: () => null,
      startLLMSpan: () => null,
      startMCPSpan: () => null,
      endSpan: () => {},
      recordMetric: (name: string, value: number, attrs: any) => {
        recordedMetrics.push({ name, value, attrs });
      },
      flush: async () => {}
    };
    
    const llm = llmOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o-mini'
    });
    
    await agent({ 
      llm, 
      telemetry: mockTelemetry, 
      hideProgress: true,
      name: 'test-agent'
    })
      .then({ prompt: 'Say "test"' })
      .run();
    
    // Verify agent execution metric
    const execMetric = recordedMetrics.find(m => m.name === 'agent.execution');
    expect(execMetric).toBeDefined();
    expect(execMetric!.attrs.agent_name).toBe('test-agent');
    expect(execMetric!.attrs.parent_agent).toBe('none');
    
    // Verify agent tokens metric
    const agentTokens = recordedMetrics.find(m => m.name === 'agent.tokens');
    expect(agentTokens).toBeDefined();
    expect(agentTokens!.attrs.agent_name).toBe('test-agent');
    expect(agentTokens!.value).toBeGreaterThan(0);
  }, 15000);

  it('Telemetry records parent-child agent relationships', { timeout: 60000 }, async () => {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required');
    
    const recordedMetrics: Array<{name: string; value: number; attrs: any}> = [];
    const mockTelemetry = {
      startAgentSpan: () => null,
      startStepSpan: () => null,
      startLLMSpan: () => null,
      startMCPSpan: () => null,
      endSpan: () => {},
      recordMetric: (name: string, value: number, attrs: any) => {
        recordedMetrics.push({ name, value, attrs });
      },
      flush: async () => {}
    };
    
    const llm = llmOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o-mini'
    });
    
    const researcher = agent({
      llm,
      telemetry: mockTelemetry,
      hideProgress: true,
      name: 'researcher',
      description: 'Researches topics'
    });
    
    const writer = agent({
      llm,
      telemetry: mockTelemetry,
      hideProgress: true,
      name: 'writer',
      description: 'Writes content'
    });
    
    const mockLlm: any = {
      id: 'mock',
      model: 'test',
      client: {},
      gen: async () => 'USE researcher: Research test topic',
      genWithTools: async () => ({ content: '', toolCalls: [] }),
      genStream: async function*(){}
    };
    
    await agent({ 
      llm: mockLlm, 
      telemetry: mockTelemetry,
      hideProgress: true,
      name: 'coordinator'
    })
      .then({
        prompt: 'Test',
        agents: [researcher, writer],
      })
      .run();
    
    // Verify sub-agent call metric was recorded
    const subAgentMetric = recordedMetrics.find(m => m.name === 'agent.subagent_call');
    expect(subAgentMetric).toBeDefined();
    expect(subAgentMetric!.attrs.parent_agent_name).toBe('coordinator');
    expect(subAgentMetric!.attrs.agent_name).toBe('researcher');
  }, 15000);
});

