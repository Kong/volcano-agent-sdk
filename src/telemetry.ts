import { createRequire } from 'node:module';
import type { StepResult, LLMHandle, MCPHandle } from './volcano-agent-sdk.js';

type Tracer = any;
type Span = any;
type Meter = any;
type Counter = any;
type Histogram = any;

export type VolcanoTelemetryConfig = {
  serviceName?: string;
  endpoint?: string; // OTLP endpoint (e.g., 'http://localhost:4318')
  tracer?: Tracer;
  meter?: Meter;
  traces?: boolean;
  metrics?: boolean;
};

export type VolcanoTelemetry = {
  startAgentSpan: (stepCount: number, agentName?: string) => Span | null;
  startStepSpan: (parent: Span | null, stepIndex: number, stepType: string, stepPrompt?: string, stepName?: string, llm?: any) => Span | null;
  startLLMSpan: (parent: Span | null, llm: LLMHandle, prompt: string) => Span | null;
  startMCPSpan: (parent: Span | null, mcp: MCPHandle, operation: string) => Span | null;
  endSpan: (span: Span | null, result?: StepResult, error?: any) => void;
  recordMetric: (name: string, value: number, attributes?: Record<string, any>) => void;
  flush: () => Promise<void>;
};

let otelApi: any = null;
let hasOtelWarned = false;

function tryLoadOtel() {
  if (otelApi) return otelApi;
  
  try {
    const require = createRequire(import.meta.url);
    otelApi = require('@opentelemetry/api');
    return otelApi;
  } catch {
    if (!hasOtelWarned) {
      console.warn('[Volcano] OpenTelemetry API not found. Install with: npm install @opentelemetry/api');
      hasOtelWarned = true;
    }
    return null;
  }
}

// Managed the lifecycle of OpenTelemetry SDK instances to ensure graceful shutdown.
const shutdownManager = {
  sdkInstances: [] as any[],
  isHookRegistered: false,
  isShuttingDown: false,

  // Registers a new SDK instance to be shutdown on process exit.
  add(sdk: any) {
    this.sdkInstances.push(sdk);
    this.registerHook();
  },
  
  // Perform graceful shutdown of all SDK instances
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    if (this.sdkInstances.length === 0) return;
    
    console.log(`[Volcano] Shutting down ${this.sdkInstances.length} OpenTelemetry SDK instance(s)...`);
    try {
      // Shut down all SDKs with a timeout to prevent hanging
      await Promise.race([
        Promise.all(this.sdkInstances.map(sdk => sdk.shutdown())),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Shutdown timeout')), 5000)
        )
      ]);
      console.log('[Volcano] OpenTelemetry SDKs shut down successfully.');
    } catch (err) {
      console.error('[Volcano] Error shutting down OpenTelemetry SDKs:', err);
    }
  },
  
  // Register hooks for various process exit scenarios
  registerHook() {
    if (this.isHookRegistered) return;
    this.isHookRegistered = true;
    
    // Skip aggressive handlers in test environments to avoid interfering with test frameworks
    const isTestEnv = process.env.NODE_ENV === 'test' || 
                      process.env.VITEST === 'true' || 
                      process.env.JEST_WORKER_ID !== undefined ||
                      typeof (globalThis as any).it === 'function'; // vitest/jest detected
    
    // Handle normal process exit (event loop becomes empty)
    // Safe in test environments - doesn't call process.exit()
    process.on('beforeExit', async () => {
      await this.shutdown();
    });
    
    // Only register signal and error handlers in production environments
    // These handlers call process.exit() which interferes with test execution
    if (!isTestEnv) {
      // Handle SIGTERM (e.g., from docker stop, kubernetes)
      process.on('SIGTERM', async () => {
        console.log('[Volcano] Received SIGTERM signal');
        await this.shutdown();
        process.exit(0);
      });
      
      // Handle SIGINT (e.g., Ctrl+C)
      process.on('SIGINT', async () => {
        console.log('[Volcano] Received SIGINT signal');
        await this.shutdown();
        process.exit(0);
      });
      
      // Handle uncaught exceptions
      process.on('uncaughtException', async (err) => {
        console.error('[Volcano] Uncaught exception:', err);
        await this.shutdown();
        process.exit(1);
      });
      
      // Handle unhandled promise rejections
      process.on('unhandledRejection', async (reason, promise) => {
        console.error('[Volcano] Unhandled rejection at:', promise, 'reason:', reason);
        await this.shutdown();
        process.exit(1);
    });
    }
  }
};

export function createVolcanoTelemetry(config: VolcanoTelemetryConfig = {}): VolcanoTelemetry {
  const otel = tryLoadOtel();
  if (!otel) {
    return {
      startAgentSpan: () => null,
      startStepSpan: () => null,
      startLLMSpan: () => null,
      startMCPSpan: () => null,
      endSpan: () => {},
      recordMetric: () => {},
      flush: async () => {}
    };
  }
  
  const serviceName = config.serviceName || 'volcano-agent-sdk';
  const enableTraces = config.traces !== false;
  const enableMetrics = config.metrics !== false;
  
  let sdk: any = null;
  let metricReader: any = null;
  
  if (config.endpoint) {
    try {
      const require = createRequire(import.meta.url);
      const { NodeSDK } = require('@opentelemetry/sdk-node');
      const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
      const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
      const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
      
      if (enableMetrics) {
        metricReader = new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({ 
            url: `${config.endpoint}/v1/metrics`,
            timeoutMillis: 5000
          }),
          exportIntervalMillis: 5000,
          exportTimeoutMillis: 5000
        });
      }
      
      sdk = new NodeSDK({
        serviceName,
        traceExporter: enableTraces ? new OTLPTraceExporter({ 
          url: `${config.endpoint}/v1/traces`,
          timeoutMillis: 5000
        }) : undefined,
        metricReader
      });
      
      sdk.start();
      shutdownManager.add(sdk);

      console.log(`[Volcano] ✅ OpenTelemetry SDK started`);
      console.log(`[Volcano]    Traces → ${config.endpoint}/v1/traces`);
      console.log(`[Volcano]    Metrics → ${config.endpoint}/v1/metrics (every 5s)`);
    } catch (e) {
      console.warn('[Volcano] Failed to auto-configure OpenTelemetry SDK:', e);
      console.warn('[Volcano] Install dependencies: npm install @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http @opentelemetry/exporter-metrics-otlp-http');
    }
  }
  
  // Get or create tracer
  const tracer = config.tracer || (enableTraces ? otel.trace.getTracer(serviceName, '0.1.0') : null);
  
  // Get or create meter
  const meter = config.meter || (enableMetrics ? otel.metrics.getMeter(serviceName, '0.1.0') : null);
  
  // Metrics registry with configuration
  type MetricConfig = {
    instrument: Counter | Histogram | null;
    type: 'counter' | 'histogram';
  };
  
  const metricsRegistry = new Map<string, MetricConfig>();
  
  if (meter) {
    try {
      // Initialize all metrics and register them
      const metricDefinitions = [
        { name: 'agent.duration', type: 'histogram' as const, description: 'Agent workflow duration', unit: 'milliseconds' },
        { name: 'step.duration', type: 'histogram' as const, description: 'Individual step duration', unit: 'milliseconds' },
        { name: 'llm.call', type: 'counter' as const, description: 'Total LLM API calls', unit: '1' },
        { name: 'mcp.call', type: 'counter' as const, description: 'Total MCP tool calls', unit: '1' },
        { name: 'agent.call', type: 'counter' as const, description: 'Total sub-agent delegations', unit: '1' },
        { name: 'agent.delegation', type: 'histogram' as const, description: 'Number of agents delegated to per step', unit: 'agents' },
        { name: 'error', type: 'counter' as const, description: 'Total errors by type', unit: '1' },
        { name: 'llm.tokens.input', type: 'counter' as const, description: 'Input tokens sent to LLM', unit: '1' },
        { name: 'llm.tokens.output', type: 'counter' as const, description: 'Output tokens generated by LLM', unit: '1' },
        { name: 'llm.tokens.total', type: 'counter' as const, description: 'Total tokens (input + output)', unit: '1' },
        { name: 'llm.duration', type: 'histogram' as const, description: 'LLM API call duration', unit: 'milliseconds' },
        { name: 'mcp.tool.duration', type: 'histogram' as const, description: 'Individual MCP tool call duration', unit: 'milliseconds' },
        { name: 'llm.time_to_first_token', type: 'histogram' as const, description: 'Time until first token from LLM', unit: 'milliseconds' },
        { name: 'agent.tokens', type: 'counter' as const, description: 'Tokens consumed by named agents', unit: '1' },
        { name: 'agent.execution', type: 'counter' as const, description: 'Agent execution count by name', unit: '1' },
        { name: 'agent.subagent_call', type: 'counter' as const, description: 'Sub-agent calls with parent-child relationship', unit: '1' },
        { name: 'workflow.steps', type: 'histogram' as const, description: 'Number of steps per workflow', unit: 'steps' },
        { name: 'workflow.retry', type: 'counter' as const, description: 'Retry attempts', unit: '1' },
        { name: 'workflow.timeout', type: 'counter' as const, description: 'Timeout occurrences', unit: '1' }
      ];

      for (const def of metricDefinitions) {
        const fullName = `volcano.${def.name}`;
        const instrument = def.type === 'counter'
          ? meter.createCounter(fullName, { description: def.description, unit: def.unit })
          : meter.createHistogram(fullName, { description: def.description, unit: def.unit });
        
        metricsRegistry.set(def.name, { instrument, type: def.type });
      }
    } catch (e) {
      console.warn('[Volcano] Failed to create metrics:', e);
    }
  }
  
  return {
    startAgentSpan(stepCount: number, agentName?: string): Span | null {
      if (!tracer) return null;
      
      try {
        return tracer.startSpan('agent.run', {
          attributes: {
            'agent.step_count': stepCount,
            'agent.name': agentName || 'anonymous',
            'volcano.version': '0.1.0'
          }
        });
      } catch (e) {
        console.warn('[Volcano] Failed to start agent span:', e);
        return null;
      }
    },
    
    startStepSpan(parent: Span | null, stepIndex: number, stepType: string, stepPrompt?: string, stepName?: string, llm?: any): Span | null {
      if (!tracer) return null;
      
      try {
        const ctx = parent ? otel.trace.setSpan(otel.context.active(), parent) : undefined;
        const attrs: Record<string, any> = {
          'step.index': stepIndex,
          'step.type': stepType
        };
        
        if (stepName) {
          attrs['step.name'] = stepName;
        }
        
        if (stepPrompt) {
          attrs['step.prompt'] = stepPrompt.substring(0, 100);
        }
        
        if (llm) {
          attrs['llm.provider'] = (llm as any).id || 'unknown';
          attrs['llm.model'] = llm.model || 'unknown';
        }
        
        let spanName = 'step.execute';
        if (stepName) {
          spanName = `Step ${stepIndex + 1}: ${stepName}`;
        } else if (stepIndex >= 0) {
          spanName = `Step ${stepIndex + 1}`;
        }
        
        return tracer.startSpan(spanName, { attributes: attrs }, ctx);
      } catch (e) {
        console.warn('[Volcano] Failed to start step span:', e);
        return null;
      }
    },
    
    startLLMSpan(parent: Span | null, llm: LLMHandle, prompt: string): Span | null {
      if (!tracer) return null;
      
      try {
        const ctx = parent ? otel.trace.setSpan(otel.context.active(), parent) : undefined;
        return tracer.startSpan('llm.generate', {
          attributes: {
            'llm.provider': (llm as any).id || 'unknown',
            'llm.model': llm.model,
            'llm.prompt_length': prompt.length
          }
        }, ctx);
      } catch (e) {
        console.warn('[Volcano] Failed to start LLM span:', e);
        return null;
      }
    },
    
    startMCPSpan(parent: Span | null, mcp: MCPHandle, operation: string): Span | null {
      if (!tracer) return null;
      
      try {
        const ctx = parent ? otel.trace.setSpan(otel.context.active(), parent) : undefined;
        return tracer.startSpan(`mcp.${operation}`, {
          attributes: {
            'mcp.endpoint': mcp.url,
            'mcp.operation': operation,
            'mcp.has_auth': !!mcp.auth
          }
        }, ctx);
      } catch (e) {
        console.warn('[Volcano] Failed to start MCP span:', e);
        return null;
      }
    },
    
    endSpan(span: Span | null, result?: StepResult, error?: any): void {
      if (!span) return;
      
      try {
        if (error) {
          span.setStatus({ 
            code: otel.SpanStatusCode.ERROR, 
            message: error.message 
          });
          span.recordException(error);
        } else {
          span.setStatus({ code: otel.SpanStatusCode.OK });
          
          if (result) {
            if (result.durationMs) span.setAttribute('duration_ms', result.durationMs);
            if (result.llmMs) span.setAttribute('llm.duration_ms', result.llmMs);
            if (result.toolCalls) span.setAttribute('mcp.tool_count', result.toolCalls.length);
          }
        }
        
        span.end();
      } catch (e) {
        console.warn('[Volcano] Failed to end span:', e);
      }
    },
    
    recordMetric(name: string, value: number, attributes: Record<string, any> = {}): void {
      if (process.env.VOLCANO_DEBUG_TELEMETRY) {
        console.log(`[Volcano Telemetry] Recording: ${name} = ${value}`, attributes);
      }
      
      try {
        const metricConfig = metricsRegistry.get(name);
        if (!metricConfig || !metricConfig.instrument) return;

        if (metricConfig.type === 'histogram') {
          (metricConfig.instrument as Histogram).record(value, attributes);
        } else {
          // For counters, some metrics always add 1, others add the value
          const counterValue = name === 'llm.call' || name === 'agent.execution' || 
                              name === 'agent.subagent_call' || name === 'workflow.retry' || 
                              name === 'workflow.timeout' || name === 'error' ? 1 : value;
          (metricConfig.instrument as Counter).add(counterValue, attributes);
        }
      } catch (e) {
        console.warn('[Volcano] Failed to record metric:', e);
      }
    },

    async flush() {
      // Flush both traces and metrics to backend
      try {
        // Flush metric reader directly (forceFlush on reader works, SDK doesn't have it)
        if (metricReader && typeof metricReader.forceFlush === 'function') {
          await metricReader.forceFlush();
          
          if (process.env.VOLCANO_DEBUG_TELEMETRY === 'true') {
            console.log('[Volcano] Metrics flushed via MetricReader');
          }
        } else if (process.env.VOLCANO_DEBUG_TELEMETRY === 'true') {
          console.log('[Volcano] No MetricReader to flush');
        }
        
        // Traces are auto-flushed by SpanProcessor, but we can try if SDK has it
        if (sdk) {
          const tracerProvider = sdk.getTracerProvider?.();
          if (tracerProvider && typeof tracerProvider.forceFlush === 'function') {
            await tracerProvider.forceFlush();
            
            if (process.env.VOLCANO_DEBUG_TELEMETRY === 'true') {
              console.log('[Volcano] Traces flushed via TracerProvider');
            }
          }
        }
      } catch (e) {
        console.warn('[Volcano] Failed to flush telemetry:', e);
      }
    }
  };
}

// No-op telemetry (when not configured)
export const noopTelemetry: VolcanoTelemetry = {
  startAgentSpan: () => null,
  startStepSpan: () => null,
  startLLMSpan: () => null,
  startMCPSpan: () => null,
  endSpan: () => {},
  recordMetric: () => {},
  flush: async () => {}
};
