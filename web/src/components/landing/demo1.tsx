import { Link } from "@tanstack/react-router";
import {
  Bot,
  Check,
  ChevronRight,
  Copy,
  Radio,
  Repeat2,
  Rows3,
  Split,
} from "lucide-react";
import { Highlight } from "prism-react-renderer";
import { customThemeDark } from "./code-theme";
import { useState, useEffect, useRef } from "react";

const codeExample = `import { agent, llmOpenAI, llmAnthropic, llmMistral } from "@volcano/agent";

const gpt = llmOpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const claude = llmAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const mistral = llmMistral({ apiKey: process.env.MISTRAL_API_KEY! });

await agent()
  .then({ llm: gpt, prompt: "Extract data from report" })
  .then({ llm: claude, prompt: "Analyze for patterns" })
  .then({ llm: mistral, prompt: "Write creative summary" })
  .run();`;

function Demo1() {
  const [copied, setCopied] = useState(false);
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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeExample);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <section ref={sectionRef} className="overflow-hidden" id="demo">
      <div className="container flex flex-col px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24 xl:gap-10">
        {/* Title and Code Block Section */}
        <div
          className={`mb-8 flex flex-1 flex-col transition-all duration-700 xl:mb-0 ${
            isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
        >
          <div className="font-space-mono text-2xl font-bold sm:text-4xl lg:text-5xl">
            Multi-Provider Workflow
          </div>
          <p className="py-3 text-base sm:text-xl">
            Use different LLMs for different steps.
          </p>

          {/* Code Block with Glassmorphism and Animated Border */}
          <div className="group relative">
            {/* Animated gradient border background */}
            <div className="animate-gradient-xy absolute -inset-0.5 bg-gradient-to-r from-[#FF572D] via-[#FF8C5C] to-[#FF572D] opacity-75 blur-sm transition duration-500 group-hover:opacity-100" />

            {/* Code container */}
            <div className="relative overflow-hidden border-2 border-transparent bg-slate-900/90 shadow-2xl backdrop-blur-xl">
              {/* Terminal Header */}
              <div className="flex items-center justify-between border-b-2 border-slate-700/50 bg-slate-800/50 p-3 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-500 transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-red-500/50" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500 transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-yellow-500/50" />
                  <div className="h-3 w-3 rounded-full bg-green-500 transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-green-500/50" />
                </div>
                <div className="font-mono text-xs text-slate-400">
                  workflow.ts
                </div>
              </div>

              {/* Code Content */}
              <div className="relative">
                {/* Copy Button */}
                <button
                  onClick={handleCopy}
                  className="text-color-primary absolute top-3 right-3 z-10 border border-[#FF572D]/30 bg-slate-800/50 p-2.5 backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:bg-[#FF572D]/20 hover:shadow-lg hover:shadow-[#FF572D]/30 active:scale-95"
                  aria-label="Copy code"
                >
                  {copied ? (
                    <Check className="animate-in zoom-in h-4 w-4 duration-200" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>

                {/* Syntax Highlighted Code */}
                <Highlight
                  theme={customThemeDark}
                  code={codeExample}
                  language="typescript"
                >
                  {({ style, tokens, getLineProps, getTokenProps }) => (
                    <pre
                      className="overflow-x-auto p-4 text-sm leading-relaxed sm:p-6 sm:text-base"
                      style={style}
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

                {/* Subtle glow effect */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#FF572D]/5 to-transparent" />
              </div>
            </div>
          </div>
        </div>

        <div className="w-full xl:w-auto xl:flex-shrink-0">
          <div className="font-space-mono pb-6 text-lg font-bold sm:text-2xl xl:pb-8">
            Advanced Patterns
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <a href="/docs/patterns#parallel-execution" className="group flex flex-col border-1 border-black hover:outline-[3px] hover:outline-offset-[-3px] hover:outline-black">
              <div className="p-4">
                <div className="mb-3 flex items-center gap-3">
                  <Rows3 className="text-color-primary h-8 w-8" />
                  <code className="text-base font-semibold sm:text-lg">
                    .parallel()
                  </code>
                </div>
                <p className="text-sm text-slate-600 sm:text-base">
                  Execute multiple LLM calls simultaneously for faster
                  processing
                </p>
              </div>
              <div className="h-full bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-600">
                <span className="text-purple-600">await</span>{" "}
                <span className="text-blue-600">agent</span>({"{ llm }"})<br />
                &nbsp;&nbsp;.<span className="text-blue-600">parallel</span>([
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;{'{ prompt: "Analyze sentiment" }'},
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;{'{ prompt: "Extract entities" }'}
                <br />
                &nbsp;&nbsp;]).<span className="text-blue-600">run</span>();
              </div>
            </a>

            <a href="/docs/patterns#conditional-branching" className="group flex flex-col border-1 border-black hover:outline-[3px] hover:outline-offset-[-3px] hover:outline-black">
              <div className="p-4">
                <div className="mb-3 flex items-center gap-3">
                  <Split className="text-color-primary h-8 w-8" />
                  <code className="text-base font-semibold sm:text-lg">
                    .branch()
                  </code>
                </div>
                <p className="text-sm text-slate-600 sm:text-base">
                  Route workflow based on conditions or LLM decisions
                </p>
              </div>
              <div className="h-full bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-600">
                <span className="text-purple-600">await</span>{" "}
                <span className="text-blue-600">agent</span>({"{ llm }"})<br />
                &nbsp;&nbsp;.<span className="text-blue-600">branch</span>(state
                =&gt; [<br />
                &nbsp;&nbsp;&nbsp;&nbsp;state.positive,
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;{'{ prompt: "Respond positive" }'}
                <br />
                &nbsp;&nbsp;]).<span className="text-blue-600">run</span>();
              </div>
            </a>

            <a href="/docs/patterns#while-loop" className="group flex flex-col border-1 border-black hover:outline-[3px] hover:outline-offset-[-3px] hover:outline-black">
              <div className="p-4">
                <div className="mb-3 flex items-center gap-3">
                  <Repeat2 className="text-color-primary h-8 w-8" />
                  <code className="text-base font-semibold sm:text-lg">
                    .while()
                  </code>
                </div>
                <p className="text-sm text-slate-600 sm:text-base">
                  Iterate until condition met or loop through arrays of data
                </p>
              </div>
              <div className="h-full bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-600">
                <span className="text-purple-600">await</span>{" "}
                <span className="text-blue-600">agent</span>({"{ llm }"})<br />
                &nbsp;&nbsp;.<span className="text-blue-600">while</span>(<br />
                &nbsp;&nbsp;&nbsp;&nbsp;state =&gt; !state.done,
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;{'{ prompt: "Process item" }'}
                <br />
                &nbsp;&nbsp;).<span className="text-blue-600">run</span>();
              </div>
            </a>

            <a href="/docs/patterns#sub-agent-composition" className="group flex flex-col border-1 border-black hover:outline-[3px] hover:outline-offset-[-3px] hover:outline-black">
              <div className="p-4">
                <div className="mb-3 flex items-center gap-3">
                  <Bot className="text-color-primary h-8 w-8" />
                  <code className="text-base font-semibold sm:text-lg">
                    .runAgent()
                  </code>
                </div>
                <p className="text-sm text-slate-600 sm:text-base">
                  Compose complex workflows by nesting and reusing agents
                </p>
              </div>
              <div className="h-full bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-600">
                <span className="text-purple-600">await</span>{" "}
                <span className="text-blue-600">agent</span>({"{ llm }"})<br />
                &nbsp;&nbsp;.<span className="text-blue-600">runAgent</span>
                (summaryAgent)
                <br />
                &nbsp;&nbsp;.<span className="text-blue-600">then</span>(
                {'{ prompt: "Analyze" }'})<br />
                &nbsp;&nbsp;.<span className="text-blue-600">run</span>();
              </div>
            </a>

            <a href="/docs/features#token-level-streaming" className="group flex flex-col border-1 border-black hover:outline-[3px] hover:outline-offset-[-3px] hover:outline-black">
              <div className="p-4">
                <div className="mb-3 flex items-center gap-3">
                  <Radio className="text-color-primary h-8 w-8" />
                  <code className="text-base font-semibold sm:text-lg">
                    .run(callbacks)
                  </code>
                </div>
                <p className="text-sm text-slate-600 sm:text-base">
                  Get real-time updates with step and token callbacks
                </p>
              </div>
              <div className="h-full bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-600">
                <span className="text-blue-600">agent</span>(
                {"{ llm }"}).<span className="text-blue-600">then</span>(...)
                <br />
                &nbsp;&nbsp;.<span className="text-blue-600">run</span>({"{"}
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;onStep: (step) {" => ..."}
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;onToken: (token) {" => ..."}
                <br />
                &nbsp;&nbsp;{"}"});
              </div>
            </a>
          </div>
          <Link
            to="/docs/patterns"
            className="text-color-primary group mt-6 inline-flex items-center gap-2 text-base font-medium sm:text-xl"
          >
            Explore Advanced Patterns
            <ChevronRight className="transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>

      {/* CSS for animated gradient border */}
      <style>{`
        @keyframes gradient-xy {
          0%, 100% {
            background-position: 0% 50%;
            background-size: 400% 400%;
          }
          50% {
            background-position: 100% 50%;
            background-size: 400% 400%;
          }
        }
        .animate-gradient-xy {
          animation: gradient-xy 3s ease infinite;
        }
      `}</style>
    </section>
  );
}

export default Demo1;
