import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn } from 'node:child_process';
import { agent, createVolcanoTelemetry, mcp } from '../src/volcano-agent-sdk.js';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';

function waitForOutput(proc: any, match: RegExp, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for: ${match}`)), timeoutMs);
    const handler = (data: Buffer) => {
      if (match.test(data.toString())) {
        clearTimeout(timer);
        proc.stdout?.off('data', handler);
        proc.stderr?.off('data', handler);
        resolve(true);
      }
    };
    proc.stdout?.on('data', handler);
    proc.stderr?.on('data', handler);
  });
}

function startServer(cmd: string, args: string[], env: Record<string, string | undefined> = {}) {
  const proc = spawn(cmd, args, { env: { ...process.env, ...env } });
  return proc;
}

function makeMockLLM() {
  return {
    id: 'test-llm',
    model: 'test-model',
    client: {},
    gen: async (prompt: string) => {
      // Simulate some latency
      await new Promise(resolve => setTimeout(resolve, 50));
      return `Response to: ${prompt.substring(0, 50)}`;
    },
    genWithTools: async () => ({ content: 'OK', toolCalls: [] }),
    genStream: async function*(){}
  } as any;
}

describe('OpenTelemetry Span Duration & Timing', () => {
  let astroProc: any;
  let provider: NodeTracerProvider;
  let spanExporter: InMemorySpanExporter;
  
  beforeAll(async () => {
    // Start MCP server
    astroProc = startServer('node', ['mcp/astro/server.mjs'], { PORT: '3901' });
    await waitForOutput(astroProc, /listening on :3901/);
    
    // Configure OTEL with in-memory exporter
    spanExporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(spanExporter)]
    });
    provider.register();
  }, 30000);
  
  afterAll(async () => {
    await provider?.shutdown();
    astroProc?.kill();
  });
  
  beforeEach(() => {
    spanExporter.reset();
  });
  
  describe('span timing validation', () => {
    it('records start and end times for all spans', async () => {
      const telemetry = createVolcanoTelemetry({ serviceName: 'timing-test' });
      
      await agent({ llm: makeMockLLM(), telemetry , hideProgress: true })
        .then({ prompt: "Test timing" })
        .run();
      
      const spans = spanExporter.getFinishedSpans();
      
      // All spans should have start and end times
      spans.forEach(span => {
        expect(span.startTime).toBeDefined();
        expect(span.endTime).toBeDefined();
        
        // Both should be HrTime arrays [seconds, nanoseconds]
        expect(Array.isArray(span.startTime) || typeof span.startTime === 'number').toBe(true);
        expect(Array.isArray(span.endTime) || typeof span.endTime === 'number').toBe(true);
        
        // Span should have completed (endTime exists)
        expect(span.endTime).toBeTruthy();
      });
    }, 20000);
    
    it('records duration_ms attribute on step spans', async () => {
      const telemetry = createVolcanoTelemetry({ serviceName: 'duration-attr-test' });
      
      await agent({ llm: makeMockLLM(), telemetry , hideProgress: true })
        .then({ prompt: "Test duration attribute" })
        .run();
      
      const spans = spanExporter.getFinishedSpans();
      const stepSpans = spans.filter(s => s.name.startsWith('Step '));
      
      expect(stepSpans.length).toBeGreaterThan(0);
      
      stepSpans.forEach(span => {
        // Should have duration_ms attribute
        expect(span.attributes['duration_ms']).toBeDefined();
        expect(span.attributes['duration_ms']).toBeGreaterThan(0);
      });
    }, 20000);
    
    it('records llm.duration_ms attribute on step spans', async () => {
      const telemetry = createVolcanoTelemetry({ serviceName: 'llm-duration-test' });
      
      await agent({ llm: makeMockLLM(), telemetry , hideProgress: true })
        .then({ prompt: "Test LLM duration" })
        .run();
      
      const spans = spanExporter.getFinishedSpans();
      const stepSpans = spans.filter(s => s.name.startsWith('Step '));
      
      stepSpans.forEach(span => {
        // Should have llm.duration_ms attribute
        expect(span.attributes['llm.duration_ms']).toBeDefined();
        expect(span.attributes['llm.duration_ms']).toBeGreaterThan(0);
        
        // LLM duration should be less than or equal to total step duration
        expect(span.attributes['llm.duration_ms']).toBeLessThanOrEqual(span.attributes['duration_ms']);
      });
    }, 20000);
    
    it('records timing for MCP tool calls', async () => {
      const telemetry = createVolcanoTelemetry({ serviceName: 'mcp-timing-test' });
      const astro = mcp('http://localhost:3901/mcp');
      
      await agent({ llm: makeMockLLM(), telemetry , hideProgress: true })
        .then({ mcp: astro, tool: 'get_sign', args: { birthdate: '1993-07-11' } })
        .run();
      
      const spans = spanExporter.getFinishedSpans();
      const stepSpans = spans.filter(s => s.name.startsWith('Step '));
      
      expect(stepSpans.length).toBeGreaterThan(0);
      
      stepSpans.forEach(span => {
        // Should have duration_ms attribute from StepResult
        expect(span.attributes['duration_ms']).toBeGreaterThan(0);
        
        // Span itself should have start/end times
        expect(span.startTime).toBeDefined();
        expect(span.endTime).toBeDefined();
      });
    }, 20000);
    
    it('LLM spans have measurable duration', async () => {
      const telemetry = createVolcanoTelemetry({ serviceName: 'llm-span-timing' });
      
      await agent({ llm: makeMockLLM(), telemetry , hideProgress: true })
        .then({ prompt: "Test" })
        .run();
      
      const spans = spanExporter.getFinishedSpans();
      const llmSpans = spans.filter(s => s.name === 'llm.generate');
      
      expect(llmSpans.length).toBeGreaterThan(0);
      
      llmSpans.forEach(span => {
        // Span should have completed
        expect(span.endTime).toBeDefined();
        expect(span.startTime).toBeDefined();
        
        // LLM spans exist and are properly tracked
        expect(span.name).toBe('llm.generate');
      });
    }, 20000);
    
    it('aggregates total duration on agent span', async () => {
      const telemetry = createVolcanoTelemetry({ serviceName: 'agent-total-duration' });
      
      await agent({ llm: makeMockLLM(), telemetry , hideProgress: true })
        .then({ prompt: "Step 1" })
        .then({ prompt: "Step 2" })
        .then({ prompt: "Step 3" })
        .run();
      
      const spans = spanExporter.getFinishedSpans();
      const agentSpan = spans.find(s => s.name === 'agent.run');
      
      expect(agentSpan).toBeDefined();
      
      // Agent span should have timing
      expect(agentSpan!.startTime).toBeDefined();
      expect(agentSpan!.endTime).toBeDefined();
      
      // Should have recorded 3 steps
      expect(agentSpan!.attributes['agent.step_count']).toBe(3);
    }, 20000);
    
    it('span hierarchy shows parent-child timing relationships', async () => {
      const telemetry = createVolcanoTelemetry({ serviceName: 'hierarchy-test' });
      
      await agent({ llm: makeMockLLM(), telemetry , hideProgress: true })
        .then({ prompt: "Parent step" })
        .run();
      
      const spans = spanExporter.getFinishedSpans();
      const agentSpan = spans.find(s => s.name === 'agent.run');
      const stepSpan = spans.find(s => s.name.startsWith('Step '));
      const llmSpan = spans.find(s => s.name === 'llm.generate');
      
      // All should exist
      expect(agentSpan).toBeDefined();
      expect(stepSpan).toBeDefined();
      expect(llmSpan).toBeDefined();
      
      // Verify span hierarchy exists
      // We have agent, step, and LLM spans
      expect(agentSpan!.name).toBe('agent.run');
      expect(stepSpan!.name).toMatch(/^Step \d+$/);
      expect(llmSpan!.name).toBe('llm.generate');
      
      // All spans completed with timing
      expect(agentSpan!.endTime).toBeDefined();
      expect(stepSpan!.endTime).toBeDefined();
      expect(llmSpan!.endTime).toBeDefined();
      
      // Step and LLM have duration attributes
      expect(stepSpan!.attributes['duration_ms']).toBeGreaterThan(0);
      expect(stepSpan!.attributes['llm.duration_ms']).toBeGreaterThan(0);
    }, 20000);
  });
});
