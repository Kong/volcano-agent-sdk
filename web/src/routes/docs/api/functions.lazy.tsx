import { createLazyFileRoute } from "@tanstack/react-router";
import { DocsLayout } from "@/components/docs/docs-layout";
import { SEOHead } from "@/seo/seo-head";
import { CodeBlock, InlineCode } from "@/components/ui/code-block";

export const Route = createLazyFileRoute("/docs/api/functions")({
  component: ApiFunctionsPage,
});

function ApiFunctionsPage() {
  return (
    <>
      <SEOHead
        title="API Functions - Volcano Agent SDK Documentation"
        description="Complete function reference for Volcano Agent SDK APIs."
        canonicalUrl="/docs/api/functions"
      />
      <DocsLayout>
        <div className="prose prose-lg dark:prose-invert max-w-none">
          <h1>API Functions</h1>
          <p>
            Complete reference for all Volcano Agent SDK functions and their
            parameters.
          </p>

          <h2>Core Functions</h2>

          <h3>
            <InlineCode>agent(options?)</InlineCode>
          </h3>
          <p>Creates a new agent workflow builder.</p>

          <h4>Parameters</h4>
          <ul>
            <li>
              <InlineCode>options.llm</InlineCode> - Default LLM provider for
              all steps
            </li>
            <li>
              <InlineCode>options.instructions</InlineCode> - Global system
              instructions
            </li>
            <li>
              <InlineCode>options.timeout</InlineCode> - Default timeout in
              seconds
            </li>
            <li>
              <InlineCode>options.retry</InlineCode> - Retry configuration
              object
            </li>
            <li>
              <InlineCode>options.contextMaxChars</InlineCode> - Maximum context
              characters
            </li>
            <li>
              <InlineCode>options.contextMaxToolResults</InlineCode> - Maximum
              tool results to keep
            </li>
          </ul>

          <h4>Example</h4>
          <CodeBlock language="typescript" title="Agent Configuration">
            {`const myAgent = agent({ 
  llm: llmOpenAI({ apiKey: "..." }),
  timeout: 60,
  retry: { retries: 3, delay: 1000 }
});`}
          </CodeBlock>

          <h3>
            <InlineCode>llmOpenAI(config)</InlineCode>
          </h3>
          <p>Configures OpenAI as an LLM provider.</p>

          <h4>Parameters</h4>
          <ul>
            <li>
              <InlineCode>config.apiKey</InlineCode> - OpenAI API key
            </li>
            <li>
              <InlineCode>config.model</InlineCode> - Model name (e.g.,
              "gpt-4o-mini")
            </li>
            <li>
              <InlineCode>config.baseURL</InlineCode> - Optional custom base URL
            </li>
            <li>
              <InlineCode>config.temperature</InlineCode> - Sampling temperature
              (0-2)
            </li>
            <li>
              <InlineCode>config.maxTokens</InlineCode> - Maximum tokens to
              generate
            </li>
          </ul>

          <h4>Example</h4>
          <CodeBlock language="typescript" title="OpenAI Configuration">
            {`const llm = llmOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4o-mini",
  temperature: 0.7,
  maxTokens: 1000
});`}
          </CodeBlock>

          <h3>
            <InlineCode>llmAnthropic(config)</InlineCode>
          </h3>
          <p>Configures Anthropic Claude as an LLM provider.</p>

          <h4>Parameters</h4>
          <ul>
            <li>
              <InlineCode>config.apiKey</InlineCode> - Anthropic API key
            </li>
            <li>
              <InlineCode>config.model</InlineCode> - Model name (e.g.,
              "claude-3-5-haiku-20241022")
            </li>
            <li>
              <InlineCode>config.maxTokens</InlineCode> - Maximum tokens to
              generate
            </li>
            <li>
              <InlineCode>config.temperature</InlineCode> - Sampling temperature
            </li>
          </ul>

          <h3>
            <InlineCode>mcp(url, options?)</InlineCode>
          </h3>
          <p>Connects to an MCP server for tool usage.</p>

          <h4>Parameters</h4>
          <ul>
            <li>
              <InlineCode>url</InlineCode> - MCP server URL
            </li>
            <li>
              <InlineCode>options.timeout</InlineCode> - Connection timeout
            </li>
            <li>
              <InlineCode>options.headers</InlineCode> - Custom HTTP headers
            </li>
          </ul>

          <h4>Example</h4>
          <CodeBlock language="typescript" title="MCP Configuration">
            {`const weatherTools = mcp("http://localhost:3000/weather", {
  timeout: 30000,
  headers: { "Authorization": "Bearer token" }
});`}
          </CodeBlock>

          <h2>Workflow Methods</h2>

          <h3>
            <InlineCode>.then(step)</InlineCode>
          </h3>
          <p>Adds a sequential step to the workflow.</p>

          <h4>Step Parameters</h4>
          <ul>
            <li>
              <InlineCode>prompt</InlineCode> - The prompt to send to the LLM
            </li>
            <li>
              <InlineCode>llm</InlineCode> - Override the default LLM provider
            </li>
            <li>
              <InlineCode>mcps</InlineCode> - Array of MCP connections
            </li>
            <li>
              <InlineCode>tools</InlineCode> - Explicit tools to make available
            </li>
            <li>
              <InlineCode>timeout</InlineCode> - Override default timeout
            </li>
            <li>
              <InlineCode>retry</InlineCode> - Override retry configuration
            </li>
          </ul>

          <h3>
            <InlineCode>.parallel(steps)</InlineCode>
          </h3>
          <p>Executes multiple steps concurrently.</p>

          <h4>Example</h4>
          <CodeBlock language="typescript" title="Parallel Execution">
            {`await agent({ llm })
  .parallel([
    { prompt: "Generate a title" },
    { prompt: "Create a summary" },
    { prompt: "List key points" }
  ])
  .run();`}
          </CodeBlock>

          <h3>
            <InlineCode>.run()</InlineCode>
          </h3>
          <p>
            Executes the workflow and returns all results. Accepts optional
            callbacks for real-time updates.
          </p>

          <h4>Parameters</h4>
          <p>Can be called with a simple callback or options object:</p>
          <CodeBlock language="typescript" title="Run Options">
            {`// Simple callback
await agent({ llm }).then({ prompt: "..." }).run((step, index) => {
  console.log(\`Step \${index + 1} done\`);
});

// Options with onStep and onToken
await agent({ llm }).then({ prompt: "..." }).run({
  onStep: (step, index) => console.log(\`Step \${index + 1} complete\`),
  onToken: (token, meta) => process.stdout.write(token)
});`}
          </CodeBlock>

          <h4>Returns</h4>
          <p>Array of step results with:</p>
          <ul>
            <li>
              <InlineCode>llmOutput</InlineCode> - Generated text response
            </li>
            <li>
              <InlineCode>toolCalls</InlineCode> - Tools that were called
            </li>
            <li>
              <InlineCode>toolResults</InlineCode> - Results from tool calls
            </li>
            <li>
              <InlineCode>usage</InlineCode> - Token usage information
            </li>
            <li>
              <InlineCode>duration</InlineCode> - Step execution time
            </li>
          </ul>

          <h2>Utility Functions</h2>

          <h3>
            <InlineCode>resetHistory()</InlineCode>
          </h3>
          <p>Clears the conversation context for subsequent steps.</p>

          <h3>
            <InlineCode>branch(condition, trueBranch, falseBranch?)</InlineCode>
          </h3>
          <p>Creates conditional workflow branches.</p>

          <h3>
            <InlineCode>loop(condition, steps)</InlineCode>
          </h3>
          <p>Repeats steps while a condition is true.</p>

          <h2>Error Types</h2>

          <h3>
            <InlineCode>VolcanoError</InlineCode>
          </h3>
          <p>Base error class for all Volcano Agent SDK errors.</p>

          <h3>
            <InlineCode>TimeoutError</InlineCode>
          </h3>
          <p>Thrown when a step exceeds its timeout.</p>

          <h3>
            <InlineCode>RetryExhaustedError</InlineCode>
          </h3>
          <p>Thrown when all retry attempts are exhausted.</p>

          <h3>
            <InlineCode>MCPConnectionError</InlineCode>
          </h3>
          <p>Thrown when MCP server connection fails.</p>
        </div>
      </DocsLayout>
    </>
  );
}
