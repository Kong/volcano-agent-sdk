import { agent, llmOpenAI } from "@volcano/agent";

const llm = llmOpenAI({ 
  apiKey: process.env.OPENAI_API_KEY!, 
  model: "gpt-4o-mini" 
});

// Context automatically flows through steps
const results = await agent({ llm })
  .then({ 
    name: "intro",
    prompt: "I'm planning a trip to Tokyo. What are 3 must-visit places?" 
  })
  .then({ 
    name: "details",
    prompt: "Tell me more about the first place you mentioned" 
  })
  .then({ 
    name: "budget",
    prompt: "How much would visiting these places cost roughly?" 
  })
  .run();

// Each step has access to previous context
results.forEach((step, i) => {
  const stepName = step.prompt?.split(':')[0] || 'unnamed';
  console.log(`\nStep ${i + 1} (${stepName}):`);
  console.log(step.llmOutput?.substring(0, 200) + "...");
});

// Access specific step results
console.log("\n=== Final Budget Estimate ===");
console.log(results.at(-1)?.llmOutput);

process.exit(0);

