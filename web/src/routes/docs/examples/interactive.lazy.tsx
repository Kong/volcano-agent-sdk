import { createLazyFileRoute } from "@tanstack/react-router";
import { DocsLayout } from "@/components/docs/docs-layout";
import { SEOHead } from "@/seo/seo-head";
import { CodeBlock } from "@/components/ui/code-block";

export const Route = createLazyFileRoute("/docs/examples/interactive")({
  component: InteractiveExamplesPage,
});

function InteractiveExamplesPage() {
  return (
    <>
      <SEOHead
        title="Interactive Examples - Volcano Agent SDK Documentation"
        description="Interactive demos and advanced workflow examples for Volcano Agent SDK."
        canonicalUrl="/docs/examples/interactive"
      />
      <DocsLayout>
        <div className="prose prose-lg dark:prose-invert max-w-none">
          <h1>Interactive Demos</h1>
          <p>Advanced workflow examples and interactive patterns.</p>

          <h2>Parallel Execution</h2>
          <p>Run multiple tasks concurrently for better performance:</p>

          <CodeBlock language="typescript" title="Parallel Execution">
            {`const results = await agent({ llm })
  .parallel([
    { 
      prompt: "Generate 5 creative product names for a fitness app",
      timeout: 30 
    },
    { 
      prompt: "Write 3 compelling taglines for a fitness app",
      timeout: 30 
    },
    { 
      prompt: "List 8 key features that users would want",
      timeout: 30 
    },
    { 
      prompt: "Design a pricing strategy with 3 tiers",
      timeout: 30 
    }
  ])
  .then({ 
    prompt: "Combine all these ideas into a comprehensive product launch plan" 
  })
  .run();

// All 4 initial steps run concurrently, then the final step uses all results`}
          </CodeBlock>

          <h2>Conditional Branching</h2>
          <p>Create dynamic workflows that adapt based on results:</p>

          <CodeBlock language="typescript" title="Conditional Branching">
            {`import { agent, llmOpenAI, branch } from "@volcano/agent";

const results = await agent({ llm })
  .then({ 
    prompt: "Analyze this code for security vulnerabilities: [code]" 
  })
  .branch(
    // Condition: check if vulnerabilities were found
    (step) => step.llmOutput.toLowerCase().includes("vulnerability"),
    
    // True branch: vulnerabilities found
    agent()
      .then({ prompt: "Prioritize these vulnerabilities by severity" })
      .then({ prompt: "Suggest specific fixes for each vulnerability" })
      .then({ prompt: "Create a security remediation plan" }),
    
    // False branch: no vulnerabilities  
    agent()
      .then({ prompt: "Suggest code improvements for better maintainability" })
      .then({ prompt: "Recommend performance optimizations" })
  )
  .run();`}
          </CodeBlock>

          <h2>Looping Workflows</h2>
          <p>Repeat steps until a condition is met:</p>

          <CodeBlock language="typescript" title="Looping Workflows">
            {`import { agent, llmOpenAI, loop } from "@volcano/agent";

let attemptCount = 0;
const maxAttempts = 5;

const results = await agent({ llm })
  .then({ prompt: "Generate a creative business idea" })
  .loop(
    // Condition: continue until we get a good idea or hit max attempts
    (step) => {
      attemptCount++;
      const hasGoodIdea = step.llmOutput.toLowerCase().includes("innovative") 
                         && step.llmOutput.length > 100;
      return !hasGoodIdea && attemptCount < maxAttempts;
    },
    
    // Steps to repeat
    agent()
      .then({ prompt: "That idea needs more innovation. Try a completely different approach." })
  )
  .then({ prompt: "Now create a detailed business plan for this idea" })
  .run();`}
          </CodeBlock>

          <h2>Sub-Agent Composition</h2>
          <p>Break complex tasks into reusable sub-agents:</p>

          <CodeBlock language="typescript" title="Sub-Agent Composition">
            {`// Define reusable sub-agents
const researchAgent = (topic: string) => agent({ llm })
  .then({ prompt: \`Research the latest trends in \${topic}\` })
  .then({ prompt: "Summarize the top 3 most important findings" });

const analysisAgent = () => agent({ llm })
  .then({ prompt: "Analyze the competitive landscape" })
  .then({ prompt: "Identify market gaps and opportunities" });

const strategyAgent = () => agent({ llm })
  .then({ prompt: "Develop a go-to-market strategy" })
  .then({ prompt: "Create a 90-day action plan" });

// Compose them into a master workflow
const marketAnalysis = await agent({ llm })
  .then({ prompt: "I want to launch a new SaaS product for small businesses" })
  .compose(researchAgent("SaaS for small business"))
  .compose(analysisAgent())
  .compose(strategyAgent())
  .then({ prompt: "Synthesize all findings into an executive summary" })
  .run();`}
          </CodeBlock>

          <h2>Multi-Provider Pipeline</h2>
          <p>Use different LLM strengths for different tasks:</p>

          <CodeBlock language="typescript" title="Multi-Provider Pipeline">
            {`import { agent, llmOpenAI, llmAnthropic, llmMistral } from "@volcano/agent";

const openai = llmOpenAI({ model: "gpt-4o" });      // Good for analysis
const claude = llmAnthropic({ model: "claude-3-5-sonnet-20241022" }); // Excellent for writing
const mistral = llmMistral({ model: "mistral-large-latest" });         // Good for creative tasks

const results = await agent()
  .then({ 
    llm: openai,
    prompt: "Analyze these customer feedback surveys: [data]" 
  })
  .then({ 
    llm: claude,
    prompt: "Write a professional report based on this analysis" 
  })
  .then({ 
    llm: mistral,
    prompt: "Create a creative presentation outline from this report" 
  })
  .then({ 
    llm: claude,
    prompt: "Polish the final deliverable for executive presentation" 
  })
  .run();`}
          </CodeBlock>

          <h2>Real-Time Streaming Dashboard</h2>
          <p>Build a live dashboard that updates as steps complete:</p>

          <CodeBlock
            language="typescript"
            title="Real-Time Streaming Dashboard"
          >
            {`// Simulated React component
function AnalysisDashboard() {
  const [steps, setSteps] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  
  const runAnalysis = async () => {
    setIsRunning(true);
    setSteps([]);
    
    const myAgent = agent({ llm })
      .then({ prompt: "Analyze market trends for Q4 2024" })
      .then({ prompt: "Identify top 3 investment opportunities" })
      .then({ prompt: "Calculate risk assessments for each opportunity" })
      .then({ prompt: "Generate portfolio recommendations" })
      .then({ prompt: "Create executive summary with key takeaways" });
    
    try {
      await myAgent.run({
        onStep: (step, index) => {
          setSteps(prev => [...prev, {
            id: index,
            title: \`Step \${index + 1}\`,
            content: step.llmOutput,
            duration: step.durationMs,
            status: 'completed'
          }]);
        }
      });
    } catch (error) {
      console.error("Analysis failed:", error);
    } finally {
      setIsRunning(false);
    }
  };
  
  return (
    <div>
      <button onClick={runAnalysis} disabled={isRunning}>
        {isRunning ? 'Running Analysis...' : 'Start Market Analysis'}
      </button>
      
      {steps.map(step => (
        <div key={step.id} className="step-card">
          <h3>{step.title} ✓</h3>
          <p>{step.content}</p>
          <small>Completed in {step.duration}ms</small>
        </div>
      ))}
    </div>
  );
}`}
          </CodeBlock>

          <h2>Error Recovery Patterns</h2>
          <p>Build robust workflows that handle failures gracefully:</p>

          <CodeBlock language="typescript" title="Error Recovery Patterns">
            {`const resilientWorkflow = await agent({ 
  llm,
  retry: {
    retries: 3,
    delay: 1000,
    backoff: "exponential"
  }
})
  .then({ 
    prompt: "Process this complex dataset: [large_data]",
    timeout: 120,
    fallback: {
      prompt: "The dataset was too complex. Provide general insights instead.",
      llm: llmOpenAI({ model: "gpt-4o-mini" }) // Faster fallback model
    }
  })
  .then({ 
    prompt: "Generate actionable recommendations",
    onError: (error, step) => {
      console.log(\`Step \${step.index} failed: \${error.message}\`);
      return { prompt: "Provide general business recommendations instead" };
    }
  })
  .run()
  .catch(error => {
    // Final fallback
    console.error("Entire workflow failed:", error);
    return [{ llmOutput: "Analysis could not be completed. Please try again later." }];
  });`}
          </CodeBlock>

          <h2>MCP Tool Orchestration</h2>
          <p>Coordinate multiple MCP servers for complex workflows:</p>

          <CodeBlock language="typescript" title="MCP Tool Orchestration">
            {`import { agent, llmOpenAI, mcp } from "@volcano/agent";

// Connect to multiple MCP servers
const weather = mcp("http://localhost:3000/weather");
const calendar = mcp("http://localhost:3001/calendar");
const email = mcp("http://localhost:3002/email");
const maps = mcp("http://localhost:3003/maps");

const results = await agent({ llm })
  .then({ 
    prompt: "I need to plan a outdoor team meeting for next week",
    mcps: [calendar]  // First get calendar info
  })
  .then({ 
    prompt: "Check weather for those available days and suggest the best day",
    mcps: [weather]  // Then check weather
  })
  .then({ 
    prompt: "Find a good outdoor venue within 20 miles of downtown",
    mcps: [maps]  // Find venues
  })
  .then({ 
    prompt: "Send calendar invites and a planning email to the team",
    mcps: [calendar, email]  // Send invites and emails
  })
  .run();

// Agent automatically coordinates between different tools`}
          </CodeBlock>
        </div>
      </DocsLayout>
    </>
  );
}
