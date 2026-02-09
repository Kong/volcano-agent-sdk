import { agent, llmOpenAIResponses } from "@volcano/agent";

// Use OpenAI Responses API for guaranteed structured outputs
const llm = llmOpenAIResponses({ 
  apiKey: process.env.OPENAI_API_KEY!, 
  model: "gpt-4o-mini",
  options: {
    jsonSchema: {
      name: 'order',
      description: 'Customer order information',
      schema: {
        type: 'object',
        properties: {
          customerName: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                product: { type: 'string' },
                quantity: { type: 'number' },
                price: { type: 'number' }
              },
              required: ['product', 'quantity', 'price'],
              additionalProperties: false  // Required for nested objects
            }
          },
          total: { type: 'number' }
        },
        required: ['customerName', 'items', 'total'],
        additionalProperties: false
      }
    }
  }
});

const results = await agent({ llm })
  .then({
    prompt: "Extract order info: 'Sarah ordered 2 cappuccinos at $4.50 each and 1 croissant for $3.25'"
  })
  .run();

const order = JSON.parse(results[results.length - 1]?.llmOutput || "{}");
console.log("Order:", order);
console.log("Total:", `$${order.total}`);

