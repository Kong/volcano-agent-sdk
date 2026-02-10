// src/volcano-agent-sdk.ts
import { Client as MCPClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { llmOpenAI as llmOpenAIProvider, llmOpenAIResponses as llmOpenAIResponsesProvider } from "./llms/openai.js";
import { executeParallel, executeBranch, executeSwitch, executeWhile, executeForEach, executeRetryUntil, executeRunAgent } from "./patterns.js";
import { createHash } from "node:crypto";
import { recordTokenMetrics, getLLMProviderId, normalizeTokenUsage } from "./token-utils.js";
import * as CONSTANTS from "./constants.js";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import ora from "ora";
export { llmAnthropic } from "./llms/anthropic.js";
export { llmLlama } from "./llms/llama.js";
export { llmMistral } from "./llms/mistral.js";
export { llmBedrock } from "./llms/bedrock.js";
export { llmVertexStudio } from "./llms/vertex-studio.js";
export { llmAzure } from "./llms/azure.js";
export { createVolcanoTelemetry, noopTelemetry } from "./telemetry.js";
export type { VolcanoTelemetryConfig, VolcanoTelemetry } from "./telemetry.js";
export type { OpenAIConfig, OpenAIOptions } from "./llms/openai.js";
export type { AnthropicConfig, AnthropicOptions } from "./llms/anthropic.js";
export type { LlamaConfig, LlamaOptions } from "./llms/llama.js";
export type { MistralConfig, MistralOptions } from "./llms/mistral.js";
export type { BedrockConfig, BedrockOptions } from "./llms/bedrock.js";
export type { VertexStudioConfig, VertexStudioOptions, VertexStudioClientOptions } from "./llms/vertex-studio.js";
export type { AzureConfig, AzureOptions } from "./llms/azure.js";
import type { LLMHandle, ToolDefinition, LLMToolResult } from "./llms/types.js";
import Ajv from "ajv";

/* ---------- LLM ---------- */
export type { LLMHandle, ToolDefinition, LLMToolResult };
export const llmOpenAI = llmOpenAIProvider;
export const llmOpenAIResponses = llmOpenAIResponsesProvider;

/* ---------- Errors ---------- */
export interface VolcanoErrorMeta {
  stepId?: number;
  provider?: string;
  requestId?: string;
  retryable?: boolean;
}

export class VolcanoError extends Error {
  meta: VolcanoErrorMeta;
  constructor(message: string, meta: VolcanoErrorMeta = {}, options?: { cause?: unknown }) {
    super(message);
    this.name = this.constructor.name;
    this.meta = meta;
    if (options?.cause) {
      Object.defineProperty(this, 'cause', {
        value: options.cause,
        enumerable: false,
        configurable: true
      });
    }
  }
}
export class AgentConcurrencyError extends VolcanoError {}
export class TimeoutError extends VolcanoError {}
export class ValidationError extends VolcanoError {}
export class RetryExhaustedError extends VolcanoError {}
export class LLMError extends VolcanoError {}
export class MCPError extends VolcanoError {}
export class MCPConnectionError extends MCPError {}
export class MCPToolError extends MCPError {}

function isRetryableStatus(status?: number): boolean {
  if (!status && status !== 0) return false;
  return status >= 500 || status === 429 || status === 408;
}
function classifyProviderFromLlm(usedLlm?: LLMHandle): string | undefined {
  if (!usedLlm) return undefined;
  return `llm:${getLLMProviderId(usedLlm)}`;
}
function classifyProviderFromMcp(handle?: MCPHandle): string | undefined {
  if (!handle) return undefined;
  try { const u = new URL(handle.url); return `mcp:${u.host}`; } catch { return `mcp:${handle.id}`; }
}
function normalizeError(e: any, kind: 'timeout'|'validation'|'llm'|'mcp-conn'|'mcp-tool'|'retry', meta: VolcanoErrorMeta): VolcanoError {
  if (kind === 'timeout') return new TimeoutError(e?.message || 'Step timed out', { ...meta, retryable: true }, { cause: e });
  if (kind === 'validation') return new ValidationError(e?.message || 'Validation failed', { ...meta, retryable: false }, { cause: e });
  if (kind === 'retry') return new RetryExhaustedError(e?.message || 'Retry attempts exhausted', { ...meta }, { cause: e });
  if (kind === 'llm') {
    const status = e?.status ?? e?.response?.status;
    const requestId = e?.response?.headers?.get?.('x-request-id') || e?.id || e?.response?.data?.id;
    const retryable = (status == null ? true : isRetryableStatus(status)) || !!e?.code?.toString?.()?.includes?.('ECONN') || !!e?.code?.toString?.()?.includes?.('ETIMEDOUT');
    return new LLMError(e?.message || 'LLM error', { ...meta, requestId, retryable }, { cause: e });
  }
  if (kind === 'mcp-conn') {
    const retryable = true;
    return new MCPConnectionError(e?.message || 'MCP connection error', { ...meta, retryable }, { cause: e });
  }
  // mcp-tool
  return new MCPToolError(e?.message || 'MCP tool error', { ...meta, retryable: false }, { cause: e });
}

/* ---------- Tool Parallelization ---------- */

/**
 * Determines if a set of tool calls can be safely executed in parallel.
 * Conservative approach: only parallelize when it's obviously safe.
 * 
 * Safe conditions (ALL must be true):
 * 1. All calls are to the SAME tool
 * 2. All calls operate on DIFFERENT resources (different IDs)
 * 3. All arguments are different (no duplicate operations)
 */
function canSafelyParallelize(toolCalls: any[]): boolean {
  if (toolCalls.length <= 1) return false;
  
  // Condition 1: All same tool name
  const toolNames = toolCalls.map(c => c?.name).filter(Boolean);
  if (toolNames.length !== toolCalls.length) return false; // Some missing names
  
  const uniqueTools = new Set(toolNames);
  if (uniqueTools.size !== 1) return false; // Different tools
  
  // Condition 2: Extract resource IDs using pattern matching
  const getResourceId = (args: any): string | undefined => {
    if (!args || typeof args !== 'object') return undefined;
    
    // Find any parameter ending with 'id' (case-insensitive) or exactly named 'id'
    for (const key in args) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'id' || lowerKey.endsWith('id')) {
        const value = args[key];
        // Return the ID if it's a non-empty string or number
        if (value !== undefined && value !== null && value !== '') {
          return String(value);
        }
      }
    }
    
    return undefined;
  };
  
  const resourceIds = toolCalls.map(c => getResourceId(c?.arguments));
  
  // All must have resource IDs
  if (!resourceIds.every(id => id !== undefined && id !== null && id !== '')) {
    return false;
  }
  
  // All must be different (no duplicate resources)
  const uniqueIds = new Set(resourceIds);
  if (uniqueIds.size !== resourceIds.length) return false; // Duplicate IDs
  
  // Condition 3: All arguments must be different
  const argStrings = toolCalls.map(c => JSON.stringify(c?.arguments || {}));
  const uniqueArgs = new Set(argStrings);
  if (uniqueArgs.size !== argStrings.length) return false; // Duplicate operations
  
  return true; // Safe to parallelize
}

/* ---------- MCP (Streamable HTTP) ---------- */
export type MCPAuthConfig = {
  type: 'oauth' | 'bearer';
  token?: string;           // For bearer auth: direct token
  clientId?: string;        // For OAuth: client credentials
  clientSecret?: string;
  tokenEndpoint?: string;   // OAuth token endpoint (for OAuth)
  scope?: string;           // OAuth scope (optional, some servers require it)
  refreshToken?: string;    // For OAuth: refresh token to automatically renew expired access tokens
};

export type MCPHandle = { 
  listTools: () => Promise<{ tools: Array<{ name: string; description?: string; inputSchema?: any }> }>;
  callTool: (name: string, args: Record<string, any>) => Promise<any>;
  id: string; 
  url: string; 
  auth?: MCPAuthConfig;
  transport?: 'http' | 'stdio';
  process?: ChildProcess;
  cleanup?: () => Promise<void>;
};

export type MCPStdioConfig = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
};

/**
 * Connect to an MCP (Model Context Protocol) server via HTTP.
 * Supports connection pooling, OAuth/Bearer authentication, and automatic reconnection.
 * 
 * @param url - HTTP endpoint URL for the MCP server (e.g., "http://localhost:3000/mcp")
 * @param options - Optional authentication configuration (OAuth 2.1 or Bearer token)
 * @returns MCPHandle for listing and calling tools
 * 
 * @example
 * // Basic usage
 * const weather = mcp("http://localhost:3000/mcp");
 * const tools = await weather.listTools();
 * const forecast = await weather.callTool("get_forecast", { city: "San Francisco" });
 * 
 * @example
 * // With OAuth authentication
 * const github = mcp("https://api.github.com/mcp", {
 *   auth: {
 *     type: 'oauth',
 *     clientId: process.env.GITHUB_CLIENT_ID!,
 *     clientSecret: process.env.GITHUB_SECRET!,
 *     tokenUrl: 'https://github.com/login/oauth/access_token'
 *   }
 * });
 */
export function mcp(url: string, options?: { auth?: MCPAuthConfig }): MCPHandle {
  // Use hash-based ID to keep tool names under OpenAI's 64-char limit
  // Tool names are: ${id}.${toolName}, so short ID = more room for tool names
  const hash = createHash('md5').update(url).digest('hex').substring(0, 8);
  const id = `mcp_${hash}`; // e.g., "mcp_f3c8a9b1" (12 chars, deterministic)
  
  return { 
    id, 
    url, 
    auth: options?.auth,
    transport: 'http',
    listTools: async () => {
      return withMCP({ id, url, auth: options?.auth, transport: 'http' } as MCPHandle, (c) => c.listTools());
    },
    callTool: async (name, args) => {
      return withMCP({ id, url, auth: options?.auth, transport: 'http' } as MCPHandle, (c) => c.callTool({ name, arguments: args }));
    }
  };
}

/**
 * Connect to an MCP (Model Context Protocol) server via stdio.
 * Spawns a child process to run the MCP server and communicates via stdin/stdout.
 * 
 * @param config - Configuration for the stdio MCP server
 * @returns MCPHandle for listing and calling tools, plus cleanup function
 * 
 * @example
 * // Basic usage
 * const aha = mcpStdio({
 *   command: "node",
 *   args: ["dist/index.js"],
 *   cwd: "/path/to/aha-mcp"
 * });
 * 
 * @example
 * // With environment variables
 * const aha = mcpStdio({
 *   command: "npx",
 *   args: ["-y", "@aha-develop/aha-mcp"],
 *   env: {
 *     AHA_DOMAIN: "yourcompany.aha.io",
 *     AHA_API_KEY: process.env.AHA_API_KEY!
 *   }
 * });
 * 
 * // Remember to cleanup when done
 * await aha.cleanup?.();
 */
export function mcpStdio(config: MCPStdioConfig): MCPHandle {
  const hash = createHash('md5')
    .update(`${config.command}:${config.args?.join(':')}:${config.cwd || ''}`)
    .digest('hex')
    .substring(0, 8);
  const id = `mcp_${hash}`;
  
  // Unique identifier for this stdio server
  const stdioKey = `stdio:${id}`;
  
  const handle: MCPHandle = {
    id,
    url: stdioKey,
    transport: 'stdio',
    listTools: async () => {
      return withMCPStdio(handle, config, (c) => c.listTools());
    },
    callTool: async (name, args) => {
      return withMCPStdio(handle, config, (c) => c.callTool({ name, arguments: args }));
    },
    cleanup: async () => {
      await cleanupStdioServer(stdioKey);
      STDIO_CONFIGS.delete(stdioKey);
    }
  };
  
  // Register the config so discoverTools can use it
  registerStdioConfig(handle, config);
  
  return handle;
}

// Ajv validator instance
const ajv = new Ajv({ allErrors: true, strict: false });
const VALIDATOR_CACHE = new WeakMap<object, any>();
function validateWithSchema(schema: any | undefined, args: any, context: string) {
  if (!schema || typeof schema !== 'object') return; // nothing to validate
  let validate = VALIDATOR_CACHE.get(schema);
  if (!validate) {
    validate = ajv.compile(schema);
    VALIDATOR_CACHE.set(schema, validate);
  }
  const ok = validate(args);
  if (!ok) {
    const msg = (validate.errors || []).map((e: any) => `${e.instancePath || e.schemaPath}: ${e.message}`).join('; ');
    throw new Error(`${context} arguments failed schema validation: ${msg}`);
  }
}
export function __internal_validateToolArgs(schema: any, args: any) { validateWithSchema(schema, args, 'test'); }

type MCPPoolEntry = {
  client: MCPClient;
  transport: StreamableHTTPClientTransport;
  lastUsed: number;
  busyCount: number;
  auth?: MCPAuthConfig;
};

type MCPStdioPoolEntry = {
  client: MCPClient;
  transport: StdioClientTransport;
  process: ChildProcess;
  lastUsed: number;
  busyCount: number;
  config: MCPStdioConfig;
};

const MCP_POOL = new Map<string, MCPPoolEntry>();
const MCP_STDIO_POOL = new Map<string, MCPStdioPoolEntry>();
let MCP_POOL_MAX = CONSTANTS.DEFAULT_MCP_POOL_MAX_SIZE;
let MCP_POOL_IDLE_MS = CONSTANTS.DEFAULT_MCP_POOL_IDLE_MS;

// OAuth token cache: endpoint -> { token, expiresAt }
type TokenCacheEntry = { token: string; expiresAt: number };
const OAUTH_TOKEN_CACHE = new Map<string, TokenCacheEntry>();

async function getOAuthToken(auth: MCPAuthConfig, endpoint: string): Promise<string> {
  const cached = OAUTH_TOKEN_CACHE.get(endpoint);
  if (cached && cached.expiresAt > Date.now() + CONSTANTS.OAUTH_TOKEN_EXPIRY_BUFFER_MS) {
    return cached.token;
  }
  
  if (!auth.tokenEndpoint) {
    throw new Error(`OAuth auth requires tokenEndpoint`);
  }
  
  let params: URLSearchParams;
  
  if (auth.refreshToken) {
    params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: auth.refreshToken,
      client_id: auth.clientId || '',
      client_secret: auth.clientSecret || ''
    });
  } else {
    if (!auth.clientId || !auth.clientSecret) {
      throw new Error(`OAuth auth requires clientId and clientSecret`);
    }
    
    params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: auth.clientId,
      client_secret: auth.clientSecret
    });
    
    if (auth.scope) {
      params.set('scope', auth.scope);
    }
  }
  
  const response = await fetch(auth.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OAuth token ${auth.refreshToken ? 'refresh' : 'acquisition'} failed: ${response.status} ${errorText}`);
  }
  
  const data = await response.json();
  const token = data.access_token;
  const expiresIn = data.expires_in || 3600;
  
  OAUTH_TOKEN_CACHE.set(endpoint, {
    token,
    expiresAt: Date.now() + (expiresIn * 1000)
  });
  
  return token;
}


async function getPooledClient(url: string, auth?: MCPAuthConfig): Promise<MCPPoolEntry> {
  const poolKey = auth ? `${url}::auth` : url; // Separate pool entries for auth vs non-auth
  let entry = MCP_POOL.get(poolKey);
  
  if (entry) {
    // Reusing existing connection - just update metadata
    entry.busyCount++;
    entry.lastUsed = Date.now();
    return entry;
  }
  
  // No existing connection - create new one
  // Evict LRU idle if over max
  if (MCP_POOL.size >= MCP_POOL_MAX) {
    const idleEntries = Array.from(MCP_POOL.entries()).filter(([, e]) => e.busyCount === 0);
    idleEntries.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    const toEvict = idleEntries.slice(0, Math.max(0, MCP_POOL.size - MCP_POOL_MAX + 1));
    for (const [k, e] of toEvict) {
      try { 
        await e.client.close();
        if (e.transport && typeof e.transport.close === 'function') {
          await e.transport.close();
        }
      } catch {}
      MCP_POOL.delete(k);
    }
  }
  
  // Create transport
  const transport = new StreamableHTTPClientTransport(new URL(url));
  
  const client = new MCPClient({ name: "volcano-agent-sdk", version: "0.0.1" });
  
  // Connect with auth if needed
  if (auth) {
    await connectWithAuth(transport, client, auth, url);
  } else {
    await client.connect(transport);
  }
  
  entry = { client, transport, lastUsed: Date.now(), busyCount: 1, auth };
  MCP_POOL.set(poolKey, entry);
  return entry;
}

async function connectWithAuth(transport: any, client: MCPClient, auth: MCPAuthConfig, endpoint: string) {
  const getAuthHeaders = async () => {
    const headers: Record<string, string> = {};
    
    if (auth.type === 'oauth') {
      const token = await getOAuthToken(auth, endpoint);
      headers['Authorization'] = `Bearer ${token}`;
    } else if (auth.type === 'bearer') {
      if (auth.refreshToken && auth.tokenEndpoint) {
        const token = await getOAuthToken(auth, endpoint);
        headers['Authorization'] = `Bearer ${token}`;
      } else if (auth.token) {
        headers['Authorization'] = `Bearer ${auth.token}`;
      }
    }
    
    return headers;
  };
  
  const authHeaders = await getAuthHeaders();
  
  const originalFetch = global.fetch;
  global.fetch = async (url: any, init: any = {}) => {
    let mergedHeaders: any = {};
    if (init.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((value: string, key: string) => {
          mergedHeaders[key] = value;
        });
      } else {
        mergedHeaders = { ...init.headers };
      }
    }
    Object.assign(mergedHeaders, authHeaders);
    
    return originalFetch(url, {
      ...init,
      headers: mergedHeaders
    });
  };
  
  try {
    await client.connect(transport);
  } finally {
    global.fetch = originalFetch;
  }
}


async function cleanupIdlePool() {
  const now = Date.now();
  for (const [url, entry] of MCP_POOL) {
    if (entry.busyCount === 0 && now - entry.lastUsed > MCP_POOL_IDLE_MS) {
      try { await entry.client.close(); } catch {}
      MCP_POOL.delete(url);
    }
  }
  // Also cleanup stdio servers
  for (const [key, entry] of MCP_STDIO_POOL) {
    if (entry.busyCount === 0 && now - entry.lastUsed > MCP_POOL_IDLE_MS) {
      try { 
        await entry.client.close(); 
        entry.process.kill();
      } catch {}
      MCP_STDIO_POOL.delete(key);
    }
  }
}

// Periodic cleanup
let POOL_SWEEPER: any = undefined;
function ensurePoolSweeper() {
  // Don't start sweeper in test mode to avoid closing connections during tests
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return;
  }
  
  if (!POOL_SWEEPER) {
    POOL_SWEEPER = setInterval(() => { cleanupIdlePool(); }, CONSTANTS.DEFAULT_MCP_POOL_SWEEP_INTERVAL_MS);
    // In tests or short-lived processes we don't need to keep the event loop alive
    if (typeof POOL_SWEEPER.unref === 'function') POOL_SWEEPER.unref();
  }
}

// Stdio MCP server management
async function getPooledStdioClient(key: string, config: MCPStdioConfig): Promise<MCPStdioPoolEntry> {
  let entry = MCP_STDIO_POOL.get(key);
  if (!entry) {
    // Spawn the process with merged environment variables
    const env = {
      ...process.env,
      ...config.env
    };
    
    const childProcess = spawn(config.command, config.args || [], {
      cwd: config.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Handle process errors
    childProcess.on('error', (err) => {
      console.error(`MCP stdio process error: ${err.message}`);
    });
    
    // Create stdio transport
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env
    });
    
    const client = new MCPClient({ name: "volcano-agent-sdk", version: "0.0.1" });
    
    // Connect to the spawned process
    await client.connect(transport);
    
    entry = { 
      client, 
      transport, 
      process: childProcess, 
      lastUsed: Date.now(), 
      busyCount: 0,
      config 
    };
    MCP_STDIO_POOL.set(key, entry);
  }
  entry.busyCount++;
  entry.lastUsed = Date.now();
  return entry;
}

async function cleanupStdioServer(key: string) {
  const entry = MCP_STDIO_POOL.get(key);
  if (entry) {
    try {
      await entry.client.close();
      entry.process.kill();
    } catch (err) {
      console.error(`Error cleaning up stdio server: ${err}`);
    }
    MCP_STDIO_POOL.delete(key);
  }
}

async function withMCPStdio<T>(h: MCPHandle, config: MCPStdioConfig, fn: (c: MCPClient) => Promise<T>, telemetry?: any, operation?: string): Promise<T> {
  ensurePoolSweeper();
  const entry = await getPooledStdioClient(h.url, config);
  
  // Start MCP span if telemetry configured
  const mcpSpan = telemetry && operation ? telemetry.startMCPSpan(null, h, operation) : null;
  
  try {
    const result = await fn(entry.client);
    
    telemetry?.endSpan(mcpSpan);
    telemetry?.recordMetric('mcp.call', 1, { endpoint: h.url, error: false });
    
    return result;
  } catch (error) {
    telemetry?.endSpan(mcpSpan, undefined, error);
    telemetry?.recordMetric('mcp.call', 1, { endpoint: h.url, error: true });
    throw error;
  } finally {
    entry.busyCount = Math.max(0, entry.busyCount - 1);
    entry.lastUsed = Date.now();
  }
}

// Store stdio configs for handles that need them
const STDIO_CONFIGS = new Map<string, MCPStdioConfig>();

function registerStdioConfig(handle: MCPHandle, config: MCPStdioConfig) {
  STDIO_CONFIGS.set(handle.url, config);
}

function getStdioConfig(handle: MCPHandle): MCPStdioConfig | undefined {
  return STDIO_CONFIGS.get(handle.url);
}

// Helper to route to the correct withMCP variant based on transport
async function withMCPAny<T>(
  handle: MCPHandle, 
  fn: (c: MCPClient) => Promise<T>, 
  telemetry?: any, 
  operation?: string
): Promise<T> {
  if (handle.transport === 'stdio') {
    const config = getStdioConfig(handle);
    if (!config) {
      throw new Error(`Stdio config not found for handle ${handle.id}`);
    }
    return withMCPStdio(handle, config, fn, telemetry, operation);
  } else {
    return withMCP(handle, fn, telemetry, operation);
  }
}

// Internal test helpers
export function __internal_getMcpPoolStats() {
  return {
    size: MCP_POOL.size,
    entries: Array.from(MCP_POOL.entries()).map(([url, e]) => ({ url, busyCount: e.busyCount, lastUsed: e.lastUsed }))
  };
}
export async function __internal_forcePoolCleanup() { await cleanupIdlePool(); }
export async function __internal_clearAllPools() {
  // Close all HTTP MCP connections
  for (const [, entry] of MCP_POOL) {
    try { await entry.client.close(); } catch {}
  }
  MCP_POOL.clear();
  
  // Close all stdio MCP connections
  for (const [, entry] of MCP_STDIO_POOL) {
    try { 
      await entry.client.close();
      entry.process.kill();
    } catch {}
  }
  MCP_STDIO_POOL.clear();
}
export function __internal_setPoolConfig(max: number, idleMs: number) { MCP_POOL_MAX = max; MCP_POOL_IDLE_MS = idleMs; }
export function __internal_clearOAuthTokenCache() { OAUTH_TOKEN_CACHE.clear(); }
export function __internal_getOAuthTokenCache() { 
  return Array.from(OAUTH_TOKEN_CACHE.entries()).map(([endpoint, entry]) => ({ 
    endpoint, 
    token: entry.token, 
    expiresAt: entry.expiresAt 
  })); 
}

async function withMCP<T>(h: MCPHandle, fn: (c: MCPClient) => Promise<T>, telemetry?: any, operation?: string): Promise<T> {
  ensurePoolSweeper();
  const poolKey = h.auth ? `${h.url}::auth` : h.url;
  const entry = await getPooledClient(h.url, h.auth);
  
  // Start MCP span if telemetry configured
  const mcpSpan = telemetry && operation ? telemetry.startMCPSpan(null, h, operation) : null;
  
  try {
    let result: T;
    // Always wrap with auth if configured (for both connect and tool calls)
    if (h.auth || entry.auth) {
      const authConfig = h.auth || entry.auth!;
      result = await executeWithAuth(authConfig, h.url, () => fn(entry.client));
    } else {
      result = await fn(entry.client);
    }
    
    telemetry?.endSpan(mcpSpan);
    telemetry?.recordMetric('mcp.call', 1, { endpoint: h.url, error: false });
    
    return result;
  } catch (error) {
    telemetry?.endSpan(mcpSpan, undefined, error);
    telemetry?.recordMetric('mcp.call', 1, { endpoint: h.url, error: true });
    throw error;
  } finally { 
    const e = MCP_POOL.get(poolKey);
    if (e) {
      e.busyCount = Math.max(0, e.busyCount - 1);
      e.lastUsed = Date.now();
    }
  }
}

async function executeWithAuth<T>(auth: MCPAuthConfig, endpoint: string, fn: () => Promise<T>): Promise<T> {
  const getAuthHeaders = async () => {
    const headers: Record<string, string> = {};
    
    if (auth.type === 'oauth') {
      const token = await getOAuthToken(auth, endpoint);
      headers['Authorization'] = `Bearer ${token}`;
    } else if (auth.type === 'bearer') {
      if (auth.refreshToken && auth.tokenEndpoint) {
        const token = await getOAuthToken(auth, endpoint);
        headers['Authorization'] = `Bearer ${token}`;
      } else if (auth.token) {
        headers['Authorization'] = `Bearer ${auth.token}`;
      }
    }
    
    return headers;
  };
  
  let authHeaders = await getAuthHeaders();
  
  const originalFetch = global.fetch;
  global.fetch = async (url: any, init: any = {}) => {
    let mergedHeaders: any = {};
    if (init.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((value: string, key: string) => {
          mergedHeaders[key] = value;
        });
      } else {
        mergedHeaders = { ...init.headers };
      }
    }
    Object.assign(mergedHeaders, authHeaders);
    
    const response = await originalFetch(url, {
      ...init,
      headers: mergedHeaders
    });
    
    if (response.status === 401 && auth.refreshToken && auth.tokenEndpoint) {
      OAUTH_TOKEN_CACHE.delete(endpoint);
      authHeaders = await getAuthHeaders();
      
      Object.assign(mergedHeaders, authHeaders);
      return await originalFetch(url, {
        ...init,
        headers: mergedHeaders
      });
    }
    
    return response;
  };
  
  try {
    return await fn();
  } finally {
    global.fetch = originalFetch;
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label = 'Step'): Promise<T> {
  let timer: any;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Tool discovery cache for automatic selection
const TOOL_CACHE = new Map<string, { tools: ToolDefinition[]; ts: number }>();
let TOOL_CACHE_TTL_MS = CONSTANTS.DEFAULT_TOOL_CACHE_TTL_MS;

/**
 * Discover all available tools from one or more MCP servers.
 * Results are cached for 60 seconds to improve performance.
 * 
 * @param handles - Array of MCP handles to query for tools
 * @returns Combined array of all available tools from all servers
 * 
 * @example
 * const weather = mcp("http://localhost:3000/mcp");
 * const calendar = mcp("http://localhost:4000/mcp");
 * const tools = await discoverTools([weather, calendar]);
 * console.log(tools.map(t => t.name)); // ["get_forecast", "create_event", ...]
 */
export async function discoverTools(handles: MCPHandle[]): Promise<ToolDefinition[]> {
  const allTools: ToolDefinition[] = [];
  
  for (const handle of handles) {
    try {
      const cached = TOOL_CACHE.get(handle.url);
      if (cached && (Date.now() - cached.ts) < TOOL_CACHE_TTL_MS) {
        // reuse cached with endpoint-specific names
        allTools.push(...cached.tools);
        continue;
      }
      
      const fetchFn = async (client: MCPClient) => {
        const result = await client.listTools();
        const mapped = result.tools.map(tool => ({
          name: `${handle.id}.${tool.name}`,
          description: tool.description || `Tool: ${tool.name}`,
          parameters: tool.inputSchema || { type: "object", properties: {} },
          mcpHandle: handle,
        }));
        TOOL_CACHE.set(handle.url, { tools: mapped, ts: Date.now() });
        return mapped;
      };
      
      let tools: ToolDefinition[];
      if (handle.transport === 'stdio') {
        const config = getStdioConfig(handle);
        if (!config) {
          throw new Error(`Stdio config not found for handle ${handle.id}`);
        }
        tools = await withMCPStdio(handle, config, fetchFn);
      } else {
        tools = await withMCP(handle, fetchFn);
      }
      
      allTools.push(...tools);
    } catch (error) {
      // Invalidate cache on failure
      TOOL_CACHE.delete(handle.url);
      // Fail fast - throw connection error
      throw normalizeError(error, 'mcp-conn', { 
        provider: classifyProviderFromMcp(handle),
        retryable: true  // Connection errors are retryable
      });
    }
  }
  
  return allTools;
}

export function __internal_clearDiscoveryCache() { TOOL_CACHE.clear(); }
export function __internal_setDiscoveryTtl(ms: number) { TOOL_CACHE_TTL_MS = ms; }
export function __internal_primeDiscoveryCache(handle: MCPHandle, rawTools: Array<{ name: string; inputSchema?: any; description?: string }>) {
  const tools: ToolDefinition[] = rawTools.map(t => ({
    name: `${handle.id}.${t.name}`,
    description: t.description || `Tool: ${t.name}`,
    parameters: t.inputSchema || { type: 'object', properties: {} },
    mcpHandle: handle,
  }));
  TOOL_CACHE.set(handle.url, { tools, ts: Date.now() });
}

// helper to fetch tool schema for explicit calls
async function getToolSchema(handle: MCPHandle, toolName: string): Promise<any | undefined> {
  const cached = TOOL_CACHE.get(handle.url);
  if (cached) {
    const found = cached.tools.find(t => t.name === `${handle.id}.${toolName}`);
    return found?.parameters;
  }
  try {
    const fetchFn = async (client: MCPClient) => {
      const result = await client.listTools();
      const mapped = result.tools.map(tool => ({
        name: `${handle.id}.${tool.name}`,
        description: tool.description || `Tool: ${tool.name}`,
        parameters: tool.inputSchema || { type: 'object', properties: {} },
        mcpHandle: handle,
      }));
      TOOL_CACHE.set(handle.url, { tools: mapped, ts: Date.now() });
      return mapped;
    };
    
    let tools: ToolDefinition[];
    if (handle.transport === 'stdio') {
      const config = getStdioConfig(handle);
      if (!config) {
        throw new Error(`Stdio config not found for handle ${handle.id}`);
      }
      tools = await withMCPStdio(handle, config, fetchFn);
    } else {
      tools = await withMCP(handle, fetchFn);
    }
    
    const found = tools.find(t => t.name === `${handle.id}.${toolName}`);
    return found?.parameters;
  } catch {
    return undefined;
  }
}

/* ---------- Agent chain ---------- */
export type RetryConfig = {
  delay?: number;      // seconds to wait before each retry (mutually exclusive with backoff)
  backoff?: number;    // exponential factor, waits 1s, factor^n each retry
  retries?: number;    // total attempts including the first one; default 3
};

/**
 * Metadata provided to run-level onToken callback.
 * Allows conditional processing based on whether step-level handler already processed the token.
 * 
 * @property stepIndex - Index of the current step (0-based)
 * @property handledByStep - True if step-level onToken handled this token. Use this to avoid double-processing.
 * @property stepPrompt - The prompt for this step (useful for conditional formatting)
 * @property llmProvider - The LLM provider ID (e.g., "OpenAI-gpt-4o-mini", "Anthropic-claude-3")
 * 
 * @example
 * .run({
 *   onToken: (token, meta) => {
 *     if (!meta.handledByStep) {
 *       // Only process if step didn't handle it
 *       res.write(`data: ${token}\n\n`);
 *     }
 *     // Always log analytics
 *     analytics.track(token, meta.stepIndex);
 *   }
 * })
 */
export type TokenMetadata = {
  stepIndex: number;
  handledByStep: boolean;
  stepPrompt?: string;
  llmProvider?: string;
};

/**
 * Options for the run() method.
 * Supports both token-level and step-level callbacks for maximum flexibility.
 * 
 * @property onToken - Called for each token as it arrives (with metadata). 
 *                     Step-level onToken takes precedence - when a step has its own onToken,
 *                     this callback won't receive tokens from that step (meta.handledByStep will be true).
 * @property onStep - Called when each step completes. Equivalent to the callback in run(callback).
 * 
 * @example
 * // Both token and step callbacks
 * .run({
 *   onToken: (token, meta) => {
 *     console.log(`Token from step ${meta.stepIndex}: ${token}`);
 *   },
 *   onStep: (step, index) => {
 *     console.log(`Step ${index} complete: ${step.durationMs}ms`);
 *   }
 * })
 * 
 * @example
 * // Backward compatible: just a callback
 * .run((step, index) => {
 *   console.log(`Step ${index} done`);
 * })
 */
export type StreamOptions = {
  onToken?: (token: string, meta: TokenMetadata) => void;
  onStep?: (step: StepResult, stepIndex: number) => void;
};

export type Step =
  | { prompt: string; name?: string; llm?: LLMHandle; instructions?: string; timeout?: number; retry?: RetryConfig; contextMaxChars?: number; contextMaxToolResults?: number; pre?: () => void; post?: () => void; onToken?: (token: string) => void }
  | { mcp: MCPHandle; name?: string; tool: string; args?: Record<string, any>; timeout?: number; retry?: RetryConfig; contextMaxChars?: number; contextMaxToolResults?: number; pre?: () => void; post?: () => void; onToolCall?: (toolName: string, args: any, result: any) => void }
  | { prompt: string; name?: string; llm?: LLMHandle; mcp: MCPHandle; tool: string; args?: Record<string, any>; instructions?: string; timeout?: number; retry?: RetryConfig; contextMaxChars?: number; contextMaxToolResults?: number; pre?: () => void; post?: () => void; onToolCall?: (toolName: string, args: any, result: any) => void }
  | { prompt: string; name?: string; llm?: LLMHandle; mcps: MCPHandle[]; instructions?: string; timeout?: number; retry?: RetryConfig; contextMaxChars?: number; contextMaxToolResults?: number; maxToolIterations?: number; pre?: () => void; post?: () => void; onToken?: (token: string) => void; onToolCall?: (toolName: string, args: any, result: any) => void }
  | { prompt: string; name?: string; llm?: LLMHandle; agents: AgentBuilder[]; instructions?: string; timeout?: number; retry?: RetryConfig; contextMaxChars?: number; contextMaxToolResults?: number; pre?: () => void; post?: () => void };

export type StepResult = {
  prompt?: string;
  llmOutput?: string;
  // Total wall time for this step (successful attempt) in milliseconds
  durationMs?: number;
  // Total LLM time spent during this step (sum across iterations) in milliseconds
  llmMs?: number;
  mcp?: { endpoint: string; tool: string; result: any; ms?: number };
  toolCalls?: Array<{ name: string; arguments?: Record<string, any>; endpoint: string; result: any } & { ms?: number }>;
  // Parallel execution results (for parallel steps)
  parallel?: Record<string, StepResult>;
  parallelResults?: StepResult[];
  // Aggregated metrics (populated on the final step of a run)
  totalDurationMs?: number;
  totalLlmMs?: number;
  totalMcpMs?: number;
};

// Internal metadata added to StepResult for tracking
interface StepResultInternal extends StepResult {
  __tokenCount?: number;
  __provider?: string;
  __crewTotalTokens?: number;
  agentCalls?: Array<{
    name: string;
    task: string;
    tokens: number;
    ms: number;
    result?: string;
  }>;
}

export interface AgentResults extends Array<StepResult> {
  ask(llm: LLMHandle, question: string): Promise<string>;
  summary(llm: LLMHandle): Promise<string>;
  toolsUsed(llm: LLMHandle): Promise<string>;
  errors(llm: LLMHandle): Promise<string>;
}

// Extended LLM handle with internal methods
interface LLMHandleInternal {
  id?: string;
  model: string;
  client: any;
  gen: (prompt: string) => Promise<string>;
  genWithTools: (prompt: string, tools: any[]) => Promise<any>;
  genStream?: (prompt: string) => AsyncGenerator<string, void, unknown>;
  getUsage?(): { total_tokens?: number; totalTokens?: number; prompt_tokens?: number; completion_tokens?: number } | undefined;
}

// Extended Step type with internal pattern properties (not actually extending Step to avoid union issues)
interface StepInternal {
  __parallel?: any;
  __branch?: { condition: (history: StepResult[]) => boolean; branches: any };
  __switch?: { selector: (history: StepResult[]) => string; cases: any };
  __while?: { condition: (history: StepResult[]) => boolean; body: any; opts?: any };
  __forEach?: { items: any[]; body: any };
  __retryUntil?: { body: any; successCondition: (result: StepResult) => boolean; opts?: any };
  __runAgent?: { subAgent: AgentBuilder };
  __hooks?: { pre?: () => void; post?: () => void };
  __reset?: boolean;
}

// Extended AgentBuilder with internal methods
interface AgentBuilderInternal extends AgentBuilder {
  _getOpts?(): AgentOptions;
  _getSteps?(): Step[];
  __isSubAgent?: boolean;
  __isExplicitSubAgent?: boolean;
  __parentAgentName?: string;
  __parentStepIndex?: number;
  __parentTotalSteps?: number;
  __parentContext?: StepResult[];
}

type StepFactory = (history: StepResult[]) => Step;

function enhanceResults(results: StepResult[]): AgentResults {
  const enhanced = results as AgentResults;
  
  const buildContext = (results: StepResult[]): string => {
    const context: string[] = [];
    
    // Track agent delegations from prompts
    const agentDelegations: { step: number; agentName: string; task: string }[] = [];
    
    results.forEach((step, idx) => {
      context.push(`Step ${idx + 1}:`);
      
      // Check if this step involved agent delegation
      if (step.prompt) {
        context.push(`  Prompt: ${step.prompt}`);
        
        // Check if LLM output contains agent delegation patterns
        if (step.llmOutput) {
          // Look for coordinator's USE agent pattern
          const useMatch = step.llmOutput.match(/USE\s+(\w+):\s*([^\n]+)/);
          if (useMatch) {
            agentDelegations.push({ 
              step: idx + 1, 
              agentName: useMatch[1], 
              task: useMatch[2].trim() 
            });
            context.push(`  Delegated to Agent: ${useMatch[1]}`);
            context.push(`  Delegation Task: ${useMatch[2].trim()}`);
          }
          
          // Check for completed agent delegations
          const delegationMatch = step.prompt.match(/Agent (\w+) was delegated: ([^\n]+)$/);
          if (delegationMatch) {
            context.push(`  Agent Used: ${delegationMatch[1]}`);
            context.push(`  Agent Task: ${delegationMatch[2]}`);
          }
        }
      }
      
      if (step.llmOutput) context.push(`  LLM Output: ${step.llmOutput}`);
      if (step.toolCalls && step.toolCalls.length > 0) {
        context.push(`  Tools Called (${step.toolCalls.length}):`);
        step.toolCalls.forEach(tc => {
          context.push(`    - ${tc.name}: ${JSON.stringify(tc.arguments || {})}`);
          context.push(`      Result: ${JSON.stringify(tc.result)}`);
        });
      }
      if (step.mcp) {
        context.push(`  MCP Tool: ${step.mcp.tool}`);
        context.push(`  Result: ${JSON.stringify(step.mcp.result)}`);
      }
      if (step.durationMs) context.push(`  Duration: ${step.durationMs}ms`);
      
      // Check for crew total tokens (indicates multi-agent coordination)
      const stepInternal = step as StepResultInternal;
      if (stepInternal.__crewTotalTokens) {
        context.push(`  Total Crew Tokens: ${stepInternal.__crewTotalTokens}`);
      }
      
      // Check for agent calls (multi-agent delegation results)
      if (stepInternal.agentCalls && stepInternal.agentCalls.length > 0) {
        context.push(`  Agents Used:`);
        stepInternal.agentCalls.forEach((call) => {
          context.push(`    - ${call.name}: ${call.task}`);
          context.push(`      Tokens: ${call.tokens}`);
          context.push(`      Duration: ${call.ms}ms`);
        });
      }
      
      context.push('');
    });
    
    // Add summary of agent delegations if any
    if (agentDelegations.length > 0) {
      context.push('\nAgent Delegation Summary:');
      agentDelegations.forEach(d => {
        context.push(`  - Step ${d.step}: ${d.agentName} agent (task: "${d.task}")`);
      });
      context.push('');
    }
    
    return context.join('\n');
  };
  
  enhanced.ask = async (llm: LLMHandle, question: string): Promise<string> => {
    const context = buildContext(results);
    const prompt = `You are analyzing the results of an AI agent workflow.

Agent Execution Results:
${context}

User Question: ${question}

Provide a clear, concise answer based on the execution results above. Be specific and reference actual data from the results.`;

    // Create dedicated progress tracker for ask() operation (suppress header)
    const tracker = new ProgressTracker('untitled', false, false, true);
    
    // Log ask init
    tracker.logEvent({
      agent: 'untitled',
      step: 'ask',
      status: 'init',
      message: `answering "${question}"`
    });
    
    const operationStart = Date.now();
    let tokenCount = 0;
    let output = '';
    
    try {
      if (typeof llm.genStream === 'function') {
        const tokens: string[] = [];
        for await (const token of llm.genStream(prompt)) {
          tokens.push(token);
          tokenCount++;
          tracker.updateTokens(tokenCount, getLLMProviderId(llm), 0);
        }
        output = tokens.join('');
      } else {
        output = await llm.gen(prompt);
      }
    } catch (e) {
      throw e;
    }
    
    const duration = Date.now() - operationStart;
    
    // Get token count from usage if available
    const llmInternal = llm as LLMHandleInternal;
    const rawUsage = llmInternal.getUsage?.();
    const usage = normalizeTokenUsage(rawUsage);
    const actualTokens = usage?.totalTokens || tokenCount;
    
    // Log ask complete
    tracker.ensureSpinnerStopped();
    tracker.logEvent({
      agent: 'untitled',
      step: 'ask',
      status: 'complete',
      message: `✔ Complete | ${tracker.formatMetrics({ tokens: actualTokens, toolCalls: 0, duration, provider: getLLMProviderId(llm) })}`
    });
    
    return output;
  };
  
  enhanced.summary = async (llm: LLMHandle): Promise<string> => {
    return await enhanced.ask(llm, "Provide a brief summary of what the agent accomplished. Include key metrics and outcomes.");
  };
  
  enhanced.toolsUsed = async (llm: LLMHandle): Promise<string> => {
    return await enhanced.ask(llm, "List all the tools that were called and briefly explain what each tool did.");
  };
  
  enhanced.errors = async (llm: LLMHandle): Promise<string> => {
    return await enhanced.ask(llm, "Were there any errors, failures, or issues? If so, explain them. If not, say 'No errors detected.'");
  };
  
  return enhanced;
}

// Agent builder interface for type safety
export interface AgentBuilder {
  name?: string;
  description?: string;
  _getSteps?(): Array<any>;  // Internal: for recursive step counting
  _getOpts?(): AgentOptions | undefined;  // Internal: for creating fresh instances
  resetHistory(): AgentBuilder;
  then(s: Step | StepFactory): AgentBuilder;
  parallel(stepsOrDict: Step[] | Record<string, Step>, hooks?: { pre?: () => void; post?: () => void }): AgentBuilder;
  branch(condition: (history: StepResult[]) => boolean, branches: { true: (agent: AgentBuilder) => AgentBuilder; false: (agent: AgentBuilder) => AgentBuilder }, hooks?: { pre?: () => void; post?: () => void }): AgentBuilder;
  switch<T = string>(selector: (history: StepResult[]) => T, cases: Record<string, (agent: AgentBuilder) => AgentBuilder> & { default?: (agent: AgentBuilder) => AgentBuilder }, hooks?: { pre?: () => void; post?: () => void }): AgentBuilder;
  while(condition: (history: StepResult[]) => boolean, body: (agent: AgentBuilder) => AgentBuilder, opts?: { maxIterations?: number; timeout?: number; pre?: () => void; post?: () => void }): AgentBuilder;
  forEach<T>(items: T[], body: (item: T, agent: AgentBuilder) => AgentBuilder, hooks?: { pre?: () => void; post?: () => void }): AgentBuilder;
  retryUntil(body: (agent: AgentBuilder) => AgentBuilder, successCondition: (result: StepResult) => boolean, opts?: { maxAttempts?: number; backoff?: number; pre?: () => void; post?: () => void }): AgentBuilder;
  runAgent(subAgent: AgentBuilder, hooks?: { pre?: () => void; post?: () => void }): AgentBuilder;
  run(optionsOrLog?: StreamOptions | ((s: StepResult, stepIndex: number) => void)): Promise<AgentResults>;
}

function safeExecuteHook(hook: (() => void) | undefined, hookName: string): void {
  if (!hook) return;
  try {
    hook();
  } catch (e) {
    console.warn(`${hookName} hook failed:`, e);
  }
}

function buildHistoryContextChunked(history: StepResult[], maxToolResults: number, maxChars: number): string {
  if (history.length === 0) return '';
  
  const chunks: string[] = [];
  
  // Make task context clear for delegated agents
  const delegatedTasks = history.filter(h => h.prompt?.includes('was delegated:'));
  if (delegatedTasks.length > 0) {
    chunks.push('\n=== CONTEXT FOR YOUR TASK ===\n');
    // Show the original task first
    const originalTask = history.find(h => h.prompt && !h.prompt.includes('was delegated:'));
    if (originalTask?.prompt) {
      chunks.push(`Overall goal: ${originalTask.prompt}\n\n`);
    }
    
    // Extract and show the specific delegated task
    const lastDelegation = delegatedTasks[delegatedTasks.length - 1];
    const taskMatch = lastDelegation.prompt?.match(/was delegated: (.+)$/);
    if (taskMatch) {
      chunks.push(`Your specific task: ${taskMatch[1]}\n`);
    }
    
    chunks.push('=== END CONTEXT ===\n\n');
  }
  
  // Include LLM outputs from all steps (not just last one)
  // This is important for subagents to see parent conversation history
  // contextMaxChars will truncate if this gets too long
  const llmOutputs: string[] = [];
  for (const step of history) {
    if (step.llmOutput) {
      llmOutputs.push(step.llmOutput);
    }
  }
  
  if (llmOutputs.length > 0) {
    if (llmOutputs.length === 1) {
    chunks.push('Previous LLM answer:\n');
      chunks.push(llmOutputs[0]);
    } else {
      chunks.push('Previous LLM answers:\n');
      llmOutputs.forEach((output, idx) => {
        chunks.push(`${idx + 1}. ${output}\n`);
      });
    }
    chunks.push('\n');
  }
  
  // Collect tool calls from ALL recent steps (not just last step)
  const allToolCalls: Array<{ name: string; arguments?: Record<string, any>; result: any }> = [];
  for (const step of history) {
    if (step.toolCalls && step.toolCalls.length > 0) {
      allToolCalls.push(...step.toolCalls);
    }
  }
  
  if (allToolCalls.length > 0) {
    chunks.push('Previous tool results:\n');
    // Take the most recent maxToolResults across ALL steps
    const recent = allToolCalls.slice(-maxToolResults);
    for (const t of recent) {
      chunks.push('- ');
      chunks.push(t.name);
      // Include arguments to preserve context like issue numbers, IDs, etc
      if (t.arguments) {
        try {
          chunks.push('(');
          chunks.push(JSON.stringify(t.arguments));
          chunks.push(')');
        } catch {
          // Skip if arguments can't be serialized
        }
      }
      chunks.push(' -> ');
      if (typeof t.result === 'string') {
        chunks.push(t.result);
      } else {
        try { chunks.push(JSON.stringify(t.result)); } catch { chunks.push('[unserializable]'); }
      }
      chunks.push('\n');
    }
  }
  
  // prefix header
  chunks.unshift('\n\n[Context from previous steps]\n');
  // assemble with maxChars cap
  let out = '';
  for (const c of chunks) {
    if (out.length + c.length > maxChars) break;
    out += c;
  }
  return out;
}

/**
 * Helper function to execute LLM generation with optional token streaming.
 * Handles both step-level and stream-level onToken callbacks with proper precedence.
 */
async function executeLLMWithStreaming(
  llm: LLMHandle,
  prompt: string,
  stepOnToken: ((token: string) => void) | undefined,
  streamOnToken: ((token: string, meta: TokenMetadata) => void) | undefined,
  meta: { stepIndex: number; stepPrompt?: string },
  progress?: ReturnType<typeof createProgressHandler> | null,
  progressTokenCallback?: () => void
): Promise<string> {
  const hasStepOnToken = !!stepOnToken;
  const hasStreamOnToken = !!streamOnToken;
  const hasUserCallback = hasStepOnToken || hasStreamOnToken;
  
  // Use streaming if we have any callback OR if genStream is available
  if (typeof llm.genStream === 'function' && (hasUserCallback || progressTokenCallback || progress)) {
    const tokens: string[] = [];
    const tokenMeta: TokenMetadata = {
      stepIndex: meta.stepIndex,
      handledByStep: hasStepOnToken,
      stepPrompt: meta.stepPrompt,
      llmProvider: (llm as LLMHandleInternal).id || llm.model
    };
    
    for await (const token of llm.genStream(prompt)) {
      tokens.push(token);
      
      // Call progress token counter
      if (progressTokenCallback) {
        progressTokenCallback();
      }
      
      
      // Call user callbacks
      try {
        if (hasStepOnToken) {
          stepOnToken!(token);
        } else if (hasStreamOnToken) {
          streamOnToken!(token, tokenMeta);
        }
      } catch (e) {
        console.warn('onToken callback failed:', e);
      }
    }
    return tokens.join('');
  } else {
    return await llm.gen(prompt);
  }
}



/**
 * Centralized Progress Tracker
 * Encapsulates all progress display logic with structured logging and ora spinners.
 */
class ProgressTracker {
  private workflowStart: number;
  private isTTY: boolean;
  private operationStart: number;
  private spinner: ReturnType<typeof ora> | null = null;
  private currentStepIndex = 0;
  private agentDisplayName: string;
  
  constructor(
    agentName?: string,
    private isSubAgent = false,
    private isExplicitSubAgent = false,
    private suppressHeader = false
  ) {
    this.workflowStart = Date.now();
    this.isTTY = process.stdout?.isTTY || false;
    this.operationStart = Date.now();
    this.agentDisplayName = agentName || 'untitled';
    
    if (!isSubAgent && !suppressHeader) {
      this.logEvent({
        agent: this.agentDisplayName,
        status: 'init',
        message: `🌋 running Volcano agent [volcano-agent-sdk v${CONSTANTS.VOLCANO_SDK_VERSION}] • docs at https://volcano.dev`
      });
    }
  }
  
  // Utility: Format ISO timestamp
  timestamp(): string {
    return new Date().toISOString();
  }
  
  // Utility: Format structured log line
  logLine(opts: {
    agent: string;
    step?: number | string;
    status: 'init' | 'complete' | 'coordinating';
    message: string;
  }): string {
    const timestamp = this.timestamp();
    const agentPart = ` agent="${opts.agent}"`;
    const stepPart = opts.step !== undefined ? ` step=${opts.step}` : '';
    const statusPart = ` status=${opts.status}`;
    
    return `[${timestamp}${agentPart}${stepPart}${statusPart}] ${opts.message}`;
  }
  
  // Utility: Clear spinner (if active) and print structured log
  logEvent(opts: {
    agent: string;
    step?: number | string;
    status: 'init' | 'complete' | 'coordinating';
    message: string;
  }): void {
    this.stopSpinner();
    console.log(this.logLine(opts));
  }

  // Utility: Format metrics message
  formatMetrics(opts: {
    tokens?: number;
    toolCalls?: number;
    duration: number;
    provider?: string;
  }): string {
    const parts: string[] = [];
    
    if (opts.tokens !== undefined) {
      parts.push(`${opts.tokens.toLocaleString()} token${opts.tokens !== 1 ? 's' : ''}`);
    }
    
    if (opts.toolCalls !== undefined) {
      parts.push(`${opts.toolCalls} tool call${opts.toolCalls !== 1 ? 's' : ''}`);
    }
    
    parts.push(`${(opts.duration / 1000).toFixed(1)}s`);
    
    if (opts.provider) {
      parts.push(opts.provider);
    }
    
    return parts.join(' | ');
  }
  
  // Stop and cleanup spinner  
  private stopSpinner(): void {
    if (this.spinner && this.spinner.isSpinning) {
      this.spinner.stop();
    }
    this.spinner = null;
  }
  
  // Start a new step
  stepStart(stepIndex: number, prompt?: string): void {
    this.currentStepIndex = stepIndex;
    
    this.logEvent({
      agent: this.agentDisplayName,
      step: stepIndex + 1,
      status: 'init',
      message: prompt || 'Processing'
    });
  }
  
  // Start LLM operation with spinner
  startLLM(): void {
    this.operationStart = Date.now();
    // Don't create spinner immediately - only create it when first token arrives
    // This prevents blank lines when operations complete quickly
  }
  
  // Update token progress
  updateTokens(count: number, provider?: string, toolCalls = 0): void {
    // Create spinner on first token if in TTY mode
    if (!this.spinner && this.isTTY && count === 1) {
      // Add blank line before spinner for visual separation
      this.spinner = ora({
        text: 'Waiting for LLM',
        stream: process.stdout,
        discardStdin: false,
        color: 'yellow'
      }).start();
    }
    
    if (!this.spinner) return;
    
    // Update every 10 tokens or on first token
      if (count % 10 === 0 || count === 1) {
      const elapsed = (Date.now() - this.operationStart) / 1000;
      const throughput = count > 0 ? Math.round(count / Math.max(elapsed, 0.1)) : 0;
      const metrics = `${count} tokens | ${throughput} tok/s | ${toolCalls} tool call${toolCalls !== 1 ? 's' : ''}`;
      
      this.spinner.text = provider ? `${metrics} | ${provider}` : metrics;
    }
  }
  
  // Complete a step
  stepComplete(opts: {
    duration: number;
    tokens?: number;
    provider?: string;
    toolCalls?: number;
  }): void {
    // Always show step complete logs (even for crew-delegated agents)
    this.stopSpinner();
    
    const metrics = this.formatMetrics({
      tokens: opts.tokens,
      toolCalls: opts.toolCalls,
      duration: opts.duration,
      provider: opts.provider
    });
    
    this.logEvent({
      agent: this.agentDisplayName,
      step: this.currentStepIndex + 1,
      status: 'complete',
      message: `✔ Complete | ${metrics}`
    });
  }
  
  // Agent delegation start
  agentDelegateStart(delegatedAgentName: string): void {
    this.logEvent({
      agent: this.agentDisplayName,
      status: 'coordinating',
      message: `🧠 delegating to "${delegatedAgentName}"`
    });
    
    this.operationStart = Date.now();
    // Don't create spinner immediately - will be created on first token update
  }
  
  // Agent delegation complete
  agentDelegateComplete(opts: {
    agentName: string;
    tokens: number;
    duration: number;
    provider?: string;
    toolCalls?: number;
  }): void {
    this.stopSpinner();
    
    const metrics = this.formatMetrics({
      tokens: opts.tokens,
      toolCalls: opts.toolCalls,
      duration: opts.duration,
      provider: opts.provider
    });
    
    this.logEvent({
      agent: opts.agentName,
      status: 'complete',
      message: `✔ Complete | ${metrics}`
    });
  }
  
  // Coordinator activity
  coordinatorActivity(message: string): void {
    this.logEvent({
      agent: this.agentDisplayName,
      status: 'init',
      message: `🧠 ${message}`
    });
  }
  
  // Coordinator complete
  coordinatorComplete(opts: {
    message: string;
    tokens: number;
    duration: number;
    provider?: string;
    toolCalls?: number;
  }): void {
    this.stopSpinner();
    
    const metrics = this.formatMetrics({
      tokens: opts.tokens,
      toolCalls: opts.toolCalls,
      duration: opts.duration,
      provider: opts.provider
    });
    
    this.logEvent({
      agent: this.agentDisplayName,
      status: 'complete',
      message: `🧠 ${opts.message} | ${metrics}`
    });
  }
  
  // Workflow end summary  
  workflowEnd(opts: {
    stepCount: number;
    totalTokens?: number;
    totalDuration?: number;
    models?: string[];
    totalToolCalls?: number;
  }): void {
    if (this.isSubAgent) return;
    
    if (opts.totalTokens && opts.models && opts.models.length > 0) {
      const modelsList = opts.models.join(', ');
      const metrics = this.formatMetrics({
        tokens: opts.totalTokens,
        toolCalls: opts.totalToolCalls,
        duration: opts.totalDuration || 0,
        provider: modelsList
      });
      this.logEvent({
        agent: this.agentDisplayName,
        status: 'complete',
        message: `🎉 agent complete | ${metrics}`
      });
      } else {
      const total = Date.now() - this.workflowStart;
      const metrics = this.formatMetrics({
        toolCalls: opts.totalToolCalls,
        duration: total
      });
      this.logEvent({
        agent: this.agentDisplayName,
        status: 'complete',
        message: `🎉 workflow complete | ${opts.stepCount} step${opts.stepCount > 1 ? 's' : ''} | ${metrics}`
      });
    }
  }
  
  // Ensure spinner is stopped (public utility for edge cases)
  ensureSpinnerStopped(): void {
    this.stopSpinner();
  }
  
  // Get current spinner (for coordinator use case)
  getSpinner(): ReturnType<typeof ora> | null {
    return this.spinner;
  }
  
  // Get operation start time
  getOperationStart(): number {
    return this.operationStart;
  }
}

/**
 * Create progress handler for workflows.
 * Factory function that creates a ProgressTracker with a compatible interface.
 */
function createProgressHandler(
  totalSteps: number, 
  isSubAgent = false, 
  isExplicitSubAgent = false, 
  parentStepIndex?: number, 
  parentTotalSteps?: number, 
  agentName?: string
) {
  const tracker = new ProgressTracker(agentName, isSubAgent, isExplicitSubAgent);
  
  return {
    stepStart: (stepIndex: number, prompt?: string) => {
      tracker.stepStart(stepIndex, prompt);
    },
    startLlmOperation: () => {
      tracker.startLLM();
    },
    llmToken: (count: number, provider?: string, toolCalls?: number) => {
      tracker.updateTokens(count, provider, toolCalls || 0);
    },
    getOperationStart: () => tracker.getOperationStart(),
    getSpinner: () => tracker.getSpinner(),
    agentStart: (delegatedAgentName: string) => {
      tracker.agentDelegateStart(delegatedAgentName);
    },
    agentToken: (count: number, provider?: string, toolCalls?: number) => {
      tracker.updateTokens(count, provider, toolCalls || 0);
    },
    agentComplete: (delegatedAgentName: string, tokens: number, durationMs: number, provider?: string, toolCalls?: number) => {
      tracker.agentDelegateComplete({
        agentName: delegatedAgentName,
        tokens,
        duration: durationMs,
        provider,
        toolCalls
      });
    },
    stepComplete: (opts: {
      duration: number;
      tokens?: number;
      provider?: string;
      toolCalls?: number;
    }) => {
      tracker.stepComplete(opts);
    },
    workflowEnd: (stepCount: number, totalTokens?: number, totalDuration?: number, models?: string[], totalToolCalls?: number) => {
      tracker.workflowEnd({
        stepCount,
        totalTokens,
        totalDuration,
        models,
        totalToolCalls
      });
    },
    // Expose coordinator methods
    coordinatorActivity: (message: string) => {
      tracker.coordinatorActivity(message);
    },
    coordinatorComplete: (opts: {
      message: string;
      tokens: number;
      duration: number;
      provider?: string;
      toolCalls?: number;
    }) => {
      tracker.coordinatorComplete(opts);
    },
    // Internal: Direct access to tracker for advanced use
    _tracker: tracker
  };
}

/**
 * Build agent context string for multi-agent coordination.
 */
function buildAgentContext(agents: AgentBuilder[]): string {
  const agentList = agents
    .filter(a => a.name && a.description)
    .map(a => {
      // Get the agent's steps if available to show what they'll do
      const agentInternal = a as AgentBuilderInternal;
      const steps = agentInternal._getSteps?.() || [];
      const stepDescriptions = steps
        .filter((s) => {
          const sInternal = s as StepInternal;
          return 'prompt' in s && !sInternal.__reset;
        })
        .map((s, i) => `    ${i + 1}) "${'prompt' in s ? s.prompt : ''}"`)
        .join('\n');
      
      const agentDesc = `- ${a.name}: "${a.description}"`;
      if (stepDescriptions) {
        return `${agentDesc}\n  This agent will:\n${stepDescriptions}`;
      }
      return agentDesc;
    })
    .join('\n');
  
  return `

You can coordinate work across the following agents:

${agentList}

Based on the agents described above, determine the execution flow to accurately bring the task to completion.

Instructions:
- Analyze the task and decide if you need help from an agent
- Be efficient: delegate to the right specialists, but don't over-delegate
- If you believe that an agent is not needed, then do not use it
- Don't call the same agent repeatedly unless they failed or you need different information
- Consider the overall goal and delegate to different agents based on what still needs to be done
- To delegate: respond with "USE [agent_name]: [specific task]"
- When you have the complete final answer: respond with "DONE: [your answer]"
- After a task is completed, you are in charge of delegation: if you think we need to delegate, EXPLICITLY say so, if you think we are done, then explicitly say so
- You can either delegate (USE ..) or be done (DONE ..), or execute the actual task that you have been instructed to do: there is no other option
`;
}

/**
 * Parse coordinator LLM response for agent delegation.
 */
function parseAgentDecision(response: string): 
  | { type: 'use_agent'; agentName: string; task: string }
  | { type: 'done'; answer: string }
  | { type: 'continue'; raw: string }
{
  const useMatch = response.match(/USE\s+(\w+):\s*(.+?)(?=\n(?:USE|DONE:)|$)/s);
  if (useMatch) {
    return {
      type: 'use_agent',
      agentName: useMatch[1].trim(),
      task: useMatch[2].trim()
    };
  }
  
  const doneMatch = response.match(/DONE:\s*(.+)/s);
  if (doneMatch) {
    return {
      type: 'done',
      answer: doneMatch[1].trim()
    };
  }
  
  return {
    type: 'continue',
    raw: response
  };
}

type AgentOptions = {
  llm?: LLMHandle;
  instructions?: string;
  name?: string;                       // Agent name for multi-agent coordination
  description?: string;                // Agent description for automatic selection
  hideProgress?: boolean;              // Disable beautiful TTY progress output (progress shown by default)
  timeout?: number;
  retry?: RetryConfig;
  // Context compaction options
  contextMaxChars?: number;            // soft cap for injected context size (default 4000)
  contextMaxToolResults?: number;      // number of recent tool results to include (default 3)
  // MCP authentication configuration per endpoint
  mcpAuth?: Record<string, MCPAuthConfig>;
  // OpenTelemetry observability (opt-in)
  telemetry?: import('./telemetry.js').VolcanoTelemetry;
  // Maximum tool calling iterations for automatic selection (default 4)
  maxToolIterations?: number;
  // Disable parallel tool execution (parallel execution is enabled by default for performance)
  disableParallelToolExecution?: boolean;
};

/**
 * Context interface for executeStepCore function
 */
interface StepExecutionContext {
  step: Step;
  stepIndex: number;
  defaultLlm?: LLMHandle;
  globalInstructions?: string;
  contextHistory: StepResult[];
  contextMaxToolResults: number;
  contextMaxChars: number;
  defaultMaxToolIterations: number;
  agentName?: string;
  applyAgentAuth: (handle: MCPHandle) => MCPHandle;
  telemetry?: import('./telemetry.js').VolcanoTelemetry;
  agentSpan: any;
  progress?: ReturnType<typeof createProgressHandler> | null;
  capturedStreamOnToken?: (token: string, meta: TokenMetadata) => void;
  onToolCall?: (toolName: string, args: any, result: any) => void;
  disableParallelToolExecution?: boolean;
}

/**
 * Shared pattern step execution logic for run() method.
 * Handles all 7 pattern types with hooks and proper result management.
 * 
 * @param raw - The pattern step definition
 * @param out - Current step results array (for computing indices)
 * @param contextHistory - Historical context
 * @param opts - Agent options for creating sub-agents
 * @param planned - Total planned steps (for runAgent context)
 * @returns Object with wasPattern flag and results array (empty if not a pattern)
 */
async function executePatternStep(
  raw: any,
  out: StepResult[],
  contextHistory: StepResult[],
  opts: AgentOptions | undefined,
  planned: any[],
  totalSteps: number
): Promise<{ wasPattern: boolean; results: StepResult[] }> {
  const stepInternal = raw as StepInternal;
  
  if (stepInternal.__parallel) {
    const hooks = stepInternal.__hooks;
    safeExecuteHook(hooks?.pre, 'Pre-parallel');
    
    const parallelResult = await executeParallel(
      stepInternal.__parallel,
      async (step: any) => {
        const subAgent = agent(opts).then(step);
        const results = await subAgent.run();
        return results[0];
      }
    );
    out.push(parallelResult);
    contextHistory.push(parallelResult);
    
    safeExecuteHook(hooks?.post, 'Post-parallel');
    return { wasPattern: true, results: [parallelResult] };
  }
  
  if (stepInternal.__branch) {
    const { condition, branches } = stepInternal.__branch;
    const hooks = stepInternal.__hooks;
    safeExecuteHook(hooks?.pre, 'Pre-branch');
    
    const branchResults = await executeBranch(condition, branches, out, () => agent(opts));
    out.push(...branchResults);
    contextHistory.push(...branchResults);
    
    safeExecuteHook(hooks?.post, 'Post-branch');
    return { wasPattern: true, results: branchResults };
  }
  
  if (stepInternal.__switch) {
    const { selector, cases } = stepInternal.__switch;
    const hooks = stepInternal.__hooks;
    safeExecuteHook(hooks?.pre, 'Pre-switch');
    
    const switchResults = await executeSwitch(selector, cases, out, () => agent(opts));
    out.push(...switchResults);
    contextHistory.push(...switchResults);
    
    safeExecuteHook(hooks?.post, 'Post-switch');
    return { wasPattern: true, results: switchResults };
  }
  
  if (stepInternal.__while) {
    const { condition, body, opts: whileOpts } = stepInternal.__while;
    safeExecuteHook(whileOpts?.pre, 'Pre-while');
    
    const whileResults = await executeWhile(condition, body, out, () => agent(opts), whileOpts);
    out.push(...whileResults);
    contextHistory.push(...whileResults);
    
    safeExecuteHook(whileOpts?.post, 'Post-while');
    return { wasPattern: true, results: whileResults };
  }
  
  if (stepInternal.__forEach) {
    const { items, body } = stepInternal.__forEach;
    const hooks = stepInternal.__hooks;
    safeExecuteHook(hooks?.pre, 'Pre-forEach');
    
    const forEachResults = await executeForEach(items, body, () => agent(opts));
    out.push(...forEachResults);
    contextHistory.push(...forEachResults);
    
    safeExecuteHook(hooks?.post, 'Post-forEach');
    return { wasPattern: true, results: forEachResults };
  }
  
  if (stepInternal.__retryUntil) {
    const { body, successCondition, opts: retryOpts } = stepInternal.__retryUntil;
    safeExecuteHook(retryOpts?.pre, 'Pre-retryUntil');
    
    const retryResults = await executeRetryUntil(body, successCondition, () => agent(opts), retryOpts);
    out.push(...retryResults);
    contextHistory.push(...retryResults);
    
    safeExecuteHook(retryOpts?.post, 'Post-retryUntil');
    return { wasPattern: true, results: retryResults };
  }
  
  if (stepInternal.__runAgent) {
    const { subAgent } = stepInternal.__runAgent;
    const hooks = stepInternal.__hooks;
    safeExecuteHook(hooks?.pre, 'Pre-runAgent');
    
    // Pass parent's context and total step count to subagent
    const subResults = await executeRunAgent(subAgent, out.length, totalSteps, contextHistory);
    out.push(...subResults);
    contextHistory.push(...subResults);
    
    safeExecuteHook(hooks?.post, 'Post-runAgent');
    return { wasPattern: true, results: subResults };
  }
  
  return { wasPattern: false, results: [] }; // Not a pattern step
}

/**
 * Shared retry logic with timeout, error classification, and exponential backoff.
 * Used by run() method to execute steps with retries.
 */
async function executeWithRetry(
  stepFn: () => Promise<StepResult>,
  stepId: number,
  config: {
    attemptsTotal: number;
    stepTimeoutMs: number;
    useDelay?: number;
    useBackoff?: number;
  }
): Promise<StepResult> {
  let lastError: any;
  let result: StepResult | undefined;
  
  for (let attempt = 1; attempt <= config.attemptsTotal; attempt++) {
    try {
      const r = await withTimeout(stepFn(), config.stepTimeoutMs, 'Step');
      result = r;
      break;
    } catch (e) {
      // classify
      const meta = { stepId } as VolcanoErrorMeta;
      let vErr: VolcanoError | undefined;
      if (e instanceof Error && /timed out/i.test(e.message)) {
        vErr = normalizeError(e, 'timeout', meta);
      } else if (e instanceof ValidationError || /failed schema validation/i.test(String((e as any)?.message || ''))) {
        vErr = normalizeError(e, 'validation', meta);
      } else {
        vErr = e as VolcanoError;
      }
      lastError = vErr || e;
      if (lastError instanceof VolcanoError && lastError.meta?.retryable === false) {
        throw lastError; // abort retries immediately for non-retryable errors
      }
      if (attempt >= config.attemptsTotal) break;
      // schedule wait according to policy
      if (typeof config.useBackoff === 'number' && config.useBackoff > 0) {
        const waitMs = CONSTANTS.DEFAULT_RETRY_BACKOFF_BASE_MS * Math.pow(config.useBackoff, attempt - 1);
        await sleep(waitMs);
      } else {
        const waitMs = Math.max(0, (config.useDelay ?? 0) * 1000);
        if (waitMs > 0) await sleep(waitMs);
      }
    }
  }
  
  if (!result) {
    throw (lastError instanceof VolcanoError ? lastError : new RetryExhaustedError('Retry attempts exhausted', { stepId }, { cause: lastError }));
  }
  
  return result;
}

/**
 * Core step execution logic for run() method.
 * Handles all 4 step types:
 * 1. Automatic tool selection (mcps + prompt)
 * 2. Automatic agent delegation (agents + prompt)
 * 3. LLM-only step (prompt without tools/agents)
 * 4. Explicit MCP tool call (mcp + tool)
 */
async function executeStepCore(ctx: StepExecutionContext): Promise<StepResult> {
  const { 
    step: s, 
    stepIndex,
    defaultLlm, 
    globalInstructions, 
    contextHistory, 
    contextMaxToolResults,
    contextMaxChars,
    defaultMaxToolIterations,
    agentName,
    applyAgentAuth,
    telemetry,
    agentSpan,
    progress,
    capturedStreamOnToken,
    onToolCall,
    disableParallelToolExecution
  } = ctx;

  safeExecuteHook('pre' in s ? s.pre : undefined, 'Pre-step');
  
  // Determine step type for telemetry
  let stepType = 'unknown';
  if ("agents" in s) stepType = 'agent_crew';
  else if ("mcps" in s) stepType = 'mcp_auto';
  else if ("mcp" in s) stepType = 'mcp_explicit';
  else if ("prompt" in s) stepType = 'llm';
  
  // Start step span
  const stepPrompt = 'prompt' in s ? s.prompt : undefined;
  const stepName = 'name' in s ? s.name : undefined;
  const stepLlm = ('llm' in s ? s.llm : undefined) || defaultLlm;
  const stepSpan = telemetry?.startStepSpan(agentSpan, stepIndex, stepType, stepPrompt, stepName, stepLlm) || null;
  
  const r: StepResult = {};
  const stepStart = Date.now();
  if (progress) progress.stepStart(stepIndex, stepPrompt);
  let llmTotalMs = 0;
  
  // Automatic tool selection: LLM chooses and calls MCP tools
  if ("mcps" in s && "prompt" in s) {
    const step = s as Extract<Step, { mcps: MCPHandle[]; prompt: string }>;
    
    const usedLlm = step.llm ?? defaultLlm;
    if (!usedLlm) throw new Error("No LLM provided. Pass { llm } to agent(...) or specify per-step.");
    const stepInstructions = step.instructions ?? globalInstructions;
    const maxToolResults = step.contextMaxToolResults ?? contextMaxToolResults;
    const maxContextChars = step.contextMaxChars ?? contextMaxChars;
    const promptWithHistory = step.prompt + buildHistoryContextChunked(contextHistory, maxToolResults, maxContextChars);
    r.prompt = step.prompt;
    // Apply agent-level auth to all MCP handles
    const mcpsWithAuth = step.mcps.map(applyAgentAuth);
    const availableTools = await discoverTools(mcpsWithAuth);
    if (availableTools.length === 0) {
      r.llmOutput = "No tools available for this request.";
    } else {
      const aggregated: Array<{ name: string; endpoint: string; result: any; ms?: number }> = [];
      let currentToolCallCount = 0;  // Track tool calls for real-time progress
      const maxIterations = step.maxToolIterations ?? defaultMaxToolIterations;
      let workingPrompt = (stepInstructions ? stepInstructions + "\n\n" : "") + promptWithHistory;
      for (let i = 0; i < maxIterations; i++) {
        const llmStart = Date.now();
        let toolPlan: LLMToolResult;
        
        // Progress updates happen via tool call counter display below
        
        try {
          toolPlan = await usedLlm.genWithTools(workingPrompt, availableTools);
        } catch (e) {
          const provider = classifyProviderFromLlm(usedLlm);
          throw normalizeError(e, 'llm', { stepId: stepIndex, provider });
        }
        const llmCallDuration = Date.now() - llmStart;
        llmTotalMs += llmCallDuration;
        
        telemetry?.recordMetric('llm.call', 1, { provider: getLLMProviderId(usedLlm), error: false });
        telemetry?.recordMetric('llm.duration', llmCallDuration, { provider: getLLMProviderId(usedLlm), model: usedLlm.model });
        
        const llmInternal = usedLlm as LLMHandleInternal;
        const usage = normalizeTokenUsage(llmInternal.getUsage?.());
        recordTokenMetrics(telemetry, usage, {
          provider: getLLMProviderId(usedLlm),
          model: usedLlm.model,
          agent_name: agentName
        });
        
        const rInternal = r as StepResultInternal;
        if (usage) {
          const totalTokens = (usage.inputTokens || 0) + (usage.outputTokens || 0);
          rInternal.__tokenCount = (rInternal.__tokenCount || 0) + totalTokens;
          rInternal.__provider = getLLMProviderId(usedLlm);
        }
        
        if (!toolPlan || !Array.isArray(toolPlan.toolCalls) || toolPlan.toolCalls.length === 0) {
          // finish with final content
          r.llmOutput = toolPlan?.content || r.llmOutput;
          break;
        }
        
        // Check if we can safely execute tools in parallel
        const canParallelize = !disableParallelToolExecution && canSafelyParallelize(toolPlan.toolCalls);
        let toolResultsAppend = "\n\n[Tool results]\n";
        
        if (canParallelize) {
          // PARALLEL EXECUTION: Execute all tools simultaneously
          telemetry?.recordMetric('tool.execution.parallel', 1, { count: toolPlan.toolCalls.length });
          
          const toolPromises = toolPlan.toolCalls.map(async (call) => {
            const mapped = call;
            let handle = mapped?.mcpHandle;
            if (!handle) return null;
            
            // Apply agent-level auth
            handle = applyAgentAuth(handle);
            
            // Validate args when schema known
            try { 
              validateWithSchema(
                (availableTools.find(t => t.name === mapped.name) as any)?.parameters, 
                mapped.arguments, 
                `Tool ${mapped.name}`
              ); 
            } catch (e) { 
              throw e; 
            }
            
            const idx = mapped.name.indexOf('.');
            const actualToolName = idx >= 0 ? mapped.name.slice(idx + 1) : mapped.name;
            const mcpStart = Date.now();
            
            try {
              const result = await withMCPAny(
                handle, 
                (c) => c.callTool({ name: actualToolName, arguments: mapped.arguments || {} }), 
                telemetry, 
                'call_tool'
              );
              const mcpMs = Date.now() - mcpStart;
              
              return {
                name: mapped.name,
                arguments: mapped.arguments,
                endpoint: handle.url,
                result,
                ms: mcpMs
              };
            } catch (e) {
              const provider = classifyProviderFromMcp(handle);
              throw normalizeError(e, 'mcp-tool', { stepId: stepIndex, provider });
            }
          });
          
          const toolResults = await Promise.all(toolPromises);
          
          // Build results in original order
          for (const toolCall of toolResults) {
            if (!toolCall) continue;
            aggregated.push(toolCall);
            currentToolCallCount++;  // Increment counter
            
            if (progress) {
              const rInternal = r as StepResultInternal;
              progress._tracker.updateTokens(rInternal.__tokenCount || 0, rInternal.__provider || '', currentToolCallCount);
            }
            
            toolResultsAppend += `- ${toolCall.name} -> ${typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result)}\n`;
            
            // Call onToolCall callback if provided
            if (onToolCall) {
              try {
                onToolCall(toolCall.name, toolCall.arguments, toolCall.result);
              } catch (err) {
                // Don't let callback errors break execution
                console.error('onToolCall callback error:', err);
              }
            }
          }
        } else {
          // SEQUENTIAL EXECUTION: Execute tools one by one (safe default)
          telemetry?.recordMetric('tool.execution.sequential', 1, { count: toolPlan.toolCalls.length });
          
          for (const call of toolPlan.toolCalls) {
            const mapped = call;
            let handle = mapped?.mcpHandle;
            if (!handle) continue;
            
            // Apply agent-level auth
            handle = applyAgentAuth(handle);
            
            // Validate args when schema known
            try { 
              validateWithSchema(
                (availableTools.find(t => t.name === mapped.name) as any)?.parameters, 
                mapped.arguments, 
                `Tool ${mapped.name}`
              ); 
            } catch (e) { 
              throw e; 
            }
            
            const idx = mapped.name.indexOf('.');
            const actualToolName = idx >= 0 ? mapped.name.slice(idx + 1) : mapped.name;
            const mcpStart = Date.now();
            let result: any;
            
            try {
              result = await withMCPAny(
                handle, 
                (c) => c.callTool({ name: actualToolName, arguments: mapped.arguments || {} }), 
                telemetry, 
                'call_tool'
              );
            } catch (e) {
              const provider = classifyProviderFromMcp(handle);
              throw normalizeError(e, 'mcp-tool', { stepId: stepIndex, provider });
            }
            
            const mcpMs = Date.now() - mcpStart;
            const toolCall: any = { 
              name: mapped.name, 
              arguments: mapped.arguments, 
              endpoint: handle.url, 
              result, 
              ms: mcpMs 
            };
            aggregated.push(toolCall);
            currentToolCallCount++;  // Increment counter
            
            if (progress) {
              const rInternal = r as StepResultInternal;
              progress._tracker.updateTokens(rInternal.__tokenCount || 0, rInternal.__provider || '', currentToolCallCount);
            }
            
            toolResultsAppend += `- ${mapped.name} -> ${typeof result === 'string' ? result : JSON.stringify(result)}\n`;
            
            // Call onToolCall callback if provided
            if (onToolCall) {
              try {
                onToolCall(mapped.name, mapped.arguments, result);
              } catch (err) {
                // Don't let callback errors break execution
                console.error('onToolCall callback error:', err);
              }
            }
          }
        }
        
        if (aggregated.length) r.toolCalls = aggregated;
        // Prepare next prompt with appended tool results
        workingPrompt = (stepInstructions ? stepInstructions + "\n\n" : "") + promptWithHistory + toolResultsAppend;
        // On next iteration, model can produce final answer or ask for more tools
      }
      // Ensure toolCalls is always set for automatic tool selection steps
      if (!r.toolCalls) r.toolCalls = [];
    }
  }
  // Multi-agent coordination: Coordinator delegates to specialist agents
  else if ("agents" in s && "prompt" in s) {
    const step = s as Extract<Step, { agents: AgentBuilder[]; prompt: string }>;
    
    const usedLlm = step.llm ?? defaultLlm;
    if (!usedLlm) throw new Error("No LLM provided. Pass { llm } to agent(...) or specify per-step.");
    const stepInstructions = step.instructions ?? globalInstructions;
    const maxToolResults = step.contextMaxToolResults ?? contextMaxToolResults;
    const maxContextChars = step.contextMaxChars ?? contextMaxChars;
    const promptWithHistory = step.prompt + buildHistoryContextChunked(contextHistory, maxToolResults, maxContextChars);
    r.prompt = step.prompt;
    
    const availableAgents = step.agents;
    if (availableAgents.length === 0 || !availableAgents.some(a => a.name && a.description)) {
      r.llmOutput = "No agents available or agents missing name/description.";
    } else {
      const agentContext = buildAgentContext(availableAgents);
      const maxIterations = 10;  // Safety limit for coordinator decisions
      let workingPrompt = (stepInstructions ? stepInstructions + "\n\n" : "") + promptWithHistory + agentContext;
      const agentCalls: Array<{ name: string; task: string; tokens: number; ms: number; result?: string }> = [];
      let totalTokens = 0;
      const modelsUsed = new Set<string>();
      
      for (let i = 0; i < maxIterations; i++) {
        // Show coordinator thinking with structured log
        if (progress) {
          const coordMessage = i === 0 ? 'selecting agents' : 'deciding next step';
          progress.coordinatorActivity(coordMessage);
          progress.startLlmOperation();
        }
        
        const llmStart = Date.now();
        let coordinatorResponse: string;
        let coordTokenCount = 0;
        
        try {
          // Use streaming for coordinator when progress enabled
          if (progress && typeof usedLlm.genStream === 'function') {
            const tokens: string[] = [];
            for await (const token of usedLlm.genStream(workingPrompt)) {
              tokens.push(token);
              coordTokenCount++;
              // Update token progress using centralized tracker
              progress._tracker.updateTokens(coordTokenCount, getLLMProviderId(usedLlm), 0);
            }
            coordinatorResponse = tokens.join('');
          } else {
            coordinatorResponse = await usedLlm.gen(workingPrompt);
          }
        } catch (e) {
          const provider = classifyProviderFromLlm(usedLlm);
          throw normalizeError(e, 'llm', { stepId: stepIndex, provider });
        }
        const coordDuration = Date.now() - llmStart;
        llmTotalMs += coordDuration;
        
        const llmInternal = usedLlm as LLMHandleInternal;
        const coordUsage = normalizeTokenUsage(llmInternal.getUsage?.());
        recordTokenMetrics(telemetry, coordUsage, {
          provider: getLLMProviderId(usedLlm),
          model: usedLlm.model,
          agent_name: agentName || 'coordinator'
        });
        
        const decision = parseAgentDecision(coordinatorResponse);
        
        
        if (decision.type === 'done') {
          totalTokens += coordTokenCount;
          modelsUsed.add(getLLMProviderId(usedLlm));
          if (progress) {
            progress.coordinatorComplete({
              message: 'final answer ready',
              tokens: coordTokenCount,
              duration: coordDuration,
              provider: getLLMProviderId(usedLlm),
              toolCalls: 0
            });
        }
          r.llmOutput = decision.answer;
          break;
        } else if (decision.type === 'use_agent') {
          totalTokens += coordTokenCount;
          modelsUsed.add(getLLMProviderId(usedLlm));
          if (progress) {
            progress.coordinatorComplete({
              message: `use "${decision.agentName}" agent`,
              tokens: coordTokenCount,
              duration: coordDuration,
              provider: getLLMProviderId(usedLlm),
              toolCalls: 0
            });
        }
          const selectedAgent = availableAgents.find(a => a.name === decision.agentName);
          if (!selectedAgent) {
            workingPrompt += `\n\nError: Agent '${decision.agentName}' not found. Available: ${availableAgents.map(a => a.name).join(', ')}`;
            continue;
          }
          
          // Don't log "delegating to X" - it's redundant with the complete message above
          
          const agentStart = Date.now();
          let agentResult: StepResult[];
          
          try {
            // Create a FRESH agent instance to avoid concurrency locks
            const selectedAgentInternal = selectedAgent as AgentBuilderInternal;
            const selectedAgentOpts = selectedAgentInternal._getOpts?.() || {};
            const selectedAgentSteps = selectedAgentInternal._getSteps?.() || [];
            
            // Create fresh agent with same config
            const freshAgent = agent({
              llm: selectedAgentOpts.llm || defaultLlm,
              name: selectedAgent.name,
              description: selectedAgent.description,
              instructions: selectedAgentOpts.instructions,
              timeout: selectedAgentOpts.timeout,
              retry: selectedAgentOpts.retry,
              contextMaxChars: selectedAgentOpts.contextMaxChars,
              contextMaxToolResults: selectedAgentOpts.contextMaxToolResults,
              mcpAuth: selectedAgentOpts.mcpAuth,
              telemetry: selectedAgentOpts.telemetry || telemetry,
              maxToolIterations: selectedAgentOpts.maxToolIterations,
              disableParallelToolExecution: selectedAgentOpts.disableParallelToolExecution
            });
            
            // Add the template steps from original agent
            for (const step of selectedAgentSteps) {
              const stepInternal = step as StepInternal;
              if (!stepInternal.__reset) {
                freshAgent.then(step);
              }
            }
            
            // Mark as sub-agent to suppress banner/footer
            const freshAgentInternal = freshAgent as AgentBuilderInternal;
            freshAgentInternal.__isSubAgent = true;
            freshAgentInternal.__parentAgentName = agentName || 'coordinator';
            
            // Pass full execution history to delegated agent
            const parentContextForAgent: StepResult[] = [
              {
                prompt: (s as any).prompt,
                llmOutput: `You are helping with this task by ${decision.task}`
              },
              ...contextHistory,  // All parent's history up to this point
              // Include ALL previous agent executions for continuity
              ...agentCalls.map(c => ({
                prompt: `Agent ${c.name} was delegated: ${c.task}`,
                llmOutput: c.result
              }))
            ];
            freshAgentInternal.__parentContext = parentContextForAgent;
            
            
            const delegatedAgent = freshAgent;
            
            // Record sub-agent relationship
            if (telemetry) {
              telemetry.recordMetric('agent.subagent_call', 1, {
                parent_agent_name: agentName || 'coordinator',
                agent_name: decision.agentName
              });
            }
            
            // Run the delegated agent WITHOUT parent token tracking
            // Each agent shows its own progress independently
            agentResult = await delegatedAgent.run();
          } catch (e) {
            console.error(`ERROR: Agent '${decision.agentName}' failed:`, e);
            workingPrompt += `\n\nAgent '${decision.agentName}' failed: ${(e as Error).message}`;
            continue;
          }
          const agentMs = Date.now() - agentStart;
          
          // Calculate total tokens from agent results
          const agentTokenCount = agentResult.reduce((sum, step) => {
            const stepInternal = step as StepResultInternal;
            return sum + (stepInternal.__tokenCount || 0);
          }, 0);
          const firstStepInternal = agentResult.length > 0 ? agentResult[0] as StepResultInternal : null;
          const agentProvider = (firstStepInternal?.__provider) || getLLMProviderId(usedLlm);
          
          totalTokens += agentTokenCount;
          modelsUsed.add(agentProvider);
          
          const agentOutput = agentResult[agentResult.length - 1]?.llmOutput || '[no output]';
          const agentToolCalls = agentResult.reduce((sum, step) => sum + (step.toolCalls?.length || 0), 0);
          agentCalls.push({ name: decision.agentName, task: decision.task, tokens: agentTokenCount, ms: agentMs, result: agentOutput });
          
          
          if (progress) progress.agentComplete(decision.agentName, agentTokenCount, agentMs, agentProvider, agentToolCalls);
          
          // Provide clearer feedback to coordinator about what was accomplished
          const feedbackToCoordinator = `\n\nAgent '${decision.agentName}' completed their task "${decision.task}" (${agentMs}ms).\n\nTheir output:\n${agentOutput}\n\nBased on this result, what should we do next? Remember the overall goal: ${step.prompt}`;
          
          workingPrompt += feedbackToCoordinator;
        } else {
          if (i === maxIterations - 1) {
            r.llmOutput = decision.raw;
          } else {
            workingPrompt += `\n\nPlease use the USE or DONE directive.`;
          }
        }
      }
      
      if (!r.llmOutput && agentCalls.length > 0) {
        r.llmOutput = agentCalls[agentCalls.length - 1].result;
      }
      
      if (agentCalls.length > 0) {
        const rInternal = r as StepResultInternal;
        rInternal.agentCalls = agentCalls;
        rInternal.__crewTotalTokens = totalTokens;
        rInternal.__provider = Array.from(modelsUsed).join(',');
        telemetry?.recordMetric('agent.delegation', agentCalls.length, { agents: agentCalls.map(c => c.name).join(',') });
        for (const agentCall of agentCalls) {
          telemetry?.recordMetric('agent.call', 1, { agentName: agentCall.name });
        }
      }
    }
  }
  // LLM-only step: Simple text generation
  else if ("prompt" in s && !("mcp" in s) && !("mcps" in s) && !("agents" in s)) {
    const step = s as Extract<Step, { prompt: string }> & { llm?: LLMHandle; instructions?: string; onToken?: (token: string) => void };
    
    const usedLlm = step.llm ?? defaultLlm;
    if (!usedLlm) throw new Error("No LLM provided. Pass { llm } to agent(...) or specify per-step.");
    const stepInstructions = step.instructions ?? globalInstructions;
    const maxToolResults = step.contextMaxToolResults ?? contextMaxToolResults;
    const maxContextChars = step.contextMaxChars ?? contextMaxChars;
    const promptWithHistory = step.prompt + buildHistoryContextChunked(contextHistory, maxToolResults, maxContextChars);
    const finalPrompt = (stepInstructions ? stepInstructions + "\n\n" : "") + promptWithHistory;
    r.prompt = step.prompt;
    
    const llmSpan = telemetry?.startLLMSpan(stepSpan, usedLlm, finalPrompt) || null;
    
    // Handle different scenarios for onToken and progress
    const stepOnToken = step.onToken;
    const shouldShowProgress = !stepOnToken && !capturedStreamOnToken && progress;
    
    if (shouldShowProgress) progress!.startLlmOperation();
    const llmStart = Date.now();
    try {
      let tokenCount = 0;
      const progressOnToken = shouldShowProgress ? () => {
        tokenCount++;
        progress!.llmToken(tokenCount, getLLMProviderId(usedLlm), 0);  // 0 tool calls for LLM-only steps
      } : undefined;
      
      r.llmOutput = await executeLLMWithStreaming(
        usedLlm,
        finalPrompt,
        stepOnToken,
        capturedStreamOnToken,
        { stepIndex, stepPrompt: step.prompt },
        progress,
        progressOnToken
      );
      const rInternal = r as StepResultInternal;
      rInternal.__tokenCount = tokenCount;
      rInternal.__provider = getLLMProviderId(usedLlm);
      const llmCallDuration = Date.now() - llmStart;
      telemetry?.endSpan(llmSpan);
      telemetry?.recordMetric('llm.call', 1, { provider: getLLMProviderId(usedLlm), error: false });
      telemetry?.recordMetric('llm.duration', llmCallDuration, { provider: getLLMProviderId(usedLlm), model: usedLlm.model });
    
      const llmInternal = usedLlm as LLMHandleInternal;
      const usage = normalizeTokenUsage(llmInternal.getUsage?.());
      recordTokenMetrics(telemetry, usage, {
        provider: getLLMProviderId(usedLlm),
        model: usedLlm.model,
        agent_name: agentName
      });
    } catch (e) {
      telemetry?.endSpan(llmSpan, undefined, e);
      telemetry?.recordMetric('llm.call', 1, { provider: getLLMProviderId(usedLlm), error: true });
      telemetry?.recordMetric('error', 1, { type: 'llm', provider: getLLMProviderId(usedLlm) });
      const provider = classifyProviderFromLlm(usedLlm);
      throw normalizeError(e, 'llm', { stepId: stepIndex, provider });
    }
    llmTotalMs += Date.now() - llmStart;
  }
  // Explicit tool call: Direct invocation of a specific MCP tool
  else if ("mcp" in s && "tool" in s) {
    const step = s as Extract<Step, { mcp: MCPHandle; tool: string }>;
    
    // Apply agent-level auth
    const mcpHandle = applyAgentAuth(step.mcp);
    
    if ("prompt" in step) {
      const stepWithPrompt = step as Extract<Step, { mcp: MCPHandle; tool: string; prompt: string }>;
      const usedLlm = stepWithPrompt.llm ?? defaultLlm;
      if (!usedLlm) throw new Error("No LLM provided. Pass { llm } to agent(...) or specify per-step.");
      const stepInstructions = stepWithPrompt.instructions ?? globalInstructions;
      const maxToolResults = stepWithPrompt.contextMaxToolResults ?? contextMaxToolResults;
      const maxContextChars = stepWithPrompt.contextMaxChars ?? contextMaxChars;
      const promptWithHistory = stepWithPrompt.prompt + buildHistoryContextChunked(contextHistory, maxToolResults, maxContextChars);
      const finalPrompt = (stepInstructions ? stepInstructions + "\n\n" : "") + promptWithHistory;
      r.prompt = stepWithPrompt.prompt;
      const llmStart = Date.now();
      r.llmOutput = await usedLlm.gen(finalPrompt);
      llmTotalMs += Date.now() - llmStart;
    }
    // Validate against tool schema if discoverable
    const schema = await getToolSchema(mcpHandle, step.tool);
    validateWithSchema(schema, step.args ?? {}, `Tool ${mcpHandle.id}.${step.tool}`);
    const mcpStart = Date.now();
    let res: any;
    try {
      res = await withMCP(mcpHandle, (c) => c.callTool({ name: step.tool, arguments: step.args ?? {} }), telemetry, 'call_tool');
    } catch (e) {
      const provider = classifyProviderFromMcp(mcpHandle);
      throw normalizeError(e, 'mcp-tool', { stepId: stepIndex, provider });
    }
    const mcpMs = Date.now() - mcpStart;
    r.mcp = { endpoint: mcpHandle.url, tool: step.tool, result: res, ms: mcpMs };
  }

  r.llmMs = llmTotalMs;
  r.durationMs = Date.now() - stepStart;
  
  // End step span
  telemetry?.endSpan(stepSpan, r);
  telemetry?.recordMetric('step.duration', r.durationMs, { type: stepType });
  
  // Flush telemetry after each step for real-time visibility
  await telemetry?.flush();
  
  safeExecuteHook('post' in s ? s.post : undefined, 'Post-step');
  
  return r;
}

/**
 * Recursively count the total number of steps that will be executed,
 * including steps within sub-agents called via .runAgent()
 */
function countTotalSteps(steps: Array<Step>): number {
  let total = 0;
  
  for (const step of steps) {
    const stepInternal = step as StepInternal;
    if (stepInternal.__runAgent) {
      // This is a runAgent step - recursively count its sub-agent's steps
      const subAgent = stepInternal.__runAgent.subAgent;
      const subAgentInternal = subAgent as AgentBuilderInternal;
      const subSteps = subAgentInternal._getSteps?.() || [];
      total += countTotalSteps(subSteps);
    } else if (stepInternal.__parallel) {
      // Parallel steps count as 1 in the display
      total += 1;
    } else if (stepInternal.__branch || stepInternal.__switch) {
      // Branch/switch counts as 1 (we don't know which branch yet)
      total += 1;
    } else if (stepInternal.__forEach) {
      // forEach counts as number of items
      const items = stepInternal.__forEach.items || [];
      total += items.length;
    } else if (stepInternal.__while || stepInternal.__retryUntil) {
      // Loops/retry count as 1 (unknown iterations)
      total += 1;
    } else if (!stepInternal.__reset) {
      // Regular step
      total += 1;
    }
  }
  
  return total;
}

/**
 * Create an AI agent that chains LLM reasoning with MCP tool calls.
 * 
 * @param opts - Optional configuration including LLM provider, instructions, timeout, retry policy, and observability
 * @returns AgentBuilder for chaining steps with .then() and run()
 * 
 * @example
 * // Simple agent
 * const results = await agent({ llm: llmOpenAI({...}) })
 *   .then({ prompt: "Analyze data" })
 *   .then({ prompt: "Generate insights" })
 *   .run();
 * 
 * @example
 * // With automatic tool selection
 * await agent({ llm })
 *   .then({ 
 *     prompt: "Book a meeting and send confirmation", 
 *     mcps: [calendar, email] 
 *   })
 *   .run();
 */
export function agent(opts?: AgentOptions): AgentBuilder {
  const steps: Array<Step | StepFactory | { __reset: true }> = [];
  const defaultLlm = opts?.llm;
  let contextHistory: StepResult[] = [];
  let inheritedParentContext = false;
  const globalInstructions = opts?.instructions;
  const agentName = opts?.name;
  const agentDescription = opts?.description;
  const showProgress = !opts?.hideProgress;
  const defaultTimeoutMs = (opts?.timeout ?? CONSTANTS.DEFAULT_TIMEOUT_SECONDS) * 1000;
  const defaultRetry: RetryConfig = opts?.retry ?? { delay: CONSTANTS.DEFAULT_RETRY_DELAY_SECONDS, retries: CONSTANTS.DEFAULT_RETRY_ATTEMPTS };
  const contextMaxChars = opts?.contextMaxChars ?? CONSTANTS.DEFAULT_CONTEXT_MAX_CHARS;
  const contextMaxToolResults = opts?.contextMaxToolResults ?? CONSTANTS.DEFAULT_CONTEXT_MAX_TOOL_RESULTS;
  const agentMcpAuth = opts?.mcpAuth || {};
  const telemetry = opts?.telemetry;
  const defaultMaxToolIterations = opts?.maxToolIterations ?? CONSTANTS.DEFAULT_MAX_TOOL_ITERATIONS;
  let isRunning = false;
  
  function applyAgentAuth(handle: MCPHandle): MCPHandle {
    if (handle.auth) return handle; // Handle-level auth takes precedence
    const authConfig = agentMcpAuth[handle.url];
    if (authConfig) {
      return { ...handle, auth: authConfig };
    }
    return handle;
  }
  
  const builder: AgentBuilder = {
    name: agentName,
    description: agentDescription,
    _getSteps() { return steps; },  // Internal helper for recursive step counting
    _getOpts() { return opts; },  // Internal: Store opts for creating fresh instances
    resetHistory() { steps.push({ __reset: true }); return builder; },
    then(s: Step | StepFactory) { steps.push(s); return builder; },
    
    // Parallel execution
    parallel(stepsOrDict: Step[] | Record<string, Step>, hooks?: { pre?: () => void; post?: () => void }) {
      steps.push({ __parallel: stepsOrDict, __hooks: hooks } as any);
      return builder;
    },
    
    // Conditional branching
    branch(condition: (history: StepResult[]) => boolean, branches: { true: (agent: AgentBuilder) => AgentBuilder; false: (agent: AgentBuilder) => AgentBuilder }, hooks?: { pre?: () => void; post?: () => void }) {
      steps.push({ __branch: { condition, branches }, __hooks: hooks } as any);
      return builder;
    },
    
    switch<T = string>(selector: (history: StepResult[]) => T, cases: Record<string, (agent: AgentBuilder) => AgentBuilder> & { default?: (agent: AgentBuilder) => AgentBuilder }, hooks?: { pre?: () => void; post?: () => void }) {
      steps.push({ __switch: { selector, cases }, __hooks: hooks } as any);
      return builder;
    },
    
    // Loops
    while(condition: (history: StepResult[]) => boolean, body: (agent: AgentBuilder) => AgentBuilder, opts?: { maxIterations?: number; timeout?: number; pre?: () => void; post?: () => void }) {
      steps.push({ __while: { condition, body, opts } } as any);
      return builder;
    },
    
    forEach<T>(items: T[], body: (item: T, agent: AgentBuilder) => AgentBuilder, hooks?: { pre?: () => void; post?: () => void }) {
      steps.push({ __forEach: { items, body }, __hooks: hooks } as any);
      return builder;
    },
    
    retryUntil(body: (agent: AgentBuilder) => AgentBuilder, successCondition: (result: StepResult) => boolean, opts?: { maxAttempts?: number; backoff?: number; pre?: () => void; post?: () => void }) {
      steps.push({ __retryUntil: { body, successCondition, opts } } as any);
      return builder;
    },
    
    // Sub-agent composition
    runAgent(subAgent: AgentBuilder, hooks?: { pre?: () => void; post?: () => void }) {
      steps.push({ __runAgent: { subAgent }, __hooks: hooks } as any);
      return builder;
    },
    
    async run(optionsOrLog?: StreamOptions | ((s: StepResult, stepIndex: number) => void)): Promise<AgentResults> {
      if (isRunning) {
        throw new AgentConcurrencyError('This agent is already running. Create a new agent() instance for concurrent runs.');
      }
      isRunning = true;
      
      // Handle both old signature (log callback) and new signature (StreamOptions)
      const log = typeof optionsOrLog === 'function' ? optionsOrLog : optionsOrLog?.onStep;
      const capturedStreamOnToken = typeof optionsOrLog === 'object' ? optionsOrLog?.onToken : undefined;
      
      const builderInternal = builder as AgentBuilderInternal;
      const isSubAgent = builderInternal.__isSubAgent || false;
      const isExplicitSubAgent = builderInternal.__isExplicitSubAgent || false;
      const parentStepIndex = builderInternal.__parentStepIndex;
      const parentTotalSteps = builderInternal.__parentTotalSteps;
      const parentAgentName = builderInternal.__parentAgentName;
      
      // Recursively count total steps (including sub-agent steps)
      const totalSteps = countTotalSteps(steps as Step[]);
      // Show progress unless hideProgress was set (delegated agents show their progress)
      const progress = showProgress ? createProgressHandler(totalSteps, isSubAgent, isExplicitSubAgent, parentStepIndex, parentTotalSteps, agentName) : null;
      
      // Record agent execution (always, even for anonymous agents)
      if (telemetry) {
        telemetry.recordMetric('agent.execution', 1, {
          agent_name: agentName || 'anonymous',
          parent_agent: parentAgentName || 'none',
          is_subagent: isSubAgent.toString()
        });
      }
      
      // Start agent span
      const agentSpan = telemetry?.startAgentSpan(steps.length, agentName) || null;
      const out: StepResult[] = [];
      
      // Inherit parent context if this is a subagent
      if (!inheritedParentContext && builderInternal.__parentContext) {
        contextHistory = [...builderInternal.__parentContext];
        inheritedParentContext = true;
        
      }
      
      try {
        // snapshot steps array to make run isolated from later .then() calls
        const planned = [...steps];
        for (const raw of planned) {
          const rawInternal = raw as StepInternal;
          if (rawInternal.__reset) { contextHistory = []; continue; }
          
          // Handle advanced pattern steps using shared function
          const patternResult = await executePatternStep(raw, out, contextHistory, opts, planned, totalSteps);
          if (patternResult.wasPattern) {
            patternResult.results.forEach((r, i) => {
              log?.(r, out.length - patternResult.results.length + i);
            });
            continue;
          }
          
          const s = typeof raw === 'function' ? (raw as StepFactory)(out) : (raw as Step);
          const stepTimeout = 'timeout' in s ? s.timeout : undefined;
          const stepRetry = 'retry' in s ? s.retry : undefined;
          const stepTimeoutMs = (stepTimeout ?? (defaultTimeoutMs / 1000)) * 1000;
          const retryCfg: RetryConfig = stepRetry ?? defaultRetry;
          const attemptsTotal = retryCfg.retries ?? defaultRetry.retries ?? CONSTANTS.DEFAULT_RETRY_ATTEMPTS;
          const useDelay = retryCfg.delay ?? defaultRetry.delay ?? CONSTANTS.DEFAULT_RETRY_DELAY_SECONDS;
          const useBackoff = retryCfg.backoff;
          if (useDelay && useBackoff) throw new Error('retry: specify either delay or backoff, not both');
  
          const doStep = async (): Promise<StepResult> => {
            return executeStepCore({
              step: s,
              stepIndex: out.length,
              defaultLlm,
              globalInstructions,
              contextHistory,
              contextMaxToolResults,
              contextMaxChars,
              defaultMaxToolIterations,
              agentName,
              applyAgentAuth,
              telemetry,
              agentSpan,
              progress,
              capturedStreamOnToken,
              onToolCall: 'onToolCall' in s ? s.onToolCall : undefined,
              disableParallelToolExecution: opts?.disableParallelToolExecution
            });
          };

          const r = await executeWithRetry(doStep, out.length, {
            attemptsTotal,
            stepTimeoutMs,
            useDelay,
            useBackoff
          });
          if (progress) {
            const crewTokens = (r as any).__crewTotalTokens;
            const toolCallCount = r.toolCalls?.length || (r.mcp ? 1 : 0);
            progress.stepComplete({
              duration: r.durationMs || 0,
              tokens: crewTokens || (r as any).__tokenCount || 0,
              provider: (r as any).__provider,
              toolCalls: toolCallCount
            });
          }
          log?.(r, out.length);
          out.push(r);
          contextHistory.push(r);
        }
        // Populate aggregated totals on the final step
        if (out.length > 0) {
          const totalDuration = out.reduce((acc, s) => acc + (s.durationMs || 0), 0);
          const totalLlm = out.reduce((acc, s) => acc + (s.llmMs || 0), 0);
          const totalMcp = out.reduce((acc, s) => {
            let accStep = acc;
            if (s.mcp?.ms) accStep += s.mcp.ms;
            if (s.toolCalls) accStep += s.toolCalls.reduce((a, t) => a + (t.ms || 0), 0);
            return accStep;
          }, 0);
          const last = out[out.length - 1];
          last.totalDurationMs = totalDuration;
          last.totalLlmMs = totalLlm;
          last.totalMcpMs = totalMcp;
          
          // End agent span and record metrics
          telemetry?.endSpan(agentSpan, last);
          telemetry?.recordMetric('agent.duration', totalDuration, { steps: out.length });
          telemetry?.recordMetric('workflow.steps', out.length, { agent_name: agentName || 'anonymous' });
        }
        return enhanceResults(out);
      } catch (error) {
        // End agent span with error
        telemetry?.endSpan(agentSpan, undefined, error);
        telemetry?.recordMetric('error', 1, { type: 'agent', level: 'workflow' });
        throw error;
      } finally {
        if (progress) {
          // Calculate totals for workflow end
          const totalTokens = out.reduce((acc, s) => {
            const stepTokens = (s as any).__tokenCount || (s as any).__crewTotalTokens || 0;
            return acc + stepTokens;
          }, 0);
          const modelsUsed = new Set<string>();
          out.forEach(s => {
            const provider = (s as any).__provider;
            const crewModels = (s as any).__crewModels;
            if (provider) modelsUsed.add(provider);
            if (crewModels) crewModels.forEach((m: string) => modelsUsed.add(m));
          });
          const totalDuration = out.reduce((acc, s) => acc + (s.durationMs || 0), 0);
          const totalToolCalls = out.reduce((acc, s) => acc + (s.toolCalls?.length || 0) + (s.mcp ? 1 : 0), 0);
          progress.workflowEnd(steps.length, totalTokens, totalDuration, Array.from(modelsUsed), totalToolCalls);
        }
        
        // Flush telemetry after workflow completes to ensure all traces/metrics are exported
        // This is especially important for short-lived processes that exit immediately
        await telemetry?.flush();
        
        isRunning = false;
      }
    },
  };
  
  return builder;
}

// Export for testing
export { enhanceResults };

// Test utility - only for testing
export async function _clearMCPPool() {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    // Close all MCP connections
    for (const [, entry] of MCP_POOL) {
      try {
        await entry.client.close();
        if (entry.transport && typeof entry.transport.close === 'function') {
          await entry.transport.close();
        }
      } catch {}
    }
    MCP_POOL.clear();
    
    // Also clear stdio pool
    for (const [, entry] of MCP_STDIO_POOL) {
      try {
        await entry.client.close();
        entry.process.kill();
      } catch {}
    }
    MCP_STDIO_POOL.clear();
  }
}
