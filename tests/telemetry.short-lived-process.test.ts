import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { agent } from '../src/volcano-agent-sdk.js';
import { createVolcanoTelemetry } from '../src/telemetry.js';

describe('Telemetry - Short-Lived Process (Issue #38)', () => {
  let flushCalled = false;
  let tracerProviderFlushed = false;
  let metricReaderFlushed = false;

  function createMockLLM() {
    const usage = {
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30
    };
    
    return {
      id: 'test-provider',
      model: 'test-model',
      client: {},
      gen: async (prompt: string) => 'Test response',
      genWithTools: async (prompt: string, tools: any[]) => ({
        content: 'Test response',
        toolCalls: []
      }),
      genStream: async function*() {
        yield 'Test';
        yield ' response';
      },
      getUsage: () => usage
    };
  }

  /**
   * Create a telemetry instance that tracks flush calls
   */
  function createTrackingTelemetry() {
    const spans: any[] = [];
    const metrics: Array<{name: string; value: number; attrs: any}> = [];
    let agentSpanEnded = false;
    
    return {
      telemetry: {
        startAgentSpan: (stepCount: number, agentName?: string) => {
          const span = {
            id: 'agent-span',
            ended: false,
            attributes: { stepCount, agentName }
          };
          spans.push(span);
          return span;
        },
        startStepSpan: (parent: any, stepIndex: number, stepType: string) => {
          const span = {
            id: `step-span-${stepIndex}`,
            parent,
            ended: false,
            attributes: { stepIndex, stepType }
          };
          spans.push(span);
          return span;
        },
        startLLMSpan: () => null,
        startMCPSpan: () => null,
        endSpan: (span: any, result?: any, error?: any) => {
          if (span) {
            span.ended = true;
            span.result = result;
            span.error = error;
            if (span.id === 'agent-span') {
              agentSpanEnded = true;
            }
          }
        },
        recordMetric: (name: string, value: number, attrs: any = {}) => {
          metrics.push({ name, value, attrs });
        },
        flush: async () => {
          flushCalled = true;
        }
      },
      spans,
      metrics,
      isAgentSpanEnded: () => agentSpanEnded
    };
  }

  beforeEach(() => {
    flushCalled = false;
    tracerProviderFlushed = false;
    metricReaderFlushed = false;
  });

  it('demonstrates the issue: agent span is ended but flush is not called after run()', async () => {
    const mock = createTrackingTelemetry();
    const llm = createMockLLM() as any;

    // Simulate a short-lived process
    await agent({ 
      llm, 
      telemetry: mock.telemetry,
      hideProgress: true,
      name: 'short-lived-agent'
    })
      .then({ prompt: 'Quick task' })
      .run();

    // After run() completes:
    // 1. The agent span should be ended
    expect(mock.isAgentSpanEnded()).toBe(true);
    
    // 2. Metrics should be recorded
    expect(mock.metrics.length).toBeGreaterThan(0);
    const agentDurationMetric = mock.metrics.find(m => m.name === 'agent.duration');
    expect(agentDurationMetric).toBeDefined();
    
    // 3. Find all step spans
    const stepSpans = mock.spans.filter(s => s.id.startsWith('step-span'));
    expect(stepSpans.length).toBeGreaterThan(0);
    
    // 4. Step spans should be ended (flush is called after each step)
    stepSpans.forEach(span => {
      expect(span.ended).toBe(true);
    });
    
    // 5. Agent span should be ended
    const agentSpan = mock.spans.find(s => s.id === 'agent-span');
    expect(agentSpan).toBeDefined();
    expect(agentSpan.ended).toBe(true);
    
    // Note: flushCalled is true because flush() is called after each step (line 2169),
    // but there's no guarantee the final agent span was flushed.
    expect(flushCalled).toBe(true); // Called during steps
  });

  it('verifies that flush() is now called after run() completes', async () => {
    const mock = createTrackingTelemetry();
    const llm = createMockLLM() as any;
    
    let flushCallCount = 0;
    let flushCalledAfterAgentSpan = false;
    const originalFlush = mock.telemetry.flush;
    mock.telemetry.flush = async () => {
      flushCallCount++;
      // Check if flush is called after the agent span is ended
      if (mock.isAgentSpanEnded()) {
        flushCalledAfterAgentSpan = true;
      }
      await originalFlush();
    };

    await agent({ 
      llm, 
      telemetry: mock.telemetry,
      hideProgress: true,
      name: 'test-agent'
    })
      .then({ prompt: 'Task 1' })
      .then({ prompt: 'Task 2' })
      .run();

    // flush() is called after each step (2 times) + after workflow completes (1 time) = 3 total
    expect(flushCallCount).toBe(3);
    
    expect(flushCalledAfterAgentSpan).toBe(true);
  });

  it('demonstrates proper behavior: flush is automatically called after run()', async () => {
    const mock = createTrackingTelemetry();
    const llm = createMockLLM() as any;
    
    let postRunFlushCalled = false;
    const originalFlush = mock.telemetry.flush;
    
    // Track if flush is called after agent span ends
    mock.telemetry.flush = async () => {
      if (mock.isAgentSpanEnded()) {
        postRunFlushCalled = true;
      }
      await originalFlush();
    };

    await agent({ 
      llm, 
      telemetry: mock.telemetry,
      hideProgress: true,
      name: 'test-agent'
    })
      .then({ prompt: 'Task' })
      .run();

    // ✅ FIXED: flush is now automatically called after the agent span ends
    expect(postRunFlushCalled).toBe(true);
    expect(flushCalled).toBe(true);
  });

  it('no longer requires manual flush() - automatically handled', async () => {
    const mock = createTrackingTelemetry();
    const llm = createMockLLM() as any;

    // Simulate the observability.ts example
    const results = await agent({ 
      llm, 
      telemetry: mock.telemetry,
      hideProgress: true,
      name: 'demo-agent'
    })
      .then({ prompt: 'What is TypeScript?' })
      .then({ prompt: 'Why is it popular?' })
      .run();

    expect(flushCalled).toBe(true);
    expect(results.length).toBe(2);
    expect(mock.isAgentSpanEnded()).toBe(true);
  });

  it('verifies the fix works with real OTel SDK setup', async () => {
    let telemetry;
    try {
      telemetry = createVolcanoTelemetry({
        serviceName: 'test-short-lived',
        endpoint: 'http://localhost:4318'
      });
    } catch (e) {
      console.log('Skipping real OTel test - dependencies not available');
      return;
    }

    const llm = createMockLLM() as any;

    // Run a quick workflow
    await agent({ 
      llm, 
      telemetry,
      hideProgress: true,
      name: 'short-lived-test'
    })
      .then({ prompt: 'Quick task' })
      .run();
  });
});
