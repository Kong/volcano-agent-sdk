import { agent, llmOpenAI, mcp } from "@volcano.dev/agent";

// Real-world use case: automatically triage and respond to customer emails
// Start MCP servers first: tsx examples/mcp/tasks/server.ts

const llm = llmOpenAI({ 
  apiKey: process.env.OPENAI_API_KEY!, 
  model: "gpt-4o-mini" 
});

const tasks = mcp("http://localhost:8002/mcp");

const inboxEmails = [
  {
    from: "angry@customer.com",
    subject: "Order #1234 still not delivered!",
    body: "It's been 2 weeks and I still haven't received my order. This is unacceptable!"
  },
  {
    from: "happy@customer.com", 
    subject: "Love the product!",
    body: "Just wanted to say the quality exceeded my expectations. Will order again!"
  },
  {
    from: "support@vendor.com",
    subject: "Re: Bulk order inquiry",
    body: "We can offer 20% discount on orders over 100 units. Let me know if interested."
  }
];

console.log("Processing emails...\n");

for (const email of inboxEmails) {
  console.log(`\n=== ${email.subject} ===`);
  
  const result = await agent({ llm })
    .then({
      prompt: `
Email from: ${email.from}
Subject: ${email.subject}
Body: ${email.body}

Classify this email as: urgent, positive, or business.
Extract any action items.
      `.trim()
    })
    .then({
      prompt: "If there are action items, create tasks for them",
      mcps: [tasks]
    })
    .then({
      prompt: "Write a professional response email"
    })
    .run();
  
  const summary = await result.summary(llm);
  console.log(summary);
}

console.log("\n\nAll emails processed!");
process.exit(0);

