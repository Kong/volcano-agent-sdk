import { agent, llmOpenAI } from "@volcano/agent";

const llm = llmOpenAI({ 
  apiKey: process.env.OPENAI_API_KEY!, 
  model: "gpt-4o-mini" 
});

// Pattern 1: Process multiple things in parallel
console.log("=== Parallel Processing ===\n");

const results = await agent({ llm })
  .parallel([
    { prompt: "Summarize: 'AI is transforming healthcare'" },
    { prompt: "Summarize: 'Quantum computing shows promise'" },
    { prompt: "Summarize: 'Mars rover finds water evidence'" }
  ])
  .run();

const summaries = results[0].parallelResults || [];
summaries.forEach((s, i) => console.log(`${i + 1}. ${s.llmOutput}`));

// Pattern 2: Conditional branching
console.log("\n=== Conditional Branching ===\n");

const response = await agent({ llm })
  .then({ prompt: "Rate sentiment 1-10 for: 'This product is amazing!'" })
  .branch(
    (results) => {
      const rating = parseInt(results[0]?.llmOutput || "0");
      return rating > 7;
    },
    {
      true: (a) => a.then({ prompt: "Write a thank you message" }),
      false: (a) => a.then({ prompt: "Write an apology message" })
    }
  )
  .run();

const summary = await response.summary(llm);
console.log(summary);

// Pattern 3: Process a list of items
console.log("\n=== For Each ===\n");

const topics = ["coffee", "tea", "juice"];
const forEachResults = await agent({ llm })
  .forEach(topics, (topic, a) =>
    a.then({ prompt: `One interesting fact about ${topic}` })
  )
  .run();

forEachResults.forEach((step, i) => {
  console.log(`${topics[i]}: ${step.llmOutput}`);
});

// Pattern 4: While loop
console.log("\n=== While Loop ===\n");

let counter = 0;
const whileResults = await agent({ llm })
  .while(
    () => {
      counter++;
      return counter < 3;  // Loop 2 times
    },
    (a) => a.then({ prompt: `Generate a random word (iteration ${counter})` }),
    { maxIterations: 5 }
  )
  .run();

console.log(`Generated ${whileResults.length} words:`);
whileResults.forEach((step, i) => {
  console.log(`  ${i + 1}. ${step.llmOutput}`);
});

process.exit(0);

