import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { agent } from '../src/volcano-agent-sdk';
import { createVolcanoTelemetry } from '../src/telemetry';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

describe('Volcano Agent SDK - Step and Agent Naming', () => {
  let spanExporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;

  beforeAll(() => {
    spanExporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(spanExporter));
    provider.register();
  });

  beforeEach(() => {
    // Reset before each test
    spanExporter.reset();
  });

  afterAll(async () => {
    await provider.shutdown();
  });

  const makeMockLLM = () => ({
    id: 'test-llm',
    model: 'test-model',
    gen: async () => 'Test response',
    genWithTools: async () => ({ text: 'Test response' }),
  });

  it('creates descriptive span names with step names', async () => {
    const telemetry = createVolcanoTelemetry({
      serviceName: 'test-step-names',
    });

    await agent({ 
      llm: makeMockLLM(), 
      telemetry,
      name: 'test-agent',
      hideProgress: true 
    })
      .then({ 
        name: 'data-analysis',
        prompt: 'Analyze data' 
      })
      .then({ 
        name: 'report-generation',
        prompt: 'Generate report' 
      })
      .run();

    const spans = spanExporter.getFinishedSpans();
    const spanNames = spans.map(s => s.name);

    // Should have descriptive step names
    expect(spanNames).toContain('Step 1: data-analysis');
    expect(spanNames).toContain('Step 2: report-generation');
    expect(spanNames).toContain('agent.run');
  });

  it('creates numbered spans without step names', async () => {
    const telemetry = createVolcanoTelemetry({
      serviceName: 'test-numbered-steps',
    });

    await agent({ 
      llm: makeMockLLM(), 
      telemetry,
      hideProgress: true 
    })
      .then({ prompt: 'Step 1 prompt' })
      .then({ prompt: 'Step 2 prompt' })
      .run();

    const spans = spanExporter.getFinishedSpans();
    const spanNames = spans.map(s => s.name);

    // Should have numbered step names
    expect(spanNames).toContain('Step 1');
    expect(spanNames).toContain('Step 2');
  });

  it('includes LLM provider and model in step span attributes', async () => {
    const telemetry = createVolcanoTelemetry({
      serviceName: 'test-llm-tags',
    });

    await agent({ 
      llm: makeMockLLM(), 
      telemetry,
      hideProgress: true 
    })
      .then({ 
        name: 'test-step',
        prompt: 'Test prompt' 
      })
      .run();

    const spans = spanExporter.getFinishedSpans();
    const stepSpan = spans.find(s => s.name === 'Step 1: test-step');

    expect(stepSpan).toBeDefined();
    expect(stepSpan!.attributes['llm.provider']).toBe('test-llm');
    expect(stepSpan!.attributes['llm.model']).toBe('test-model');
  });

  it('includes agent name in agent span attributes', async () => {
    const telemetry = createVolcanoTelemetry({
      serviceName: 'test-agent-name',
    });

    await agent({ 
      llm: makeMockLLM(), 
      telemetry,
      name: 'data-pipeline',
      hideProgress: true 
    })
      .then({ prompt: 'Process data' })
      .run();

    const spans = spanExporter.getFinishedSpans();
    const agentSpan = spans.find(s => s.name === 'agent.run');

    expect(agentSpan).toBeDefined();
    expect(agentSpan!.attributes['agent.name']).toBe('data-pipeline');
  });

  it('includes step prompt preview in attributes', async () => {
    const telemetry = createVolcanoTelemetry({
      serviceName: 'test-prompt-preview',
    });

    const longPrompt = 'A'.repeat(150); // 150 character prompt

    await agent({ 
      llm: makeMockLLM(), 
      telemetry,
      hideProgress: true 
    })
      .then({ 
        name: 'long-prompt-test',
        prompt: longPrompt 
      })
      .run();

    const spans = spanExporter.getFinishedSpans();
    
    // Debug: print all span names
    console.log('Spans:', spans.map(s => ({ name: s.name, attrs: s.attributes })));
    
    const stepSpan = spans.find(s => s.name.startsWith('Step '));

    if (!stepSpan) {
      throw new Error(`No step span found. Available spans: ${spans.map(s => s.name).join(', ')}`);
    }
    
    const promptAttr = stepSpan.attributes['step.prompt'] as string;
    expect(promptAttr).toBeDefined();
    expect(promptAttr.length).toBe(100); // Should be truncated to 100 chars
    expect(promptAttr).toBe('A'.repeat(100));
  });
});

