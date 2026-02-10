import { createLazyFileRoute } from "@tanstack/react-router";
import { DocsLayout } from "@/components/docs/docs-layout";
import { SEOHead } from "@/seo/seo-head";
import PatternsContent from "@/content/docs/patterns.mdx";
import { useHashNavigation } from "@/hooks/use-hash-navigation";

export const Route = createLazyFileRoute("/docs/patterns")({
  component: PatternsPage,
});

function PatternsPage() {
  useHashNavigation();

  return (
    <>
      <SEOHead
        title="Advanced Patterns - Volcano Agent SDK | Parallel, Branching, Loops"
        description="Master advanced AI agent patterns with Volcano Agent SDK: parallel execution, conditional branching, loops, sub-agent composition, and multi-LLM workflows for complex agent systems."
        keywords="AI agent patterns, parallel execution, conditional branching, agent loops, sub-agents, multi-LLM workflow, complex AI systems, agent orchestration, TypeScript patterns"
        canonicalUrl="/docs/patterns"
      />
      <DocsLayout>
        <PatternsContent />
      </DocsLayout>
    </>
  );
}
