import { createLazyFileRoute } from "@tanstack/react-router";
import { DocsLayout } from "@/components/docs/docs-layout";
import { SEOHead } from "@/seo/seo-head";
import FeaturesContent from "@/content/docs/features.mdx";
import { useHashNavigation } from "@/hooks/use-hash-navigation";

export const Route = createLazyFileRoute("/docs/features")({
  component: FeaturesPage,
});

function FeaturesPage() {
  useHashNavigation();

  return (
    <>
      <SEOHead
        title="Features - Volcano Agent SDK | Streaming, Retries, Error Handling"
        description="Production-ready features for AI agents: streaming workflows with async generators, three retry strategies (immediate, delayed, exponential), timeout configuration, typed error handling, and step hooks. Build reliable agent systems with TypeScript."
        keywords="AI agent features, streaming workflows, retry strategies, error handling, timeout configuration, async generators, exponential backoff, step hooks, TypeScript features, production AI"
        canonicalUrl="/docs/features"
      />
      <DocsLayout>
        <FeaturesContent />
      </DocsLayout>
    </>
  );
}
