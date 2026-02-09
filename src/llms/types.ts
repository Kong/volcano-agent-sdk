export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, any>;
  mcpHandle?: import("../volcano-agent-sdk").MCPHandle;
};

export type TokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type LLMToolResult = {
  content?: string;
  toolCalls: Array<{
    name: string; // dotted name: <handleId>.<toolName>
    arguments: Record<string, any>;
    mcpHandle?: import("../volcano-agent-sdk").MCPHandle;
  }>;
  usage?: TokenUsage;
};

export type LLMHandle = {
  id: string;
  gen: (prompt: string) => Promise<string>;
  genWithTools: (prompt: string, tools: ToolDefinition[]) => Promise<LLMToolResult>;
  genStream: (prompt: string) => AsyncGenerator<string, void, unknown>;
  client: any; // provider-specific client (e.g., OpenAI)
  model: string;
  // Optional: Get usage from last call (for token tracking)
  getUsage?: () => TokenUsage | null;
};
