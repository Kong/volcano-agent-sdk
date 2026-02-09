/**
 * E2E test for OpenTelemetry integration using the compiled dist package
 * 
 * This test simulates real-world usage where consumers:
 * 1. Install the published package (use dist/)
 * 2. Run in ES module context ("type": "module")
 * 3. Have @opentelemetry/api as a dependency
 * 
 * Why this test is needed:
 * - The main telemetry.test.ts imports from '../src/' which runs through TypeScript/Vitest
 * - Source imports work differently than compiled dist imports
 * - This test catches ES module compatibility issues that only appear in production
 */

import { describe, it, expect } from 'vitest';
import { createVolcanoTelemetry, agent } from '../dist/volcano-agent-sdk.js';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';

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

describe('OpenTelemetry E2E - Dist Package in ES Module Context', () => {
  it('should load @opentelemetry/api without warnings in ES module context', () => {
    // Capture console warnings
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (msg: string) => {
      warnings.push(msg);
      originalWarn(msg);
    };

    try {
      // This should NOT produce a warning about @opentelemetry/api not found
      const telemetry = createVolcanoTelemetry({
        serviceName: 'test-es-module-service',
      });

      // Verify telemetry was created successfully
      expect(telemetry).toBeDefined();
      expect(typeof telemetry.startAgentSpan).toBe('function');
      expect(typeof telemetry.recordMetric).toBe('function');

      // Verify NO warning was emitted about OpenTelemetry not being found
      const otelWarnings = warnings.filter(w => 
        w.includes('OpenTelemetry API not found') || 
        w.includes('@opentelemetry/api')
      );
      expect(otelWarnings).toHaveLength(0);
      
    } finally {
      console.warn = originalWarn;
    }
  });

  it('should successfully create spans when using dist package', async () => {
    // Setup OTEL provider
    const spanExporter = new InMemorySpanExporter();
    const provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(spanExporter)]
    });
    provider.register();

    try {
      // Create telemetry using the dist package
      const telemetry = createVolcanoTelemetry({
        serviceName: 'dist-test-service'
      });

      // Run an agent workflow with telemetry
      const results = await agent({ llm: makeMockLLM(), telemetry, hideProgress: true })
        .then({ prompt: "Test step 1" })
        .then({ prompt: "Test step 2" })
        .run();

      expect(results.length).toBe(2);

      // Verify spans were created
      const spans = spanExporter.getFinishedSpans();
      expect(spans.length).toBeGreaterThan(0);

      // Should have agent, step, and llm spans
      const spanNames = spans.map(s => s.name);
      expect(spanNames).toContain('agent.run');
      expect(spanNames.filter(n => n.startsWith('Step ')).length).toBe(2);
      expect(spanNames.filter(n => n === 'llm.generate').length).toBe(2);

    } finally {
      await provider.shutdown();
    }
  });

  it('should work with ES module dynamic imports (regression test for require() issue)', async () => {
    // This test specifically validates that the fix for issue #28 works
    // The issue was that require() doesn't work in ES module contexts
    // Now we use createRequire(import.meta.url) which does work
    
    // Multiple calls to ensure the caching works too
    const telemetry1 = createVolcanoTelemetry({ serviceName: 'test-1' });
    const telemetry2 = createVolcanoTelemetry({ serviceName: 'test-2' });

    expect(telemetry1).toBeDefined();
    expect(telemetry2).toBeDefined();

    // Verify both have the expected methods (proves OTEL loaded successfully)
    expect(typeof telemetry1.startAgentSpan).toBe('function');
    expect(typeof telemetry1.endSpan).toBe('function');
    expect(typeof telemetry1.recordMetric).toBe('function');
    
    expect(typeof telemetry2.startAgentSpan).toBe('function');
    expect(typeof telemetry2.endSpan).toBe('function');
    expect(typeof telemetry2.recordMetric).toBe('function');
  });

  it('should handle metrics in ES module context', async () => {
    const telemetry = createVolcanoTelemetry({
      serviceName: 'metrics-test',
      metrics: true
    });

    // These should not throw errors
    expect(() => {
      telemetry.recordMetric('agent.duration', 100, { status: 'success' });
      telemetry.recordMetric('llm.call', 1, { provider: 'test' });
      telemetry.recordMetric('error', 1, { type: 'network' });
    }).not.toThrow();
  });
});

