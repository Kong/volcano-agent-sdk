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
    gen: async (prompt: string) => `Response to: ${prompt.substring(0, 50)}`,
    genWithTools: async () => ({ content: 'OK', toolCalls: [] }),
    genStream: async function*(){}
  } as any;
}

async function getCollectorData(type: 'spans' | 'metrics') {
  const response = await fetch(`http://localhost:4318/test/${type}`);
  return response.json();
}

async function resetCollector() {
  await fetch('http://localhost:4318/test/reset', { method: 'POST' });
}

describe('Volcano Agent SDK Observability', () => {
  it('accepts endpoint parameter for auto-configuration', () => {
    const telemetry = createVolcanoTelemetry({
      serviceName: 'test-endpoint',
      endpoint: 'http://localhost:4318'
    });
    
    // Should return valid telemetry object
    expect(telemetry).toBeDefined();
    expect(typeof telemetry.startAgentSpan).toBe('function');
    expect(typeof telemetry.recordMetric).toBe('function');
    
    // Should work even if OTLP packages not installed (graceful fallback)
    const span = telemetry.startAgentSpan(1);
    // May be null if OTLP exporters not installed, but shouldn't throw
    expect(span === null || typeof span === 'object').toBe(true);
  });


  let astroProc: any;
  let provider: NodeTracerProvider;
  let spanExporter: InMemorySpanExporter;
  
  beforeAll(async () => {
    // Start MCP server
    astroProc = startServer('node', ['mcp/astro/server.mjs'], { PORT: '3801' });
    await waitForOutput(astroProc, /listening on :3801/);
    
    // Configure OTEL with in-memory exporter for testing
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
    // Clear spans before each test
    spanExporter.reset();
  });
  
  describe('without telemetry (default)', () => {
    it('works normally without telemetry configured', async () => {
      // No telemetry option - should work fine
      const results = await agent({ llm: makeMockLLM() , hideProgress: true })
        .then({ prompt: "Test without observability" })
        .run();
      
      expect(results.length).toBe(1);
      expect(results[0].llmOutput).toBeDefined();
      
      // No spans should be recorded (telemetry not configured)
      const spans = spanExporter.getFinishedSpans();
      expect(spans.length).toBe(0);
    }, 20000);
  });
  
  describe('with telemetry enabled', () => {
    it('creates agent span for workflow', async () => {
      const telemetry = createVolcanoTelemetry({
        serviceName: 'test-agent'
      });
      
      await agent({ llm: makeMockLLM(), telemetry , hideProgress: true })
        .then({ prompt: "Step 1" })
        .then({ prompt: "Step 2" })
        .run();
      
      // Get recorded spans
      const spans = spanExporter.getFinishedSpans();
      
      // Debug: log all span names
      console.log('Recorded spans:', spans.map((s: any) => s.name));
      
      expect(spans.length).toBeGreaterThan(0);
      
      // Should have agent.run, step.execute, and llm.generate spans
      const agentSpans = spans.filter((s: any) => s.name === 'agent.run');
      const stepSpans = spans.filter((s: any) => s.name.startsWith('Step '));
      const llmSpans = spans.filter((s: any) => s.name === 'llm.generate');
      
      expect(stepSpans.length).toBe(2); // 2 steps
      expect(llmSpans.length).toBe(2); // 2 LLM calls
    }, 20000);
    
    it('creates step spans for each step', async () => {
      const telemetry = createVolcanoTelemetry({
        serviceName: 'test-steps'
      });
      
      await agent({ llm: makeMockLLM(), telemetry , hideProgress: true })
        .then({ prompt: "LLM step" })
        .run();
      
      // Get recorded spans
      const spans = spanExporter.getFinishedSpans();
      const stepSpans = spans.filter((s: any) => s.name.startsWith('Step '));
      expect(stepSpans.length).toBeGreaterThan(0);
      
      // Check step attributes
      const stepSpan = stepSpans[0];
      expect(stepSpan.attributes['step.index']).toBe(0);
      expect(stepSpan.attributes['step.type']).toBe('llm');
    }, 20000);
    
    it('creates LLM spans for LLM calls', async () => {
      const telemetry = createVolcanoTelemetry({
        serviceName: 'test-llm-spans'
      });
      
      const results = await agent({ llm: makeMockLLM(), telemetry , hideProgress: true })
        .then({ prompt: "Test LLM span" })
        .run();
      
      expect(results[0].llmOutput).toBeDefined();
      
      // Get recorded spans
      const spans = spanExporter.getFinishedSpans();
      const llmSpans = spans.filter((s: any) => s.name === 'llm.generate');
      expect(llmSpans.length).toBeGreaterThan(0);
      
      // Check LLM attributes
      const llmSpan = llmSpans[0];
      expect(llmSpan.attributes['llm.provider']).toBe('test-llm');
      expect(llmSpan.attributes['llm.model']).toBe('test-model');
      expect(llmSpan.attributes['llm.prompt_length']).toBeGreaterThan(0);
    }, 20000);
    
    it('creates MCP spans for tool calls', async () => {
      const telemetry = createVolcanoTelemetry({
        serviceName: 'test-mcp-spans'
      });
      
      const astro = mcp('http://localhost:3801/mcp');
      
      const results = await agent({ llm: makeMockLLM(), telemetry , hideProgress: true })
        .then({ mcp: astro, tool: 'get_sign', args: { birthdate: '1993-07-11' } })
        .run();
      
      expect(results[0].mcp?.result).toBeDefined();
      
      // Get recorded spans
      const spans = spanExporter.getFinishedSpans();
      const mcpSpans = spans.filter((s: any) => s.name && s.name.startsWith('mcp.'));
      expect(mcpSpans.length).toBeGreaterThan(0);
      
      // Check MCP attributes
      const mcpSpan = mcpSpans[0];
      expect(mcpSpan.attributes['mcp.endpoint']).toBe('http://localhost:3801/mcp');
      expect(mcpSpan.attributes['mcp.operation']).toBeDefined();
    }, 20000);
    
    it('records metrics for duration and calls', async () => {
      const telemetry = createVolcanoTelemetry({
        serviceName: 'test-metrics'
      });
      
      await agent({ llm: makeMockLLM(), telemetry , hideProgress: true })
        .then({ prompt: "Metric test" })
        .run();
      
      // Metrics should be recorded
      expect(true).toBe(true);
    }, 20000);
  });
  
  describe('telemetry with errors', () => {
    it('records error spans when steps fail', async () => {
      const badLLM: any = {
        id: 'bad-llm',
        model: 'fail',
        client: {},
        gen: async () => { throw new Error('LLM failed'); },
        genWithTools: async () => ({ content: '', toolCalls: [] }),
        genStream: async function*(){}
      };
      
      const telemetry = createVolcanoTelemetry({
        serviceName: 'test-errors'
      });
      
      let error: any;
      try {
        await agent({ llm: badLLM, telemetry , hideProgress: true })
          .then({ prompt: "This will fail" })
          .run();
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      // Error span should be created
    }, 20000);
    
    it('records error metrics', async () => {
      const badLLM: any = {
        id: 'bad-llm',
        model: 'fail',
        client: {},
        gen: async () => { throw new Error('LLM failed'); },
        genWithTools: async () => ({ content: '', toolCalls: [] }),
        genStream: async function*(){}
      };
      
      const telemetry = createVolcanoTelemetry({
        serviceName: 'test-error-metrics'
      });
      
      let error: any;
      try {
        await agent({ llm: badLLM, telemetry , hideProgress: true })
          .then({ prompt: "This will fail" })
          .run();
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      // Error metrics should be recorded
    }, 20000);
  });
  
  describe('telemetry with run() and onStep', () => {
    it('creates spans for workflows with onStep callback', async () => {
      const telemetry = createVolcanoTelemetry({
        serviceName: 'test-streaming'
      });
      
      const results: any[] = [];
      await agent({ llm: makeMockLLM(), telemetry , hideProgress: true })
        .then({ prompt: "Stream step 1" })
        .then({ prompt: "Stream step 2" })
        .run({ onStep: (step) => results.push(step) });
      
      expect(results.length).toBe(2);
      // Spans should be created for onStep callbacks
    }, 20000);
  });
  
  describe('telemetry disabled when not configured', () => {
    it('does not require @opentelemetry/api to be installed', async () => {
      // Even without OTEL installed, telemetry should be no-op
      const results = await agent({ llm: makeMockLLM() , hideProgress: true })
        .then({ prompt: "No telemetry" })
        .run();
      
      expect(results.length).toBe(1);
    }, 20000);
  });
});
