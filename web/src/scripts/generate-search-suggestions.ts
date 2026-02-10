import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

interface SearchSuggestion {
  label: string;
  query: string;
  path?: string;
  description?: string;
}

interface SearchSuggestions {
  quickLinks: SearchSuggestion[];
  popular: SearchSuggestion[];
  api: SearchSuggestion[];
  concepts: SearchSuggestion[];
}

// Extract API methods from code blocks and content
function extractAPIMethods(content: string): string[] {
  const methods: Set<string> = new Set();

  // Common Volcano Agent SDK methods - prioritize these
  const priorityMethods = [
    "runAgentWorkflow",
    "createTool",
    "createAgent",
    "executeStep",
    "callTool",
    "getTools",
    "listResources",
    "readResource",
    "subscribeToResource",
    "VolcanoClient",
    "AgentWorkflowOptions",
    "StepResult",
    "ToolDefinition",
    "LLMProvider",
  ];

  // Add priority methods first
  priorityMethods.forEach((method) => {
    if (content.includes(method)) {
      methods.add(method);
    }
  });

  // Extract function names from code blocks
  const codeBlockRegex = /```(?:typescript|javascript|ts|js)[\s\S]*?```/g;
  const codeBlocks = content.match(codeBlockRegex) || [];

  codeBlocks.forEach((block) => {
    // Look for function calls and definitions
    const functionRegex =
      /(?:function\s+|const\s+|let\s+|var\s+)?(\w+)(?:\s*\(|\s*=\s*(?:async\s*)?\()/g;
    let match;
    while ((match = functionRegex.exec(block)) !== null) {
      if (match[1] && match[1].length > 3) {
        // Skip short names
        methods.add(match[1]);
      }
    }
  });

  return Array.from(methods).slice(0, 10); // Limit to top 10
}

// Extract key concepts from headings and emphasized text
function extractConcepts(content: string): string[] {
  const concepts: Set<string> = new Set();

  // Key Volcano concepts to look for
  const keyTerms = [
    "provider",
    "providers",
    "agent",
    "agents",
    "tool",
    "tools",
    "MCP",
    "Model Context Protocol",
    "workflow",
    "workflows",
    "step",
    "steps",
    "resource",
    "resources",
    "prompt",
    "prompts",
    "streaming",
    "error handling",
    "retry",
    "retries",
    "timeout",
    "observability",
    "hooks",
    "context",
    "state management",
    "configuration",
    "authentication",
  ];

  const contentLower = content.toLowerCase();
  keyTerms.forEach((term) => {
    if (contentLower.includes(term.toLowerCase())) {
      // Capitalize properly
      const formatted = term
        .split(" ")
        .map(
          (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        )
        .join(" ");
      concepts.add(formatted);
    }
  });

  // Extract from headings
  const headingRegex = /^#{1,3}\s+(.+)$/gm;
  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    const heading = match[1].trim();
    if (heading.length > 3 && heading.length < 30 && !heading.includes("#")) {
      concepts.add(heading);
    }
  }

  return Array.from(concepts).slice(0, 8);
}

async function generateSearchSuggestions() {
  const docsDir = path.join(process.cwd(), "src", "content", "docs");
  const outputPath = path.join(
    process.cwd(),
    "src",
    "data",
    "search-suggestions.json"
  );

  // Ensure output directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  // Read all MDX files
  const files = await fs.readdir(docsDir);
  const mdxFiles = files.filter((f) => f.endsWith(".mdx") || f.endsWith(".md"));

  const allAPIMethods: Set<string> = new Set();
  const allConcepts: Set<string> = new Set();
  const quickLinks: SearchSuggestion[] = [];

  for (const file of mdxFiles) {
    const filePath = path.join(docsDir, file);
    const rawContent = await fs.readFile(filePath, "utf-8");
    const { data: frontmatter, content } = matter(rawContent);

    // Extract API methods and concepts
    const methods = extractAPIMethods(content);
    const concepts = extractConcepts(content);

    methods.forEach((m) => allAPIMethods.add(m));
    concepts.forEach((c) => allConcepts.add(c));

    // Build quick links from key documents (skip quickstart as it's part of main docs)
    const fileName = file.replace(/\.mdx?$/, "");
    const docPath = fileName === "index" ? "/docs" : `/docs/${fileName}`;

    // Skip quickstart file since it should be accessed via /docs#quick-start
    if (fileName === "quickstart") {
      continue;
    }

    if (["api", "providers", "mcp-tools", "features"].includes(fileName)) {
      quickLinks.push({
        label:
          frontmatter.title ||
          fileName.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        query: fileName,
        path: docPath,
        description: frontmatter.description,
      });
    }
  }

  // Add Quick Start as first quick link (pointing to main docs)
  quickLinks.unshift({
    label: "Quick Start",
    query: "quick start",
    path: "/docs#quick-start",
    description: "Get started with Volcano Agent SDK in minutes",
  });

  // Build the suggestions object
  const suggestions: SearchSuggestions = {
    quickLinks: quickLinks.sort((a, b) => {
      // Prioritize certain pages
      const priority = [
        "quick start",
        "api",
        "features",
        "providers",
        "mcp-tools",
      ];
      const aIndex = priority.indexOf(a.query);
      const bIndex = priority.indexOf(b.query);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.label.localeCompare(b.label);
    }),

    popular: [
      { label: "Installation", query: "install" },
      { label: "Getting Started", query: "getting started" },
      { label: "Configuration", query: "configuration" },
      { label: "Error Handling", query: "error handling" },
      { label: "Examples", query: "examples" },
      { label: "Authentication", query: "authentication" },
    ],

    api: Array.from(allAPIMethods)
      .slice(0, 8)
      .map((method) => ({
        label: method,
        query: method,
        description: "API Method",
      })),

    concepts: Array.from(allConcepts)
      .filter(
        (c) => !["Table Of Contents", "Installation", "Usage"].includes(c)
      )
      .slice(0, 6)
      .map((concept) => ({
        label: concept,
        query: concept.toLowerCase(),
      })),
  };

  // Write the suggestions file
  await fs.writeFile(outputPath, JSON.stringify(suggestions, null, 2));

  console.log(`✅ Generated search suggestions`);
  console.log(`📝 Output: ${outputPath}`);
  console.log(`\nSuggestions summary:`);
  console.log(`  - ${suggestions.quickLinks.length} quick links`);
  console.log(`  - ${suggestions.popular.length} popular searches`);
  console.log(`  - ${suggestions.api.length} API methods`);
  console.log(`  - ${suggestions.concepts.length} key concepts`);
}

// Run the script
generateSearchSuggestions().catch(console.error);
