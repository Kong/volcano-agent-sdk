import type { LLMHandle, LLMToolResult, ToolDefinition } from "./types.js";
import { sanitizeToolName, parseToolArguments } from "./utils.js";
import { normalizeTokenUsage } from "../token-utils.js";

type AzureAIClient = {
  createResponse: (params: any) => Promise<any>;
};

export type AzureOptions = {
  // Note: Azure Responses API has very limited parameter support
  // Most parameters from OpenAI Chat Completions are not supported
  max_output_tokens?: number; // Maximum tokens to generate
  seed?: number; // For deterministic outputs
  // The following are NOT supported by Azure Responses API:
  // temperature, top_p, frequency_penalty, presence_penalty, stop, response_format
};

export type AzureConfig = {
  model: string; // Required - no default (e.g., "gpt-5-mini")
  endpoint: string; // Required - Azure resource endpoint
  apiVersion?: string; // Default: "2025-04-01-preview"
  
  // Authentication methods (in priority order)
  apiKey?: string; // API key authentication
  accessToken?: string; // Entra ID access token
  
  // Custom client
  client?: AzureAIClient;
  options?: AzureOptions;
};

export function llmAzure(cfg: AzureConfig): LLMHandle {
  if (!cfg.model) {
    throw new Error(
      "llmAzure: Missing required 'model' parameter. " +
      "Please specify your Azure deployment model name. " +
      "Example: llmAzure({ model: 'gpt-5-mini', endpoint: 'https://...', apiKey: '...' })"
    );
  }
  if (!cfg.endpoint) {
    throw new Error(
      "llmAzure: Missing required 'endpoint' parameter. " +
      "Please specify your Azure OpenAI resource endpoint. " +
      "Example: llmAzure({ model: '...', endpoint: 'https://your-resource.openai.azure.com/openai/responses', apiKey: '...' })"
    );
  }

  const model = cfg.model;
  const endpoint = cfg.endpoint.replace(/\/$/, "");
  const apiVersion = cfg.apiVersion || "2025-04-01-preview";
  const options = cfg.options || {};
  let lastUsage: import('./types').TokenUsage | null = null;
  let client = cfg.client;

  if (!client) {
    client = {
      createResponse: async (params: any) => {
        const url = `${endpoint}?api-version=${apiVersion}`;
        
        // Determine authentication method
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        
        // Priority 1: API Key
        if (cfg.apiKey) {
          headers["api-key"] = cfg.apiKey;
        }
        // Priority 2: Entra ID Access Token
        else if (cfg.accessToken) {
          headers["Authorization"] = `Bearer ${cfg.accessToken}`;
        }
        // Priority 3: Try to get token from Azure SDK (dynamic import)
        else {
          try {
            const { DefaultAzureCredential } = await import('@azure/identity' as any);
            const credential = new DefaultAzureCredential();
            const tokenResponse = await credential.getToken('https://cognitiveservices.azure.com/.default');
            headers["Authorization"] = `Bearer ${tokenResponse.token}`;
          } catch (error: any) {
            if (error.code === 'ERR_MODULE_NOT_FOUND') {
              throw new Error(
                'Azure Identity SDK not found and no explicit credentials provided.\n' +
                'Install with: npm install @azure/identity\n' +
                'Or provide apiKey or accessToken parameters.'
              );
            }
            throw new Error(`Azure authentication failed: ${error.message}`);
          }
        }

        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(params),
        });

        if (!response.ok) {
          const text = await response.text();
          const err: any = new Error(`Azure AI HTTP ${response.status}`);
          err.status = response.status;
          err.body = text;
          throw err;
        }

        if (params.stream) {
          return response; // Return response object for streaming
        }

        return await response.json();
      },
    } as AzureAIClient;
  }

  return {
    id: `Azure-${model}`,
    model,
    client,
    async gen(prompt: string): Promise<string> {
      const params: any = {
        model,
        input: [
          {
            role: "user",
            content: prompt
          }
        ],
        // Azure Responses API only supports max_output_tokens and seed
        ...(options.max_output_tokens !== undefined && { max_output_tokens: options.max_output_tokens }),
        ...(options.seed !== undefined && { seed: options.seed }),
      };

      const resp = await client!.createResponse(params);
      
      lastUsage = normalizeTokenUsage(resp.usage);
      
      const output = resp?.output || [];
      const messageOutput = output.find((item: any) => item?.type === 'message');
      const content = messageOutput?.content || [];
      const text = content.find((item: any) => item?.type === 'output_text')?.text || "";
      return typeof text === "string" ? text : JSON.stringify(text);
    },
    async genWithTools(prompt: string, tools: ToolDefinition[]): Promise<LLMToolResult> {
      const nameMap = new Map<string, { dottedName: string; def: ToolDefinition }>();
      const formattedTools = tools.map((tool) => {
        const dottedName = tool.name;
        const sanitized = sanitizeToolName(dottedName);
        nameMap.set(sanitized, { dottedName, def: tool });
        return {
          type: "function" as const,
          name: sanitized,
          description: tool.description,
          parameters: tool.parameters,
        };
      });

      const params: any = {
        model,
        input: [
          {
            role: "user",
            content: prompt
          }
        ],
        tools: formattedTools,
        tool_choice: "auto",
        // Azure Responses API only supports max_output_tokens and seed
        ...(options.max_output_tokens !== undefined && { max_output_tokens: options.max_output_tokens }),
        ...(options.seed !== undefined && { seed: options.seed }),
      };

      const resp = await client!.createResponse(params);
      
      lastUsage = normalizeTokenUsage(resp.usage);
      
      const output = resp?.output || [];
      
      const toolCalls: any[] = [];
      let textContent = "";

      // Azure puts different types directly in the output array
      for (const item of output) {
        if (item?.type === 'function_call') {
          // Azure function call format
          const sanitizedName = item?.name || "";
          const mapped = nameMap.get(sanitizedName);
          const args = item?.arguments;
          const parsedArgs = typeof args === 'string' ? parseToolArguments(args) : (args || {});
          
          toolCalls.push({
            name: mapped?.dottedName ?? sanitizedName,
            arguments: parsedArgs,
            mcpHandle: mapped?.def.mcpHandle,
            toolHandle: mapped?.def.toolHandle,
          });
        } else if (item?.type === 'message') {
          // Extract text from message content
          const content = item?.content || [];
          for (const contentItem of content) {
            if (contentItem?.type === 'output_text') {
              textContent += contentItem?.text || "";
            }
          }
        }
      }
      
      // Ensure we always have some content even if it's empty string
      const finalContent = textContent || undefined;

      return {
        content: finalContent,
        toolCalls,
        usage: lastUsage || undefined
      };
    },
    async *genStream(prompt: string): AsyncGenerator<string, void, unknown> {
      const url = `${endpoint}?api-version=${apiVersion}`;
      
      const params: any = {
        model,
        input: [
          {
            role: "user",
            content: prompt
          }
        ],
        stream: true,
        // Azure Responses API only supports max_output_tokens and seed
        ...(options.max_output_tokens !== undefined && { max_output_tokens: options.max_output_tokens }),
        ...(options.seed !== undefined && { seed: options.seed }),
      };

      // Determine authentication headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      
      if (cfg.apiKey) {
        headers["api-key"] = cfg.apiKey;
      } else if (cfg.accessToken) {
        headers["Authorization"] = `Bearer ${cfg.accessToken}`;
      } else {
        // Try Azure SDK
        try {
          const { DefaultAzureCredential } = await import('@azure/identity' as any);
          const credential = new DefaultAzureCredential();
          const tokenResponse = await credential.getToken('https://cognitiveservices.azure.com/.default');
          headers["Authorization"] = `Bearer ${tokenResponse.token}`;
        } catch (error: any) {
          throw new Error(`Azure authentication failed for streaming: ${error.message}`);
        }
      }

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error(`Azure AI streaming failed: ${response.status}`);
      }

      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
              if (line.trim() === '' || line.startsWith(':')) continue;
              if (line === 'data: [DONE]') return;
              if (line.startsWith('data: ')) {
                try {
                  const jsonData = line.slice(6);
                  const parsed = JSON.parse(jsonData);
                  
                  // Extract text from Azure response format
                  const output = parsed?.output || [];
                  const messageOutput = output.find((item: any) => item?.type === 'message');
                  const content = messageOutput?.content || [];
                  const textItem = content.find((item: any) => item?.type === 'output_text');
                  const text = textItem?.text;
                  
                  if (typeof text === 'string' && text.length > 0) {
                    yield text;
                  }
                } catch {
                  continue;
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
        return;
      }
      
      throw new Error('No response body received from Azure AI streaming endpoint');
    },
    getUsage: () => lastUsage
  };
}
