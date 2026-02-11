function Features() {
  return (
    <section id="features">
      <div className="container flex flex-col gap-6 px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="font-space-mono mb-4 text-2xl font-bold sm:text-4xl lg:text-5xl">
          All you need for production agents
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <a
            href="/docs/patterns"
            className="group flex flex-col border-1 border-black p-6 hover:outline-[3px] hover:outline-offset-[-3px] hover:outline-black"
          >
            <div className="flex h-3/5 items-center justify-center">
              <img
                src="/01_mcp_selection.svg"
                alt="MCP Selection"
                className="mb-4 h-full"
              />
            </div>
            <div className="font-space-mono mb-2 text-left text-base font-bold sm:text-xl">
              Advanced Patterns
            </div>
            <p className="text-sm sm:text-base">
              Parallel execution, conditional branching, loops, and sub-agent
              composition for complex workflows.
            </p>
          </a>
          <a
            href="/docs/features#retries-timeouts"
            className="group flex flex-col border-1 border-black p-6 hover:outline-[3px] hover:outline-offset-[-3px] hover:outline-black"
          >
            <div className="flex h-3/5 items-center justify-center">
              <img
                src="/02_retriest_timeouts.svg"
                alt="Retries & Timeouts"
                className="mb-4 h-full"
              />
            </div>
            <div className="font-space-mono mb-2 text-left text-lg font-bold sm:text-xl">
              Retries & Timeouts
            </div>
            <p className="text-sm sm:text-base">
              Three retry strategies: immediate, delayed, and exponential
              backoff. Per-step timeout configuration.
            </p>
          </a>
          <a
            href="/docs/providers"
            className="group flex flex-col border-1 border-black p-6 hover:outline-[3px] hover:outline-offset-[-3px] hover:outline-black"
          >
            <div className="flex h-3/5 items-center justify-center">
              <img src="/03_models.svg" alt="Models" className="mb-4 h-full" />
            </div>
            <div className="font-space-mono mb-2 text-left text-lg font-bold sm:text-xl">
              Multi LLM Providers
            </div>
            <p className="text-sm sm:text-base">
              Supports OpenAI, Anthropic, Mistral, Llama, Bedrock, Vertex, and
              Azure. Switch providers per-step.
            </p>
          </a>
          <a
            href="/docs/observability"
            className="group flex flex-col border-1 border-black p-6 hover:outline-[3px] hover:outline-offset-[-3px] hover:outline-black"
          >
            <div className="flex h-3/5 items-center justify-center">
              <img
                src="/04_latency_graph.svg"
                alt="Latency Graph"
                className="mb-4 h-full"
              />
            </div>
            <div className="font-space-mono mb-2 text-left text-lg font-bold sm:text-xl">
              OpenTelemetry Native
            </div>
            <p className="text-sm sm:text-base">
              Native distributed tracing and metrics that can be exported to
              Jaeger, Prometheus, DataDog, NewRelic.
            </p>
          </a>
        </div>
      </div>
    </section>
  );
}

export default Features;
