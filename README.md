[![CI](https://github.com/Kong/volcano-agent-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Kong/volcano-agent-sdk/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/@volcano.dev/agent.svg)](https://www.npmjs.com/package/@volcano.dev/agent)

# 🌋 Volcano Agent SDK

**The TypeScript SDK for Multi-Provider AI Agents**

Build agents that chain LLM reasoning with MCP tools. Mix OpenAI, Claude, Mistral in one workflow. Parallel execution, branching, loops. Native retries, streaming, and typed errors.

📚 **[Read the full documentation at volcano.dev →](https://volcano.dev/)**

## ✨ Features

<table>
<tr>
<td width="33%">

### 🤖 Automatic Tool Selection
LLM automatically picks which MCP tools to call based on your prompt. No manual routing needed.

</td>
<td width="33%">

### 🧩 Multi-Agent Crews
Define specialized agents and let the coordinator autonomously delegate tasks. Like automatic tool selection, but for agents.

</td>
<td width="33%">

### 💬 Conversational Results
Ask questions about what your agent did. Use `.summary()` or `.ask()` instead of parsing JSON.

</td>
</tr>

<tr>
<td width="33%">

### 🔧 100s of Models
OpenAI, Anthropic, Mistral, Bedrock, Vertex, Azure. Switch providers per-step or globally.

</td>
<td width="33%">

### 🔄 Advanced Patterns
Parallel execution, branching, loops, sub-agent composition. Enterprise-grade workflow control.

</td>
<td width="33%">

### 📡 Streaming
Stream tokens in real-time as LLMs generate them. Perfect for chat UIs and SSE endpoints.

</td>
</tr>

<tr>
<td width="33%">

### 🛡️ TypeScript-First
Full type safety with IntelliSense. Catch errors before runtime.

</td>
<td width="33%">

### 📊 Observability
OpenTelemetry traces and metrics. Export to Jaeger, Prometheus, DataDog, or any OTLP backend.

</td>
<td width="33%">

### ⚡ Production-Ready
Built-in retries, timeouts, error handling, and connection pooling. Battle-tested at scale.

</td>
</tr>
</table>

**[Explore all features →](https://volcano.dev/docs#key-features)**

## Quick Start

### Installation

```bash
npm install @volcano.dev/agent
```

That's it! Includes MCP support and all common LLM providers (OpenAI, Anthropic, Mistral, Llama, Vertex).

**[View installation guide →](https://volcano.dev/docs#installation)**

### Hello World with Automatic Tool Selection

```ts
import { agent, llmOpenAI, mcp } from "@volcano.dev/agent";

const llm = llmOpenAI({ 
  apiKey: process.env.OPENAI_API_KEY!, 
  model: "gpt-4o-mini" 
});

const weather = mcp("http://localhost:8001/mcp");
const tasks = mcp("http://localhost:8002/mcp");

// Agent automatically picks the right tools
const results = await agent({ llm })
  .then({ 
    prompt: "What's the weather in Seattle? If it will rain, create a task to bring an umbrella",
    mcps: [weather, tasks]  // LLM chooses which tools to call
  })
  .run();

// Ask questions about what happened
const summary = await results.summary(llm);
console.log(summary);
```

### Multi-Agent Coordinator

```ts
import { agent, llmOpenAI } from "@volcano.dev/agent";

const llm = llmOpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Define specialized agents
const researcher = agent({ llm, name: 'researcher', description: 'Finds facts and data' })
  .then({ prompt: "Research the topic." })
  .then({ prompt: "Summarize the research." });

const writer = agent({ llm, name: 'writer', description: 'Creates content' })
  .then({ prompt: "Write content." });

// Coordinator autonomously delegates to specialists
const results = await agent({ llm })
  .then({
    prompt: "Write a blog post about quantum computing",
    agents: [researcher, writer]  // Coordinator decides when done
  })
  .run();

// Ask what happened
const post = await results.ask(llm, "Show me the final blog post");
console.log(post);
```

**[View more examples →](https://volcano.dev/docs/examples)**

## Documentation

### 📖 Comprehensive Guides
- **[Getting Started](https://volcano.dev/docs)** - Installation, quick start, core concepts
- **[LLM Providers](https://volcano.dev/docs/providers)** - OpenAI, Anthropic, Mistral, Llama, Bedrock, Vertex, Azure
- **[MCP Tools](https://volcano.dev/docs/mcp-tools)** - Automatic selection, OAuth authentication, connection pooling
- **[Advanced Patterns](https://volcano.dev/docs/patterns)** - Parallel, branching, loops, multi-LLM workflows
- **[Features](https://volcano.dev/docs/features)** - Streaming, retries, timeouts, hooks, error handling
- **[Observability](https://volcano.dev/docs/observability)** - OpenTelemetry traces and metrics
- **[API Reference](https://volcano.dev/docs/api)** - Complete API documentation
- **[Examples](https://volcano.dev/docs/examples)** - Ready-to-run code examples

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Questions or Feature Requests?

- 📝 [Report bugs or issues](https://github.com/Kong/volcano-agent-sdk/issues)
- 💡 [Request features or ask questions](https://github.com/Kong/volcano-agent-sdk/discussions)
- ⭐ [Star the project](https://github.com/Kong/volcano-agent-sdk) if you find it useful

## License

Apache 2.0 - see [LICENSE](LICENSE) file for details.
