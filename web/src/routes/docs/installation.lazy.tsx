import { createLazyFileRoute } from "@tanstack/react-router";
import { DocsLayout } from "@/components/docs/docs-layout";
import { SEOHead } from "@/seo/seo-head";
import { CodeBlock } from "@/components/ui/code-block";

export const Route = createLazyFileRoute("/docs/installation")({
  component: InstallationPage,
});

function InstallationPage() {
  return (
    <>
      <SEOHead
        title="Installation Guide - Volcano Agent SDK | Quick Setup for TypeScript"
        description="Install Volcano Agent SDK in minutes. Single npm package includes OpenAI, Claude, Mistral, Llama, and MCP support. Optional packages for AWS Bedrock, Azure AI, and OpenTelemetry. Requires Node.js 18.17+."
        keywords="install Volcano Agent SDK, npm install, TypeScript setup, Node.js AI SDK, quick start, package installation, AI agent setup, SDK configuration"
        canonicalUrl="/docs/installation"
      />
      <DocsLayout>
        <div className="prose prose-lg dark:prose-invert">
          <h1>Installation</h1>
          <p>Get Volcano Agent SDK up and running in your project.</p>

          <h2>Package Installation</h2>
          <CodeBlock language="bash" title="Install Volcano Agent SDK">
            {`npm install @volcano/agent`}
          </CodeBlock>

          <h2>Requirements</h2>
          <ul>
            <li>Node.js 18.17 or later</li>
            <li>TypeScript 5.0+ (recommended)</li>
            <li>An API key from at least one LLM provider</li>
          </ul>

          <h2>Optional Dependencies</h2>
          <p>For AWS Bedrock support:</p>
          <CodeBlock language="bash" title="AWS Bedrock Dependencies">
            {`npm install @aws-sdk/client-bedrock-runtime`}
          </CodeBlock>

          <p>For Azure AI support:</p>
          <CodeBlock language="bash" title="Azure AI Dependencies">
            {`npm install @azure/identity`}
          </CodeBlock>

          <h2>TypeScript Configuration</h2>
          <p>
            Volcano Agent SDK is written in TypeScript and provides full type
            definitions. No additional configuration is needed.
          </p>
        </div>
      </DocsLayout>
    </>
  );
}
