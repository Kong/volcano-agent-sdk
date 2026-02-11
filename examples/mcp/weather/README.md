# Weather MCP Server

Simple weather information service.

## Quick Start

```bash
cd examples/mcp/weather
tsx server.ts
```

Server runs on **http://localhost:8001/mcp**

## Tools

### `get_weather(city, unit?)`
Get current weather for a city.

**Parameters:**
- `city` (string) - City name
- `unit` (optional) - "celsius" or "fahrenheit" (default: fahrenheit)

**Returns:**
```json
{
  "city": "Seattle",
  "temperature": "58°F",
  "condition": "Rainy",
  "rain": true
}
```

### `get_forecast(city)`
Get 3-day weather forecast.

**Parameters:**
- `city` (string) - City name

**Returns:**
```json
{
  "city": "Seattle",
  "forecast": [
    { "day": "Today", "high": 72, "low": 58, "condition": "Sunny" },
    { "day": "Tomorrow", "high": 75, "low": 60, "condition": "Partly cloudy" },
    { "day": "Day after", "high": 70, "low": 55, "condition": "Cloudy" }
  ]
}
```

## Example Usage

```typescript
import { agent, llmOpenAI, mcp } from "@volcano.dev/agent";

const weather = mcp("http://localhost:8001/mcp");

await agent({ llm })
  .then({
    prompt: "What's the weather in Seattle?",
    mcps: [weather]
  })
  .run();
```

See: `examples/02-with-tools.ts`

