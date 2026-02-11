import { agent, llmOpenAI, createVolcanoTelemetry } from "@volcano.dev/agent";

// Start the observability stack first:
// cd observability-demo && docker-compose -f docker-compose.observability.yml up

const telemetry = createVolcanoTelemetry({
  serviceName: 'my-agent',
  endpoint: 'http://localhost:4318'
});

const llm = llmOpenAI({ 
  apiKey: process.env.OPENAI_API_KEY!, 
  model: "gpt-4o-mini" 
});

console.log("Running with observability enabled...");
console.log("Traces: http://localhost:16686 (Jaeger)");
console.log("Metrics: http://localhost:3000 (Grafana)\n");

const results = await agent({ 
  llm, 
  telemetry,
  name: 'content-generator'
})
  .then({ 
    name: 'brainstorm',
    prompt: "3 blog post ideas about productivity" 
  })
  .then({ 
    name: 'outline',
    prompt: "Create an outline for the first idea" 
  })
  .then({ 
    name: 'write',
    prompt: "Write the introduction paragraph" 
  })
  .run();

console.log(results.at(-1)?.llmOutput);
console.log("\nCheck Jaeger for traces and Grafana for metrics!");

