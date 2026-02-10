import { Helmet } from "react-helmet-async";

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  twitterCard?: string;
  canonicalUrl?: string;
  noindex?: boolean;
}

const defaultMeta = {
  title: "Volcano Agent SDK — Build MCP-powered AI agents in minutes",
  description:
    "TypeScript SDK for building production-ready AI agents. Chain LLM reasoning with MCP tools. Mix OpenAI, Claude, Mistral in one workflow. Parallel execution, streaming, retries, and OpenTelemetry observability.",
  keywords:
    "AI agents, TypeScript SDK, MCP tools, Model Context Protocol, OpenAI, Claude, Anthropic, Mistral, multi-provider AI, LLM workflow, agent framework, tool calling, parallel execution, streaming, observability, OpenTelemetry, retries, TypeScript AI, workflow automation",
  ogImage: "/volcano__icn.png",
  canonicalUrl: "https://volcano.dev",
  twitterCard: "summary_large_image",
};

export function SEOHead({
  title = defaultMeta.title,
  description = defaultMeta.description,
  keywords = defaultMeta.keywords,
  ogTitle,
  ogDescription,
  ogImage = defaultMeta.ogImage,
  ogUrl,
  twitterCard = defaultMeta.twitterCard,
  canonicalUrl = defaultMeta.canonicalUrl,
  noindex = false,
}: SEOHeadProps) {
  const finalOgTitle = ogTitle || title;
  const finalOgDescription = ogDescription || description;
  const finalOgUrl =
    ogUrl ||
    (typeof window !== "undefined"
      ? window.location.href
      : defaultMeta.canonicalUrl);

  // Ensure canonical URL is absolute
  const baseUrl = "https://volcano.dev";
  const finalCanonicalUrl = canonicalUrl.startsWith("http")
    ? canonicalUrl
    : `${baseUrl}${canonicalUrl}`;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />

      {/* Open Graph */}
      <meta property="og:title" content={finalOgTitle} />
      <meta property="og:description" content={finalOgDescription} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:url" content={finalOgUrl} />
      <meta property="og:type" content="website" />

      {/* Twitter Card */}
      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:title" content={finalOgTitle} />
      <meta name="twitter:description" content={finalOgDescription} />
      <meta name="twitter:image" content={ogImage} />

      {/* Canonical URL */}
      <link rel="canonical" href={finalCanonicalUrl} />

      {/* Robots */}
      {noindex && <meta name="robots" content="noindex,nofollow" />}

      {/* Additional SEO tags */}
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />
      <meta name="language" content="English" />
      <meta name="author" content="Volcano Team" />

      {/* Performance and Indexing Hints */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
    </Helmet>
  );
}
