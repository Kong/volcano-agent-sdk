import { generatedNavigation } from "./navigation-generated";
import {
  Book,
  Zap,
  GitBranch,
  Code2,
  Settings,
  Wrench,
  BarChart3,
  BookOpenText,
  Braces,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavigationItem {
  title: string;
  href: string;
  icon: LucideIcon;
  childHeadingIds?: string[]; // IDs of child headings (H3, H4, etc.) under this H2
}

export interface NavigationSection {
  title: string;
  items: NavigationItem[];
}

// Icon mapping for different sections
const sectionIcons: Record<string, LucideIcon> = {
  "Getting Started": BookOpenText,
  Examples: Braces,
  Providers: Code2,
  "Native Tools": Wrench,
  "MCP Tools": Settings,
  "Advanced Patterns": GitBranch,
  Features: Zap,
  Observability: BarChart3,
  "API Reference": Book,
};

// Custom section ordering and titles
const sectionConfig: Record<string, { title: string; order: number }> = {
  "/docs": { title: "Getting Started", order: 1 },
  "/docs/examples": { title: "Examples", order: 2 },
  "/docs/providers": { title: "Providers", order: 3 },
  "/docs/native-tools": { title: "Native Tools", order: 4 },
  "/docs/mcp-tools": { title: "MCP Tools", order: 5 },
  "/docs/patterns": { title: "Advanced Patterns", order: 6 },
  "/docs/features": { title: "Features", order: 7 },
  "/docs/observability": { title: "Observability", order: 8 },
  "/docs/api": { title: "API Reference", order: 9 },
};

export function buildNavigation(): NavigationSection[] {
  const sections: Record<string, NavigationItem[]> = {};

  // Process generated navigation
  for (const doc of generatedNavigation) {
    const config = sectionConfig[doc.path];
    if (!config) continue; // Skip docs not in config

    const sectionTitle = config.title;
    const icon = sectionIcons[sectionTitle] || Code2;

    if (!sections[sectionTitle]) {
      sections[sectionTitle] = [];
    }

    // Add overview link
    sections[sectionTitle].push({
      title: "Overview",
      href: doc.path,
      icon,
    });

    // Add level 2 headings only (main sections)
    const level2Headings = doc.headings.filter((h) => h.level === 2);
    for (let i = 0; i < level2Headings.length; i++) {
      const heading = level2Headings[i];

      // Find all child headings (H3, H4, etc.) until the next H2
      const childHeadingIds: string[] = [];
      const currentH2Index = doc.headings.indexOf(heading);
      const nextH2Index = doc.headings.findIndex(
        (h, idx) => idx > currentH2Index && h.level === 2
      );
      const endIndex = nextH2Index === -1 ? doc.headings.length : nextH2Index;

      for (let j = currentH2Index + 1; j < endIndex; j++) {
        if (doc.headings[j].level > 2) {
          childHeadingIds.push(doc.headings[j].id);
        }
      }

      sections[sectionTitle].push({
        title: heading.text,
        href: `${doc.path}#${heading.id}`,
        icon,
        childHeadingIds,
      });
    }
  }

  // Convert to array and sort by order
  const result: NavigationSection[] = Object.entries(sections)
    .map(([title, items]) => ({ title, items }))
    .sort((a, b) => {
      const orderA =
        Object.values(sectionConfig).find((c) => c.title === a.title)?.order ||
        999;
      const orderB =
        Object.values(sectionConfig).find((c) => c.title === b.title)?.order ||
        999;
      return orderA - orderB;
    });

  return result;
}
