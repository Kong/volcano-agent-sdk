import { agent, llmOpenAI } from "@volcano/agent";

const llm = llmOpenAI({ 
  apiKey: process.env.OPENAI_API_KEY!, 
  model: "gpt-4o-mini" 
});

console.log("Story streaming in real-time:\n");

await agent({ llm })
  .then({ 
    prompt: "Write a short story about a robot learning to paint",
    onToken: (token) => process.stdout.write(token)
  })
  .run();

console.log("\n\nDone!");

