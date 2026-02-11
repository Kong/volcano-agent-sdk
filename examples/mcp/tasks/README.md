# Tasks MCP Server

Simple task management service.

## Quick Start

```bash
cd examples/mcp/tasks
tsx server.ts
```

Server runs on **http://localhost:8002/mcp**

## Tools

### `create_task(title, priority?)`
Create a new task.

**Parameters:**
- `title` (string) - Task description
- `priority` (optional) - "low", "medium", or "high" (default: medium)

**Returns:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Bring umbrella",
  "priority": "high",
  "done": false
}
```

### `list_tasks(filter?)`
List all tasks.

**Parameters:**
- `filter` (optional) - "all", "pending", or "completed" (default: all)

**Returns:**
```json
[
  { "id": "...", "title": "Bring umbrella", "priority": "high", "done": false },
  { "id": "...", "title": "Buy milk", "priority": "low", "done": true }
]
```

### `complete_task(taskId)`
Mark a task as completed.

**Parameters:**
- `taskId` (string) - Task ID from create_task

**Returns:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Bring umbrella",
  "priority": "high",
  "done": true
}
```

## Example Usage

```typescript
import { agent, llmOpenAI, mcp } from "@volcano.dev/agent";

const tasks = mcp("http://localhost:8002/mcp");

await agent({ llm })
  .then({
    prompt: "Create a high-priority task to prepare for meeting",
    mcps: [tasks]
  })
  .run();
```

See: `examples/02-with-tools.ts`, `examples/11-email-triage.ts`

