import { agent, llmOpenAI } from "@volcano/agent";

const llm = llmOpenAI({ 
  apiKey: process.env.OPENAI_API_KEY!, 
  model: "gpt-4o-mini" 
});

const results = await agent({ llm })
  .then({ prompt: "Give me 3 random words" })
  .then({ prompt: "Write a haiku using those words" })
  .run();

console.log('\n' + (results[results.length - 1]?.llmOutput || ''));

