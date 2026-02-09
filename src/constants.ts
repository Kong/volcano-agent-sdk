// MCP Pool Configuration
export const DEFAULT_MCP_POOL_MAX_SIZE = 16;
export const DEFAULT_MCP_POOL_IDLE_MS = 30_000; // 30 seconds
export const DEFAULT_MCP_POOL_SWEEP_INTERVAL_MS = 5_000; // 5 seconds

// Tool Discovery Cache
export const DEFAULT_TOOL_CACHE_TTL_MS = 60_000; // 60 seconds

// Agent Defaults
export const DEFAULT_TIMEOUT_SECONDS = 60;
export const DEFAULT_RETRY_ATTEMPTS = 3;
export const DEFAULT_RETRY_DELAY_SECONDS = 0;
export const DEFAULT_CONTEXT_MAX_CHARS = 20_480; // 20KB
export const DEFAULT_CONTEXT_MAX_TOOL_RESULTS = 8;
export const DEFAULT_MAX_TOOL_ITERATIONS = 4;

// Retry Backoff
export const DEFAULT_RETRY_BACKOFF_BASE_MS = 1_000; // 1 second
export const DEFAULT_RETRY_BACKOFF_FACTOR = 1.5;

// OAuth Token Cache
export const OAUTH_TOKEN_EXPIRY_BUFFER_MS = 60_000; // 60s buffer

// Telemetry
export const VOLCANO_SDK_VERSION = '1.0.1';
export const DEFAULT_TELEMETRY_SERVICE_NAME = 'volcano-agent-sdk';
export const DEFAULT_TELEMETRY_VERSION = '0.1.0';
export const DEFAULT_OTLP_EXPORT_INTERVAL_MS = 5_000; // 5 seconds
export const DEFAULT_OTLP_EXPORT_TIMEOUT_MS = 5_000; // 5 seconds

