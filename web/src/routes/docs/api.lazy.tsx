import { createLazyFileRoute } from "@tanstack/react-router";
import { DocsLayout } from "@/components/docs/docs-layout";
import { SEOHead } from "@/seo/seo-head";
import ApiContent from "@/content/docs/api.mdx";
import { useHashNavigation } from "@/hooks/use-hash-navigation";

export const Route = createLazyFileRoute("/docs/api")({
  component: ApiPage,
});

function ApiPage() {
  useHashNavigation();

  return (
    <>
      <SEOHead
        title="API Reference - Volcano Agent SDK | Complete TypeScript API Documentation"
        description="Complete TypeScript API reference for Volcano Agent SDK. Detailed documentation for agent(), llm providers, MCP integration, step configuration, results handling, error types, and utility functions. Full IntelliSense support."
        keywords="API reference, TypeScript API, API documentation, Volcano Agent SDK API, agent API, LLM provider API, MCP API, function reference, type definitions, IntelliSense, TypeScript types"
        canonicalUrl="/docs/api"
      />
      <DocsLayout>
        <ApiContent />
      </DocsLayout>
    </>
  );
}
