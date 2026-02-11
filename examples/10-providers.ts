import { 
  agent, 
  llmOpenAI, 
  llmAnthropic
} from "@volcano.dev/agent";

// Use different providers for different tasks
const gpt = llmOpenAI({ 
  apiKey: process.env.OPENAI_API_KEY!, 
  model: "gpt-4o-mini" 
});

const claude = llmAnthropic({ 
  apiKey: process.env.ANTHROPIC_API_KEY!, 
  model: "claude-3-haiku-20240307" 
});

// Mix providers in a single workflow
const results = await agent({ llm: gpt })
  .then({ 
    prompt: "Write a technical explanation of quantum entanglement" 
  })
  .then({ 
    llm: claude,  // Switch to Claude for next step
    prompt: "Simplify this for a 10-year-old" 
  })
  .then({ 
    llm: gpt,  // Back to GPT
    prompt: "Create a fun analogy" 
  })
  .run();

results.forEach((step, i) => {
  console.log(`\nStep ${i + 1}:`);
  console.log(step.llmOutput?.substring(0, 150) + "...");
});

// Fallback pattern - commented out to avoid timeout in example
// try {
//   await agent({ llm: gpt })
//     .then({ prompt: "Complex task", timeout: 5000 })
//     .run();
// } catch {
//   console.log("\nGPT failed, trying Claude...");
//   
//   const fallback = await agent({ llm: claude })
//     .then({ prompt: "Complex task" })
//     .run();
//   
//   console.log(fallback[fallback.length - 1]?.llmOutput);
// }

