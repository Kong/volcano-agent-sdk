import { createLazyFileRoute } from "@tanstack/react-router";

import { Header } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { Statistics } from "@/components/landing/statistics";
import { GitHubCTA } from "@/components/landing/github-cta";
import { Footer } from "@/components/landing/footer";
import Features from "@/components/landing/features";
import Demo1 from "@/components/landing/demo1";
import Demo2 from "@/components/landing/demo2";

import { SEOHead } from "../seo/seo-head";

export const Route = createLazyFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Volcano Agent SDK",
    description:
      "The TypeScript SDK for Multi‑Provider AI Agents. Build agents that chain LLM reasoning with MCP tools.",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Node.js",
    programmingLanguage: "TypeScript",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    creator: {
      "@type": "Organization",
      name: "Volcano Team",
    },
    datePublished: "2025-01-01",
    version: "1.0.0",
  };

  return (
    <>
      <SEOHead
        title="Volcano Agent SDK — Build MCP-powered AI agents in minutes"
        description="TypeScript SDK for building production-ready AI agents. Chain LLM reasoning with MCP tools. Mix OpenAI, Claude, Mistral in one workflow. Parallel execution, streaming, retries, and OpenTelemetry observability."
        canonicalUrl="/"
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="min-h-screen">
        <Header />
        <main id="main-content">
          <Hero />
          <hr className="border-t border-black" />
          <div className="py-8 sm:py-16">
            <Features />
          </div>
          <hr className="border-t border-black" />
          <div className="py-8 sm:py-16">
            <Demo1 />
          </div>
          <hr className="border-t border-black" />
          <div className="py-8 sm:py-16">
            <Demo2 />
          </div>
          <hr className="border-t border-black" />
          <div className="py-8 sm:py-16">
            <Statistics />
          </div>
          <hr className="border-t border-black" />
          <div className="py-8 sm:py-16">
            <GitHubCTA />
          </div>
        </main>
        <Footer />
      </div>
    </>
  );
}
