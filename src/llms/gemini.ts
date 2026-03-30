import type { LLMHandle, LLMToolResult, ToolDefinition } from "./types.js";
import { sanitizeToolName } from "./utils.js";
import { normalizeTokenUsage } from "../token-utils.js";

type GeminiClient = {
  generateContent: (params: any) => Promise<any>;
};

export type GeminiOptions = {
  temperature?: number;
  max_output_tokens?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  candidate_count?: number;
  response_mime_type?: string;
};

export type GeminiClientOptions = {
  retryOnRateLimit?: {
    maxRetries: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
  };
};

export type GeminiConfig = {
  model: string;
  apiKey: string;
  baseURL?: string;
  client?: GeminiClient;
  options?: GeminiOptions;
  clientOptions?: GeminiClientOptions;
};

export function llmGemini(cfg: GeminiConfig): LLMHandle {
  if (!cfg.model) {
    throw new Error(
      "llmGemini: Missing required 'model' parameter. " +
      "Please specify a Gemini model (e.g., 'gemini-3-flash-preview'). " +
      "Example: llmGemini({ model: 'gemini-3-flash-preview', apiKey: 'your-api-key' })"
    );
  }
  if (!cfg.apiKey && !cfg.client) {
    throw new Error(
      "llmGemini: Missing required 'apiKey' parameter. " +
      "Please provide a Google AI Studio API key. " +
      "Example: llmGemini({ model: 'gemini-3-flash-preview', apiKey: 'your-api-key' })"
    );
  }

  const model = cfg.model;
  const baseURL = (cfg.baseURL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  const options = cfg.options || {};
  const clientOptions = cfg.clientOptions || {};
  const retryConfig = clientOptions.retryOnRateLimit;
  let lastUsage: import('./types').TokenUsage | null = null;
  let client = cfg.client;

  if (!client) {
    client = {
      generateContent: async (params: any) => {
        const endpoint = `${baseURL}/models/${model}:generateContent?key=${cfg.apiKey}`;
        const maxRetries = retryConfig?.maxRetries || 0;
        const initialDelayMs = retryConfig?.initialDelayMs || 1000;
        const maxDelayMs = retryConfig?.maxDelayMs || 30000;
        let lastError: any;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(params),
          });

          if (response.ok) {
            return await response.json();
          }

          const text = await response.text();

          if (response.status === 429 && attempt < maxRetries) {
            const exponentialDelay = Math.pow(2, attempt) * initialDelayMs;
            const delay = Math.min(exponentialDelay, maxDelayMs) + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            lastError = { status: response.status, body: text };
            continue;
          }

          const err: any = new Error(`Gemini HTTP ${response.status}`);
          err.status = response.status;
          err.body = text;
          throw err;
        }

        const err: any = new Error(`Gemini HTTP ${lastError?.status || 429} after ${maxRetries} retries`);
        err.status = lastError?.status || 429;
        err.body = lastError?.body;
        throw err;
      },
    } as GeminiClient;
  }

  function buildGenerationConfig() {
    return {
      maxOutputTokens: options.max_output_tokens || 256,
      ...(options.temperature !== undefined && { temperature: options.temperature }),
      ...(options.top_p !== undefined && { topP: options.top_p }),
      ...(options.top_k !== undefined && { topK: options.top_k }),
      ...(options.stop_sequences && { stopSequences: options.stop_sequences }),
      ...(options.candidate_count !== undefined && { candidateCount: options.candidate_count }),
      ...(options.response_mime_type && { responseMimeType: options.response_mime_type }),
    };
  }

  return {
    id: `Gemini-${model}`,
    model,
    client,
    async gen(prompt: string): Promise<string> {
      const params = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: buildGenerationConfig(),
      };

      const resp = await client!.generateContent(params);

      lastUsage = normalizeTokenUsage(resp.usageMetadata);

      const candidates = resp?.candidates || [];
      const content = candidates[0]?.content?.parts || [];
      const text = content.find((part: any) => part?.text)?.text || "";
      return typeof text === "string" ? text : JSON.stringify(text);
    },
    async genWithTools(prompt: string, tools: ToolDefinition[]): Promise<LLMToolResult> {
      const nameMap = new Map<string, { dottedName: string; def: ToolDefinition }>();
      const formattedTools = tools.map((tool) => {
        const dottedName = tool.name;
        const sanitized = sanitizeToolName(dottedName);
        nameMap.set(sanitized, { dottedName, def: tool });

        const cleanParams = { ...tool.parameters };
        delete cleanParams.$schema;
        delete cleanParams.$id;
        delete cleanParams.$ref;

        return {
          functionDeclarations: [{
            name: sanitized,
            description: tool.description,
            parameters: cleanParams,
          }]
        };
      });

      const params = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: formattedTools,
        generationConfig: buildGenerationConfig(),
      };

      const resp = await client!.generateContent(params);

      lastUsage = normalizeTokenUsage(resp.usageMetadata);

      const candidates = resp?.candidates || [];
      const content = candidates[0]?.content?.parts || [];

      const toolCalls: any[] = [];
      let textContent = "";

      for (const part of content) {
        if (part?.functionCall) {
          const functionCall = part.functionCall;
          const sanitizedName = functionCall.name || "";
          const mapped = nameMap.get(sanitizedName);
          toolCalls.push({
            name: mapped?.dottedName ?? sanitizedName,
            arguments: functionCall.args || {},
            mcpHandle: mapped?.def.mcpHandle,
          });
        } else if (part?.text) {
          textContent += part.text;
        }
      }

      return {
        content: textContent || undefined,
        toolCalls,
        usage: lastUsage || undefined
      };
    },
    async *genStream(prompt: string): AsyncGenerator<string, void, unknown> {
      const endpoint = `${baseURL}/models/${model}:streamGenerateContent?alt=sse&key=${cfg.apiKey}`;

      const params = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: buildGenerationConfig(),
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error(`Gemini streaming failed: ${response.status}`);
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
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;
              const jsonStr = trimmed.slice(6);
              if (jsonStr === '[DONE]') continue;

              try {
                const parsed = JSON.parse(jsonStr);
                const text = parsed?.candidates?.[0]?.content?.parts?.find((p: any) => p?.text)?.text;
                if (typeof text === 'string' && text.length > 0) {
                  yield text;
                }
              } catch {
                continue;
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
        return;
      }

      throw new Error('No response body received from Gemini streaming endpoint');
    },
    getUsage: () => lastUsage
  };
}
