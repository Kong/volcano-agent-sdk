import { createLazyFileRoute } from "@tanstack/react-router";
import { DocsLayout } from "@/components/docs/docs-layout";
import { SEOHead } from "@/seo/seo-head";
import NativeToolsContent from "@/content/docs/native-tools.mdx";
import { useHashNavigation } from "@/hooks/use-hash-navigation";

export const Route = createLazyFileRoute("/docs/native-tools")({
  component: NativeToolsPage,
});

function NativeToolsPage() {
  useHashNavigation();

  return (
    <>
      <SEOHead
        title="Native Tools - Volcano Agent SDK | Plain Function Tool Calling"
        description="Define AI agent tools as plain JavaScript functions — no MCP server needed. Automatic tool selection, async support, mixing with MCP tools, and full TypeScript type safety."
        keywords="native tools, tool calling, function tools, AI agent tools, TypeScript tools, tool selection, agent SDK tools, plain function tools"
        canonicalUrl="/docs/native-tools"
      />
      <DocsLayout>
        <NativeToolsContent />
      </DocsLayout>
    </>
  );
}
