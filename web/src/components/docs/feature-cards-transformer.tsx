import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { FeatureCard } from "@/components/ui/feature-card";

// Map feature titles to their corresponding docs pages
const featureLinkMap: Record<string, string> = {
  "Chainable API": "/docs/api#agentoptions-agentbuilder",
  "Automatic Tool Selection": "/docs/mcp-tools#automatic-tool-selection",
  "100s of Models": "/docs/providers",
  "TypeScript-First": "/docs/api#type-reference",
  "Advanced Patterns": "/docs/patterns",
  "Retries & Timeouts": "/docs/features#retries-timeouts",
  "Streaming Workflows": "/docs/features#token-level-streaming",
  "MCP Integration": "/docs/mcp-tools",
  "Sub-Agent Composition": "/docs/patterns#sub-agent-composition",
  "OpenTelemetry Observability": "/docs/observability",
  "MCP OAuth Authentication": "/docs/mcp-tools#mcp-authentication",
  "Performance Optimized": "/docs/mcp-tools#connection-pooling-performance",
};

export function FeatureCardsTransformer() {
  useEffect(() => {
    const article = document.querySelector("#docs-content article");
    if (!article) return;

    // Check if already transformed
    if (article.querySelector("[data-feature-cards-transformed]")) return;

    const headings = article.querySelectorAll("h2");

    for (const h2 of headings) {
      if (h2.textContent === "Key Features") {
        // Find all h3 elements after this h2 until the next h2
        const features: Array<{
          icon: string;
          title: string;
          description: string;
        }> = [];
        let currentElement = h2.nextElementSibling;

        while (currentElement && currentElement.tagName !== "H2") {
          if (currentElement.tagName === "H3") {
            const h3Text = currentElement.textContent || "";
            const nextP = currentElement.nextElementSibling;

            if (nextP && nextP.tagName === "P") {
              // Extract icon and title - support both "icon title" and "title" formats
              // Match emoji/special char followed by space, or treat entire text as title
              const iconMatch = h3Text.match(
                /^([\p{Emoji}\p{Symbol}])\s+(.+)$/u
              );

              if (iconMatch) {
                // Has emoji icon: "🔗 Chainable API"
                const [, icon, title] = iconMatch;
                features.push({
                  icon,
                  title,
                  description: nextP.textContent || "",
                });
              } else {
                // No icon: "Chainable API" or "TypeScript-First"
                features.push({
                  icon: "",
                  title: h3Text,
                  description: nextP.textContent || "",
                });
              }
            }
          }
          currentElement = currentElement.nextElementSibling;
        }

        if (features.length > 0) {
          // Create the grid container
          const gridContainer = document.createElement("div");
          gridContainer.className =
            "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 md:grid-rows-6 lg:grid-rows-4 gap-4 my-8 not-prose";
          gridContainer.setAttribute("data-feature-cards-transformed", "true");

          // Hide all h3 and p elements in the Key Features section
          let elem = h2.nextElementSibling;
          while (elem && elem.tagName !== "H2") {
            if (elem.tagName === "H3" || elem.tagName === "P") {
              (elem as HTMLElement).style.display = "none";
            }
            elem = elem.nextElementSibling;
          }

          // Insert grid after h2
          h2.after(gridContainer);

          // Render feature cards
          const root = createRoot(gridContainer);
          root.render(
            <>
              {features.map((feature, idx) => (
                <FeatureCard
                  key={idx}
                  icon={feature.icon}
                  title={feature.title}
                  href={featureLinkMap[feature.title]}
                  variant={idx % 2 === 0 ? "right" : "left"}
                >
                  {feature.description}
                </FeatureCard>
              ))}
            </>
          );
        }

        break;
      }
    }
  }, []);

  return null;
}
