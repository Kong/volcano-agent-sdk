# Filesystem MCP Server (stdio)

A local filesystem server using the **stdio transport** (not HTTP).

## What's Different?

- **HTTP servers** (weather, tasks): Run on a port, accept HTTP requests
- **stdio servers** (filesystem): Run as a subprocess, communicate via stdin/stdout

This is how MCP was originally designed - for **local, native tools**.

## Usage

```typescript
import { mcpStdio } from "@volcano/agent";

const fs = mcpStdio({
  command: "tsx",
  args: ["examples/mcp/filesystem/server.ts"]
});

await agent({ llm })
  .then({
    prompt: "List all TypeScript files in examples/",
    mcps: [fs]
  })
  .run();
```

## Tools

- `list_directory(path, pattern?)` - List files
- `read_file(path)` - Read file contents
- `write_file(path, content)` - Write to a file
- `search_files(directory, query)` - Search for text

## Security Note

This server has **full filesystem access**. In production:
- Validate/sandbox paths
- Add permissions checks
- Limit to specific directories

