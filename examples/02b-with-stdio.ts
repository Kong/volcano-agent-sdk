import { agent, llmOpenAI, mcpStdio } from "@volcano/agent";

// stdio servers run as separate processes (not HTTP)
// This is how MCP was originally designed - for local/native tools

const llm = llmOpenAI({ 
  apiKey: process.env.OPENAI_API_KEY!, 
  model: "gpt-4o-mini" 
});

// Connect to a stdio MCP server
const fs = mcpStdio({
  command: "tsx",
  args: ["examples/mcp/filesystem/server.ts"]
});

const results = await agent({ llm })
  .then({
    prompt: "List all TypeScript files in the examples directory, then read the hello-world example",
    mcps: [fs]
  })
  .run();

const summary = await results.summary(llm);
console.log("\n" + summary);

process.exit(0);

