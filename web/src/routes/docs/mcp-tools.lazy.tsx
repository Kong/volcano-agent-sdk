import { createLazyFileRoute } from "@tanstack/react-router";
import { DocsLayout } from "@/components/docs/docs-layout";
import { SEOHead } from "@/seo/seo-head";
import McpToolsContent from "@/content/docs/mcp-tools.mdx";
import { useHashNavigation } from "@/hooks/use-hash-navigation";

export const Route = createLazyFileRoute("/docs/mcp-tools")({
  component: McpToolsPage,
});

function McpToolsPage() {
  useHashNavigation();

  return (
    <>
      <SEOHead
        title="MCP Tools Integration - Volcano Agent SDK | Model Context Protocol"
        description="Native Model Context Protocol (MCP) support in Volcano Agent SDK. Automatic tool discovery, connection pooling, OAuth authentication, and seamless integration with AI agents. Connect to MCP servers and let your agents use real-world tools."
        keywords="MCP tools, Model Context Protocol, MCP integration, tool calling, MCP server, connection pooling, MCP OAuth, tool discovery, AI agent tools, TypeScript MCP"
        canonicalUrl="/docs/mcp-tools"
      />
      <DocsLayout>
        <McpToolsContent />
      </DocsLayout>
    </>
  );
}
