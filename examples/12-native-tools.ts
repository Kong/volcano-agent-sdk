import { agent, llmOpenAI, tool } from "@volcano.dev/agent";

const llm = llmOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4o-mini"
});

// Define native tools — plain functions, no MCP server needed

const calculator = tool({
  name: "calculate",
  description: "Evaluate a math expression and return the result",
  parameters: {
    type: "object",
    properties: {
      expression: { type: "string", description: "A math expression, e.g. '2 + 2' or '84.50 * 0.15'" }
    },
    required: ["expression"]
  },
  execute: ({ expression }) => {
    const result = Function(`"use strict"; return (${expression})`)();
    return JSON.stringify({ expression, result });
  }
});

const unitConverter = tool({
  name: "convert_units",
  description: "Convert between measurement units",
  parameters: {
    type: "object",
    properties: {
      value: { type: "number" },
      from: { type: "string", description: "Source unit (e.g. 'miles', 'kg', 'fahrenheit')" },
      to: { type: "string", description: "Target unit (e.g. 'km', 'lbs', 'celsius')" }
    },
    required: ["value", "from", "to"]
  },
  execute: ({ value, from, to }) => {
    const conversions: Record<string, number> = {
      "miles->km": 1.60934,
      "km->miles": 0.621371,
      "kg->lbs": 2.20462,
      "lbs->kg": 0.453592,
    };
    const key = `${from}->${to}`;
    const factor = conversions[key];
    if (!factor) return JSON.stringify({ error: `Unknown conversion: ${key}` });
    return JSON.stringify({ value, from, to, result: value * factor });
  }
});

// The LLM automatically picks the right tools
const results = await agent({ llm })
  .then({
    prompt: "What is 15% tip on a $84.50 dinner bill? Also, convert 26.2 miles to kilometers.",
    tools: [calculator, unitConverter],
    maxToolIterations: 3
  })
  .run();

const summary = await results.summary(llm);
console.log("\n" + summary);

process.exit(0);
