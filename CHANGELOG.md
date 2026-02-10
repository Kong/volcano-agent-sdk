# Changelog

All notable changes to Volcano Agent SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-11-11

### Added

#### Stdio MCP Transport Support
- **`mcpStdio()` function**: Connect to local MCP servers via standard input/output (stdin/stdout)
- **Environment variable injection**: Pass API keys and configuration to child processes via `env` parameter
- **Automatic process management**: Spawn, pool, and cleanup child processes automatically
- **Mixed transport support**: Use stdio and HTTP/SSE MCP servers in the same workflow seamlessly

#### Real-Time Callbacks
- **`onToken(token)`**: Per-token callback for real-time LLM streaming visualization
- **`onToolCall(toolName, args, result)`**: Per-tool-call callback fired immediately when each MCP tool completes
- Both callbacks work independently or together
- Available for all step types (LLM-only, MCP tools, agent crews)
- Override automatic progress display when custom visualization needed

- **Tool call counts in progress**: Now displayed in real-time and completion messages
- **Conservative Parallel Tool Execution**: Automatic parallelization of tool calls for 2-10x performance improvements
  - Tools executed in parallel when safe: same tool, different resource IDs, different arguments
  - Falls back to sequential execution when dependencies might exist (different tools, duplicate IDs, no IDs)
  - Zero configuration required - works automatically out of the box
  - Smart pattern matching: case-insensitive detection of any parameter named `id` or ending with `id` (e.g., `emailId`, `emailid`, `userId`, `customerId`)
  - Optional `disableParallelToolExecution` flag to force sequential execution for debugging or special cases
  - Provider agnostic - works with OpenAI, Anthropic, Mistral, Bedrock, Vertex AI, Azure
  - New telemetry metrics: `volcano.tool.execution.parallel` and `volcano.tool.execution.sequential` with `count` attribute showing batch size
  - Test measurements show up to 24x speedup for parallel vs sequential execution
- **Conversational Results API**: Ask natural language questions about agent execution using LLMs
  - `results.ask(llm, question)` - Ask any question about what the agent accomplished
  - `results.summary(llm)` - Get intelligent overview of execution
  - `results.toolsUsed(llm)` - Understand which tools were called and why
  - `results.errors(llm)` - Check for execution issues with context
  - Reduces example code by ~50% by replacing manual result parsing with LLM-powered analysis
  - Use cheap models (gpt-4o-mini) for summaries, expensive models (gpt-5) for actual work
- **Automatic OAuth Token Refresh**: Long-running workflows with zero token management
  - New `refreshToken` field in `MCPAuthConfig` for automatic token renewal
  - Automatic 401 error detection and retry with refreshed tokens
  - Works with Gmail, Google Drive, Slack, GitHub, and any OAuth 2.0 service
  - Tokens cached and refreshed transparently without interrupting workflows
  - Perfect for production deployments that run for hours or days
- **Type-check Script**: Added `yarn type-check` command for comprehensive TypeScript validation without emitting files
- **Example Linting**: Examples folder now included in ESLint checks (previously ignored)

## [1.0.4] - 2025-10-30

### Fixed

- **Token Metrics Now Tracked for MCP Automatic Tool Selection**: Fixed missing token tracking in steps with `mcps` (automatic tool selection). Previously, token usage was only recorded for simple LLM-only steps, causing MCP workflows to show zero tokens in observability dashboards. Now all LLM calls properly record `llm.tokens.input`, `llm.tokens.output`, and `llm.tokens.total` metrics regardless of whether tools are being used.

- **Telemetry Flush Now Works with Auto-Configured SDK**: Fixed `telemetry.flush()` to properly flush metrics when using auto-configured SDK via `endpoint` parameter. Now directly calls `metricReader.forceFlush()` instead of trying to use non-existent `SDK.forceFlush()` method. Metrics are now immediately sent to the collector instead of waiting for the 5-second periodic export.

## [1.0.3] - 2025-10-30

### Added

- **Comprehensive Token Tracking**: All LLM providers (OpenAI, Anthropic, Mistral, Llama, Bedrock, Vertex Studio, Azure) now track input/output token usage. Metrics include `volcano.llm.tokens.input`, `volcano.llm.tokens.output`, `volcano.llm.tokens.total` with provider, model, and agent_name labels. Enables answering "Which agent consumes most tokens?" and "Which provider is most cost-effective?"

- **Agent Relationship Metrics**: Track parent-child agent relationships with `volcano.agent.subagent_calls` and `volcano.agent.executions`. Enables answering "What agent is used most?" and "What's the parent-child usage pattern?"

- **Comprehensive Grafana Dashboard**: 23-panel dashboard (`grafana-volcano-comprehensive.json`) with agent analytics, token economics, performance metrics, and error tracking. Answers questions like "Which agent uses most tokens?", "What are the parent-child relationships?", and "Which provider is fastest?"

- **Comprehensive Telemetry Test Suite**: New `telemetry.comprehensive.test.ts` with 24 tests validating all telemetry scenarios including named/anonymous agents, token tracking, LLM metrics, step metrics, sub-agents, multi-provider workflows, error handling, and span creation.

### Changed

- **Improved Context History**: `buildHistoryContextChunked()` now includes all steps' LLM outputs (instead of just the last one), showing them as a numbered list when there are multiple outputs. The existing `contextMaxChars` limit ensures context doesn't grow unbounded. This provides full conversation history for multi-step workflows and sub-agents.

### Fixed

- **Sub-Agents Now Receive Parent Context**: Fixed bug where sub-agents invoked via `.runAgent()` did not receive the parent agent's context (conversation history, LLM outputs, tool results). Sub-agents previously started with a blank slate, lacking critical information like issue numbers, repo names, and previous decisions. Now sub-agents automatically inherit parent context, enabling proper composition workflows. For example, a labeler agent can now see which issue was retrieved and analyzed by the parent agent.

## [1.0.2] - 2025-10-29

### Added

- **Autonomous Multi-Agent Crews**: Define specialized agents with names and descriptions, then let an LLM coordinator automatically route work to the right agent based on capabilities. Like automatic tool selection, but for agents. No manual orchestration required—just describe what each agent does and the coordinator handles delegation.
  ```typescript
  const researcher = agent({ llm, name: 'researcher', description: '...' });
  const writer = agent({ llm, name: 'writer', description: '...' });
  
  await agent({ llm })
    .then({
      prompt: 'Write a blog post about AI',
      agents: [researcher, writer],
    })
    .run();
  ```

- **Live Waiting Timer**: "⏳ Waiting for LLM" now shows elapsed time (`⏳ Waiting for LLM | 2.1s`) updating every 100ms. Makes long waits feel responsive instead of frozen. Applies to both regular steps and agent crew coordination.

- **Simplified Observability Setup**: `createVolcanoTelemetry()` now accepts an `endpoint` parameter for auto-configuration. No need to manually set up OpenTelemetry SDK - just pass `endpoint: 'http://localhost:4318'` and Volcano auto-configures trace and metric exporters.
  ```typescript
  const telemetry = createVolcanoTelemetry({
    serviceName: 'my-app',
    endpoint: 'http://localhost:4318'  // Auto-configures everything!
  });
  ```

- **Local Observability Stack**: Added complete Docker Compose setup with Prometheus, Grafana, Jaeger, and OpenTelemetry Collector. Includes basic Grafana dashboard for agent performance monitoring. See `OBSERVABILITY_TESTING.md` for local testing guide.

- **Context Persistence Test Suite**: New comprehensive tests for GitHub issue handler workflows verify that context (issue numbers, IDs, parameters) persists correctly across multi-step MCP tool calls.

### Changed

- **Improved Progress Display for Agent Crews**: Delegated sub-agents now suppress their progress output when called by a coordinator. Only the parent coordinator shows delegation progress (⚡ researcher → task). Explicit sub-agents (`.runAgent()`) still show step numbering for composition workflows.

- **Updated Dependencies**:
  - `openai`: v5.23 → v6.7 (major update, no breaking changes for our usage)
  - `express`: v4.21 → v5.1 (test servers only)
  - `vitest`: v3.2 → v4.0
  - `@modelcontextprotocol/sdk`: v1.18 → v1.20
  - `@opentelemetry/sdk-node`: v0.205 → v0.207
  - `zod`: Stayed on v3.23 (v4 incompatible with MCP SDK)

- **Better Llama Support**: Switched to `llama3.2:3b` for faster CI execution while maintaining tool calling support. This smaller model is 3x faster than the 8B variant, reducing CI time significantly.

- **Cleaner Test Output**: Added `hideProgress: true` to 25+ test files. Only progress-specific tests show output now, making test runs much cleaner.

- **Progress Format**: Unified all "Waiting" messages to use `|` separator (`⏳ Waiting for LLM | 2.1s`) for consistency with token progress display.

### Fixed

- **Critical: Context Now Includes Tool Arguments**: Fixed bug where tool call parameters (like `issue_number: 123`) were lost across steps. Context now shows both arguments and results: `get_issue({"issue_number":123}) -> {result}`. This was causing multi-step workflows to lose track of IDs, numbers, and other critical parameters.

- **Critical: Context Aggregates Across All Steps**: Previously, context only included tool results from the most recent step. Now aggregates tool calls from the entire history (up to `contextMaxToolResults`), preventing data loss in multi-step MCP workflows.

- **Robust Test Assertions**: Fixed flaky test that failed when LLM returned "Step 3." instead of "Step3". Now strips whitespace before matching to handle formatting variations.

- **Process Cleanup**: MCP test servers now use `SIGKILL` instead of `SIGTERM` for reliable cleanup. Added `pretest` hook that automatically kills zombie servers before test runs. No more port conflicts from interrupted tests.

- **Missing Dependencies**: Added `express`, `cors`, and `zod` to devDependencies for MCP test server functionality.

### Removed

- **Environment Variable Clutter**: Removed 8 unnecessary CI environment variables (`OPENAI_BASE_URL`, `LLAMA_MODEL`, `BEDROCK_MODEL`, etc.). Configuration defaults now live in test code, not CI configuration. Only API keys remain in CI secrets.

- **Conditional Test Skipping**: Removed all `if (!env) { return; }` logic from tests. Tests now fail properly with clear error messages instead of silently skipping when required environment variables are missing.

## Documentation

### Added

- **Complete API Reference**: Documented all agent options including previously undocumented ones: `maxToolIterations`, `hideProgress`, `telemetry`, `mcpAuth`, `name`, `description`.

- **Multi-Agent Crews Guide**: Comprehensive documentation in Features section showing autonomous coordination, real-world examples, and benefits.

- **Default Values**: Explicitly documented all defaults including `retry: { retries: 3, delay: 0 }`, `timeout: 60`, `maxToolIterations: 4`.

### Changed

- **Prominent Feature Highlighting**: Multi-Agent Crews now featured prominently in README and documentation as a key differentiator.

## Internal

### Added

- **Zombie Server Killer**: Created `scripts/kill-test-servers.sh` utility to clean up orphaned MCP server processes on all test ports.

### Changed

- **Test Infrastructure**: 
  - Vitest test timeout increased to 120s for two-step provider tests (CI is slower)
  - Llama tests get 300s timeouts due to larger model size
  - Auto-cleanup runs before every test via `pretest` hook

- **CI Configuration Simplified**: `.github/workflows/ci.yml` now only sets API keys. Model names and endpoints are hardcoded in tests with sensible defaults.

- **Web Build Process**: Added TOC and search index generation to web tests CI workflow. Tests now fail if generated navigation is out of sync with MDX files.

---

## How to Read This Changelog

- **Added**: New features and capabilities
- **Changed**: Modifications to existing functionality  
- **Fixed**: Bug fixes
- **Removed**: Deprecated or removed features
- **Documentation**: Changes to docs, guides, and API references
- **Internal**: Development, testing, and tooling improvements

For migration guides and detailed breaking changes, see [MIGRATION.md](MIGRATION.md) (when applicable).

