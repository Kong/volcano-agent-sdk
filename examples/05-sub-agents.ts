import { agent, llmOpenAI } from "@volcano/agent";

const llm = llmOpenAI({ 
  apiKey: process.env.OPENAI_API_KEY!, 
  model: "gpt-4o-mini" 
});

// Create reusable agent components
const analyzer = agent({ llm })
  .then({ prompt: "Analyze the sentiment (positive/negative/neutral)" })
  .then({ prompt: "Extract key topics" });

const responder = agent({ llm })
  .then({ prompt: "Write a professional response addressing the concerns" })
  .then({ prompt: "Make it empathetic but concise" });

// Compose them together
const results = await agent({ llm })
  .then({ prompt: "Customer feedback: 'The product is great but shipping took forever!'" })
  .runAgent(analyzer)
  .runAgent(responder)
  .then({ prompt: "Format as an email reply" })
  .run();

const email = await results.ask(llm, "Show me the final email reply");
console.log("\n" + email);

process.exit(0);

