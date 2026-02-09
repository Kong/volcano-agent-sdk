import { agent, llmOpenAI, mcp } from "@volcano/agent";

// Start the MCP servers first:
// tsx examples/mcp/weather/server.ts
// tsx examples/mcp/tasks/server.ts

const llm = llmOpenAI({ 
  apiKey: process.env.OPENAI_API_KEY!, 
  model: "gpt-4o-mini" 
});

const weather = mcp("http://localhost:8001/mcp");
const tasks = mcp("http://localhost:8002/mcp");

// The agent automatically picks the right tools
const results = await agent({ llm })
  .then({
    prompt: "Check the weather in Seattle. If it will rain, create ONE high-priority task reminding me to bring an umbrella.",
    mcps: [weather, tasks],
    maxToolIterations: 3  // Limit tool calls to prevent redundancy
  })
  .run();

// Use conversational results API for clean output
const summary = await results.summary(llm);
console.log("\n" + summary);

process.exit(0);

