import { Highlight } from "prism-react-renderer";
import { customThemeLight } from "./code-theme";
import { Check, Copy } from "lucide-react";
import { useState, useEffect, useRef } from "react";

const codeDemo = `import { agent, llmOpenAI, mcp } from "@volcano/agent";

const llm = llmOpenAI({ apiKey: process.env.OPENAI_API_KEY!, model: "gpt-5-mini" });
const astro = mcp("http://localhost:3211/mcp");

const out = await agent({ llm })
  .then({
    prompt: "Determine the astrological sign for 1993-07-11.",
    mcps: [astro]
  })
  .then({ prompt: "Now write a one-line fortune for that sign." })
  .run();

console.log(out[0].toolCalls);  // which tools were used
console.log(out[1].llmOutput);   // fortune using step context`;

function Demo2() {
  const [copiedDemo, setCopiedDemo] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
          }
        });
      },
      { threshold: 0.1 }
    );

    const currentRef = sectionRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, []);

  const handleCopyDemo = async () => {
    try {
      await navigator.clipboard.writeText(codeDemo);
      setCopiedDemo(true);
      setTimeout(() => setCopiedDemo(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <section ref={sectionRef} className="my-16 overflow-hidden">
      <div className="container flex flex-col gap-8 px-4 sm:px-0">
        <div
          className={`flex grow flex-col transition-all duration-700 ${
            isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
        >
          <div className="font-space-mono text-xl font-bold sm:text-4xl">
            MCP Native
          </div>
          <p className="py-2 text-base sm:text-xl">
            With automatic MCP tool selection, building MCP-powered workflows is easy as advertising which MCP servers you would like to use for each step.
          </p>

          {/* Code Block */}
          <div className="overflow-hidden border-1 border-black shadow-lg">
            {/* Terminal Header */}
            <div className="flex items-center justify-between border-b-1 border-black bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                <div className="h-3 w-3 rounded-full bg-yellow-500" />
                <div className="h-3 w-3 rounded-full bg-green-500" />
              </div>
              <div className="font-mono text-xs font-medium text-slate-500">
                mcp-demo.ts
              </div>
            </div>

            {/* Code Content */}
            <div className="relative bg-white">
              {/* Copy Button */}
              <button
                onClick={handleCopyDemo}
                className="text-color-primary absolute top-3 right-3 z-10 border-1 border-black p-2.5 transition-all duration-300 hover:scale-110 hover:bg-[#FF572D]/10 active:scale-95"
                aria-label="Copy code"
              >
                {copiedDemo ? (
                  <Check className="animate-in zoom-in h-4 w-4 duration-200" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>

              {/* Syntax Highlighted Code */}
              <Highlight
                theme={customThemeLight}
                code={codeDemo}
                language="typescript"
              >
                {({ style, tokens, getLineProps, getTokenProps }) => (
                  <pre
                    className="overflow-x-auto bg-white p-4 text-sm leading-relaxed sm:p-6 sm:text-base"
                    style={{ ...style, backgroundColor: "white" }}
                  >
                    {tokens.map((line, i) => (
                      <div key={i} {...getLineProps({ line })}>
                        {line.map((token, key) => (
                          <span key={key} {...getTokenProps({ token })} />
                        ))}
                      </div>
                    ))}
                  </pre>
                )}
              </Highlight>
            </div>
          </div>
        </div>
        <div
          className={`w-full overflow-hidden transition-all delay-300 duration-700 ${
            isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
        >
          <div>
            <div className="font-space-mono pb-6 text-lg font-bold sm:text-2xl">
              What's happening
            </div>
            <div className="relative flex flex-col gap-4">
              <div className="group relative flex items-start gap-4 border-1 border-black hover:outline hover:outline-[3px] hover:outline-offset-[-3px] hover:outline-black">
                <div className="flex w-full flex-col gap-3 p-5">
                  <div className="flex items-start gap-4">
                    <div className="bg-btn-primary relative z-10 flex h-11 w-11 flex-shrink-0 items-center justify-center text-lg font-bold text-white shadow-sm transition-all group-hover:scale-105 group-hover:shadow-md">
                      1
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <span className="text-base font-bold sm:text-lg">
                        Dynamic tool discovery
                      </span>
                      <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
                        Volcano connects to the{" "}
                        <code className="border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-[#FF572D] sm:text-sm">
                          astro
                        </code>{" "}
                        MCP server at runtime and discovers available tools. The
                        LLM automatically calls what it needs. No manual setup
                        required.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="group relative flex items-start gap-4 border-1 border-black hover:outline hover:outline-[3px] hover:outline-offset-[-3px] hover:outline-black">
                <div className="flex w-full flex-col gap-3 p-5">
                  <div className="flex items-start gap-4">
                    <div className="bg-btn-primary relative z-10 flex h-11 w-11 flex-shrink-0 items-center justify-center text-lg font-bold text-white shadow-sm transition-all group-hover:scale-105 group-hover:shadow-md">
                      2
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <span className="text-base font-bold sm:text-lg">
                        Schema‑safe execution
                      </span>
                      <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
                        The MCP server provides a{" "}
                        <code className="border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-[#FF572D] sm:text-sm">
                          JSON Schema
                        </code>{" "}
                        defining valid arguments for each tool. Before calling
                        any tool, the LLM's arguments are validated against this
                        schema. Invalid calls fail fast.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="group relative flex items-start gap-4 border-1 border-black hover:outline hover:outline-[3px] hover:outline-offset-[-3px] hover:outline-black">
                <div className="flex w-full flex-col gap-3 p-5">
                  <div className="flex items-start gap-4">
                    <div className="bg-btn-primary relative z-10 flex h-11 w-11 flex-shrink-0 items-center justify-center text-lg font-bold text-white shadow-sm transition-all group-hover:scale-105 group-hover:shadow-md">
                      3
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <span className="text-base font-bold sm:text-lg">
                        Step context
                      </span>
                      <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
                        Each subsequent{" "}
                        <code className="border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-[#FF572D] sm:text-sm">
                          .then()
                        </code>{" "}
                        receives the previous step's output as context. The
                        fortune-writing step automatically gets the astrological
                        sign to craft a personalized result.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="group relative flex items-start gap-4 border-1 border-black hover:outline hover:outline-[3px] hover:outline-offset-[-3px] hover:outline-black">
                <div className="flex w-full flex-col gap-3 p-5">
                  <div className="flex items-start gap-4">
                    <div className="bg-btn-primary relative z-10 flex h-11 w-11 flex-shrink-0 items-center justify-center text-lg font-bold text-white shadow-sm transition-all group-hover:scale-105 group-hover:shadow-md">
                      4
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <span className="text-base font-bold sm:text-lg">
                        Observability built‑in
                      </span>
                      <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
                        Access telemetry data from every step with fine-grained
                        control over how it's collected and relayed. Monitor
                        timing, token usage, and tool calls to debug or log your
                        agent's behavior.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Demo2;
