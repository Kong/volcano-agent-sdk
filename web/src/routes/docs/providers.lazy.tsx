import { createLazyFileRoute } from "@tanstack/react-router";
import { DocsLayout } from "@/components/docs/docs-layout";
import { SEOHead } from "@/seo/seo-head";
import ProvidersContent from "@/content/docs/providers.mdx";
import { useHashNavigation } from "@/hooks/use-hash-navigation";

export const Route = createLazyFileRoute("/docs/providers")({
  component: ProvidersPage,
});

function ProvidersPage() {
  useHashNavigation();

  return (
    <>
      <SEOHead
        title="LLM Providers - Volcano Agent SDK | OpenAI, Claude, Mistral & More"
        description="Volcano Agent SDK supports 7 major LLM providers: OpenAI, Anthropic Claude, Mistral, Llama, AWS Bedrock, Google Vertex AI, and Azure OpenAI. Switch providers per-step with a unified TypeScript interface."
        keywords="LLM providers, OpenAI API, Claude API, Anthropic integration, Mistral AI, multi-provider LLM, AWS Bedrock, Google Vertex AI, Azure OpenAI, TypeScript AI SDK"
        canonicalUrl="/docs/providers"
      />
      <DocsLayout>
        <ProvidersContent />
      </DocsLayout>
    </>
  );
}
