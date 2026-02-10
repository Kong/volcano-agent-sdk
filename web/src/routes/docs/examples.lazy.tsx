import { createLazyFileRoute } from "@tanstack/react-router";
import { DocsLayout } from "@/components/docs/docs-layout";
import { SEOHead } from "@/seo/seo-head";
import ExamplesContent from "@/content/docs/examples.mdx";

export const Route = createLazyFileRoute("/docs/examples")({
  component: ExamplesPage,
});

function ExamplesPage() {
  return (
    <>
      <SEOHead
        title="Code Examples - Volcano Agent SDK | Tutorials & Sample Projects"
        description="Ready-to-run TypeScript examples for Volcano Agent SDK. Learn from practical code samples covering basic agents, MCP tools, multi-provider workflows, parallel execution, streaming, and advanced patterns. Copy-paste examples to get started quickly."
        keywords="Volcano Agent SDK examples, code samples, TypeScript examples, AI agent tutorials, MCP examples, multi-provider examples, workflow examples, sample projects, agent code, tutorial code"
        canonicalUrl="/docs/examples"
      />
      <DocsLayout>
        <ExamplesContent />
      </DocsLayout>
    </>
  );
}
