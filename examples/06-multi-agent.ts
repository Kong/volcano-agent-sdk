import { agent, llmOpenAI } from "@volcano.dev/agent";

const llm = llmOpenAI({ 
  apiKey: process.env.OPENAI_API_KEY!, 
  model: "gpt-4o-mini" 
});

// Define specialized agents
const researcher = agent({
  llm,
  name: "researcher",
  description: "Expert at finding facts, data, and research. Use for information gathering."
}).then({ prompt: "Research the topic." }).then({ prompt: "Summarize the research." });

const writer = agent({
  llm,
  name: "writer", 
  description: "Creative writer who crafts engaging narratives. Use for content creation."
}).then({ prompt: "Write content." });

const editor = agent({
  llm,
  name: "editor",
  description: "Polishes content for clarity and grammar. Use for final review."
}).then({ prompt: "Review and polish." });

// Coordinator autonomously delegates to specialists
const results = await agent({ 
  llm,
  timeout: 300  // 5 minutes timeout for multi-agent coordination
})
  .then({
    prompt: "Create a blog post about the James Webb Space Telescope's latest discoveries",
    agents: [researcher, writer, editor]
  })
  .run();

// Use conversational results to get clean output
const blogPost = await results.ask(llm, "Show me the final blog post");
const agentsUsed = await results.ask(llm, "Which agents were used and what did each one do?");

console.log("\n" + blogPost);
console.log("\n" + agentsUsed);

process.exit(0);

