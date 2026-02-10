import { createLazyFileRoute } from "@tanstack/react-router";
import { DocsLayout } from "@/components/docs/docs-layout";
import { SEOHead } from "@/seo/seo-head";
import ObservabilityContent from "@/content/docs/observability.mdx";
import { useHashNavigation } from "@/hooks/use-hash-navigation";

export const Route = createLazyFileRoute("/docs/observability")({
  component: ObservabilityPage,
});

function ObservabilityPage() {
  useHashNavigation();

  return (
    <>
      <SEOHead
        title="Observability - Volcano Agent SDK | OpenTelemetry Tracing & Metrics"
        description="Production-ready observability for AI agents with OpenTelemetry. Distributed tracing, metrics, and monitoring for agent workflows. Export to Jaeger, Prometheus, DataDog, and NewRelic. Debug failures and optimize performance."
        keywords="OpenTelemetry, AI observability, distributed tracing, agent monitoring, performance metrics, Jaeger, Prometheus, DataDog, NewRelic, AI agent debugging, workflow monitoring"
        canonicalUrl="/docs/observability"
      />
      <DocsLayout>
        <ObservabilityContent />
      </DocsLayout>
    </>
  );
}
