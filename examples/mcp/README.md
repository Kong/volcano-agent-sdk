# MCP Servers

These are simple MCP servers you can run locally to try out the examples.

## Quick Start

Start any server:

```bash
cd examples/mcp/weather
tsx server.ts
```

Or run multiple servers in separate terminals:

```bash
# Terminal 1
tsx examples/mcp/weather/server.ts

# Terminal 2
tsx examples/mcp/tasks/server.ts

# Terminal 3 (run an example)
tsx examples/02-with-tools.ts
```

## Available Servers

### Weather (Port 8001)
- `get_weather(city, unit?)` - Current weather
- `get_forecast(city)` - 3-day forecast

### Tasks (Port 8002)
- `create_task(title, priority?)` - Add a task
- `list_tasks(filter?)` - Show tasks
- `complete_task(taskId)` - Mark as done

### Filesystem (stdio)
- `list_directory(path, pattern?)` - List files
- `read_file(path)` - Read file
- `write_file(path, content)` - Write file
- `search_files(directory, query)` - Search text

**Note:** Filesystem uses stdio (subprocess), not HTTP!

## Using in Examples

### HTTP Servers

```typescript
import { mcp } from "@volcano.dev/agent";

const weather = mcp("http://localhost:8001/mcp");
const tasks = mcp("http://localhost:8002/mcp");

await agent({ llm })
  .then({
    prompt: "Check Seattle weather and create a task if needed",
    mcps: [weather, tasks]
  })
  .run();
```

### stdio Servers

```typescript
import { mcpStdio } from "@volcano.dev/agent";

const fs = mcpStdio({
  command: "tsx",
  args: ["examples/mcp/filesystem/server.ts"]
});

await agent({ llm })
  .then({
    prompt: "Read the README.md file",
    mcps: [fs]
  })
  .run();
```

The agent will automatically pick the right tools!

