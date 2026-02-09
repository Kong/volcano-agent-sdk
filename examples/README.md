# Examples

Learn Volcano Agent SDK through hands-on examples, from simple to advanced.

## Getting Started

```bash
export OPENAI_API_KEY="your-key-here"
tsx examples/01-hello-world.ts
```

## Examples

### Basics

**01-hello-world.ts** - Your first agent  
Multi-step reasoning in ~10 lines

**02-with-tools.ts** - Automatic tool selection  
The agent picks the right MCP tools automatically

**02b-with-stdio.ts** - stdio MCP servers  
Use local tools via stdio transport (not HTTP)

**03-streaming.ts** - Real-time responses  
Stream tokens as they're generated

**04-structured-outputs.ts** - Type-safe data  
Extract structured JSON with Zod schemas

### Composition

**05-sub-agents.ts** - Reusable components  
Build modular agents with `.runAgent()`

**06-multi-agent.ts** - Autonomous delegation  
Coordinator automatically routes to specialists

**07-patterns.ts** - Advanced workflows  
`parallel()`, `branch()`, `forEach()`, `retryUntil()`

### Production

**08-context.ts** - Conversation history  
Manage context across multiple steps

**09-observability.ts** - Monitoring & traces  
OpenTelemetry integration for production

**10-providers.ts** - Multiple LLMs  
Switch between OpenAI, Claude, etc.

**11-email-triage.ts** - Real use case  
Full workflow: classify, extract, respond

## Running MCP Servers

Some examples need MCP servers:

```bash
# Terminal 1
tsx examples/mcp/weather/server.ts

# Terminal 2
tsx examples/mcp/tasks/server.ts

# Terminal 3
tsx examples/02-with-tools.ts
```

See [mcp/README.md](mcp/README.md) for details.

## Tips

- Start with 01-04 to learn the basics
- Try 05-06 to understand composition
- Check 11 for a real-world example
- All examples are standalone and copy-paste ready

