import { createLazyFileRoute } from "@tanstack/react-router";
import { DocsLayout } from "@/components/docs/docs-layout";
import { SEOHead } from "@/seo/seo-head";
import { CodeBlock } from "@/components/ui/code-block";

export const Route = createLazyFileRoute("/docs/examples/basic")({
  component: BasicExamplesPage,
});

function BasicExamplesPage() {
  return (
    <>
      <SEOHead
        title="Basic Examples - Volcano Agent SDK Documentation"
        description="Learn Volcano Agent SDK with simple, practical examples."
        canonicalUrl="/docs/examples/basic"
      />
      <DocsLayout>
        <div className="prose prose-lg dark:prose-invert max-w-none">
          <h1>Basic Usage Examples</h1>
          <p>Learn Volcano Agent SDK with these simple, practical examples.</p>

          <h2>Hello World Agent</h2>
          <p>The simplest possible agent with OpenAI:</p>

          <CodeBlock language="typescript" title="Hello World Agent">
            {`import { agent, llmOpenAI } from "@volcano.dev/agent";

const llm = llmOpenAI({ 
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4o-mini" 
});

const results = await agent({ llm })
  .then({ prompt: "Say hello in a creative way!" })
  .run();

console.log(results[0].llmOutput);
// Output: "Greetings, wonderful human! ✨"`}
          </CodeBlock>

          <h2>Multi-Step Conversation</h2>
          <p>Build context across multiple steps:</p>

          <CodeBlock language="typescript" title="Multi-Step Conversation">
            {`const results = await agent({ llm })
  .then({ 
    prompt: "I'm planning a dinner party for 8 people. What should I cook?" 
  })
  .then({ 
    prompt: "Great suggestion! Now help me create a shopping list for that meal." 
  })
  .then({ 
    prompt: "What's a good wine pairing for this dinner?" 
  })
  .run();

// Each step builds on the previous context
results.forEach((step, i) => {
  console.log(\`Step \${i + 1}:\`, step.llmOutput);
});`}
          </CodeBlock>

          <h2>Using Different Providers</h2>
          <p>Switch between LLM providers in the same workflow:</p>

          <CodeBlock language="typescript" title="Using Different Providers">
            {`import { agent, llmOpenAI, llmAnthropic } from "@volcano.dev/agent";

const openai = llmOpenAI({ 
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4o-mini"
});

const claude = llmAnthropic({ 
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: "claude-3-5-haiku-20241022"
});

const results = await agent()
  .then({ 
    llm: openai, 
    prompt: "Analyze this business proposal: [proposal text]" 
  })
  .then({ 
    llm: claude, 
    prompt: "Now critique the analysis and suggest improvements" 
  })
  .run();`}
          </CodeBlock>

          <h2>Simple MCP Tool Usage</h2>
          <p>
            Connect to an MCP server and let the agent use tools automatically:
          </p>

          <CodeBlock language="typescript" title="Simple MCP Tool Usage">
            {`import { agent, llmOpenAI, mcp } from "@volcano.dev/agent";

const llm = llmOpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const weather = mcp("http://localhost:3000/weather");

const results = await agent({ llm })
  .then({ 
    prompt: "What's the weather like in San Francisco today?",
    mcps: [weather]  // Agent will discover and use weather tools
  })
  .run();

console.log("Tools called:", results[0].toolCalls);
console.log("Weather report:", results[0].llmOutput);`}
          </CodeBlock>

          <h2>Error Handling</h2>
          <p>Handle errors gracefully with try/catch:</p>

          <CodeBlock language="typescript" title="Error Handling">
            {`try {
  const results = await agent({ llm })
    .then({ prompt: "Perform a complex calculation..." })
    .run();
    
  console.log("Success:", results[0].llmOutput);
} catch (error) {
  if (error.name === 'TimeoutError') {
    console.error("Request took too long");
  } else if (error.name === 'RetryExhaustedError') {
    console.error("All retries failed");
  } else {
    console.error("Unexpected error:", error.message);
  }
}`}
          </CodeBlock>

          <h2>Retry Configuration</h2>
          <p>Configure automatic retries for resilient agents:</p>

          <CodeBlock language="typescript" title="Retry Configuration">
            {`const results = await agent({ 
  llm,
  retry: {
    retries: 3,           // Try up to 3 times
    delay: 1000,          // Wait 1 second between retries
    backoff: "exponential" // Exponential backoff: 1s, 2s, 4s
  }
})
  .then({ prompt: "Generate a complex report..." })
  .run();`}
          </CodeBlock>

          <h2>Timeouts</h2>
          <p>Set timeouts to prevent hanging:</p>

          <CodeBlock language="typescript" title="Timeouts">
            {`const results = await agent({ 
  llm,
  timeout: 30  // 30 second timeout per step
})
  .then({ 
    prompt: "Analyze this large dataset...",
    timeout: 120  // Override to 2 minutes for this step
  })
  .run();`}
          </CodeBlock>

          <h2>Context Management</h2>
          <p>Control conversation history and context:</p>

          <CodeBlock language="typescript" title="Context Management">
            {`const results = await agent({ 
  llm,
  contextMaxChars: 10000,      // Limit context size
  contextMaxToolResults: 5     // Keep only 5 most recent tool results
})
  .then({ prompt: "Analyze document A..." })
  .then({ prompt: "What were the key points?" })
  .resetHistory()  // Clear context here
  .then({ prompt: "Now analyze document B..." })  // Fresh start
  .run();`}
          </CodeBlock>

          <h2>Streaming Results</h2>
          <p>Get results as they complete for real-time updates:</p>

          <CodeBlock language="typescript" title="Progressive Results">
            {`const myAgent = agent({ llm })
  .then({ prompt: "Step 1: Research the topic" })
  .then({ prompt: "Step 2: Outline the content" })
  .then({ prompt: "Step 3: Write the final draft" });

// Get results as each step completes
await myAgent.run({
  onStep: (step, index) => {
    console.log(\`Step \${index + 1} completed:\`);
    console.log(step.llmOutput);
    console.log(\`Took \${step.durationMs}ms\`);
    
    // Update your UI here
    updateProgressBar(index + 1, 3);
  }
});`}
          </CodeBlock>
        </div>
      </DocsLayout>
    </>
  );
}
