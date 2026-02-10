import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { agent, llmOpenAI, mcp } from '../src/volcano-agent-sdk.js';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import type { Server } from 'http';

function createTestServer(port: number): Server {
  const app = express();
  app.use(express.json());
  app.use(cors({ origin: '*', exposedHeaders: ['Mcp-Session-Id'] }));

  const transports = new Map();

  function getServer() {
    const server = new McpServer({ name: 'test-server', version: '1.0.0' });

    server.tool(
      'get_user',
      'Get user information',
      { userId: z.string().describe('User ID') },
      async ({ userId }) => {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ id: userId, name: `User ${userId}`, email: `${userId}@example.com` })
          }]
        };
      }
    );

    server.tool(
      'send_notification',
      'Send a notification',
      { 
        message: z.string().describe('Message to send'),
        userId: z.string().describe('User ID')
      },
      async ({ message, userId }) => {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ sent: true, message, userId, timestamp: Date.now() })
          }]
        };
      }
    );

    return server;
  }

  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] || randomUUID();
    let transport = transports.get(sessionId);
    if (!transport) {
      transport = new StreamableHTTPServerTransport('/mcp', res, sessionId);
      transports.set(sessionId, transport);
      const server = getServer();
      await server.connect(transport);
    }
    await transport.handleRequest(req, res, req.body);
  });

  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) return res.status(400).send('Invalid session');
    await transport.handleRequest(req, res);
  });

  return app.listen(port);
}

describe('onToolCall callback', () => {
  const PORT = 18456;
  let server: Server;
  let testMcp: ReturnType<typeof mcp>;

  beforeAll(async () => {
    server = createTestServer(PORT);
    testMcp = mcp(`http://localhost:${PORT}/mcp`);
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  it('should call onToolCall callback for each tool call', async () => {
    if (!process.env.OPENAI_API_KEY) {
      console.log('Skipping test - OPENAI_API_KEY not set');
      return;
    }

    const llm = llmOpenAI({ 
      apiKey: process.env.OPENAI_API_KEY, 
      model: 'gpt-4o-mini' 
    });

    const toolCalls: Array<{ name: string; args: any; result: any }> = [];

    await agent({ llm })
      .then({
        prompt: 'Get information for user "alice"',
        mcps: [testMcp],
        maxToolIterations: 2,
        onToolCall: (toolName, args, result) => {
          toolCalls.push({ name: toolName, args, result });
        }
      })
      .run();

    expect(toolCalls.length).toBeGreaterThan(0);
    expect(toolCalls[0].name).toContain('get_user');
    expect(toolCalls[0].args).toBeDefined();
    expect(toolCalls[0].result).toBeDefined();
  }, 15000);

  it('should call onToolCall for multiple tool calls', async () => {
    if (!process.env.OPENAI_API_KEY) {
      console.log('Skipping test - OPENAI_API_KEY not set');
      return;
    }

    const llm = llmOpenAI({ 
      apiKey: process.env.OPENAI_API_KEY, 
      model: 'gpt-4o-mini' 
    });

    const toolCalls: Array<{ name: string; args: any }> = [];

    await agent({ llm })
      .then({
        prompt: 'Get user "bob" and send them a notification saying "Hello"',
        mcps: [testMcp],
        maxToolIterations: 3,
        onToolCall: (toolName, args) => {
          toolCalls.push({ name: toolName, args });
        }
      })
      .run();

    // Should have called at least 2 tools (get_user and send_notification)
    expect(toolCalls.length).toBeGreaterThanOrEqual(2);
    
    const toolNames = toolCalls.map(tc => tc.name.split('.').pop());
    expect(toolNames).toContain('get_user');
    expect(toolNames).toContain('send_notification');
  }, 15000);

  it('should call onToolCall in real-time before step completion', async () => {
    if (!process.env.OPENAI_API_KEY) {
      console.log('Skipping test - OPENAI_API_KEY not set');
      return;
    }

    const llm = llmOpenAI({ 
      apiKey: process.env.OPENAI_API_KEY, 
      model: 'gpt-4o-mini' 
    });

    const timestamps: number[] = [];
    let stepCompleteTime = 0;

    await agent({ llm })
      .then({
        prompt: 'Get user "charlie"',
        mcps: [testMcp],
        maxToolIterations: 2,
        onToolCall: () => {
          timestamps.push(Date.now());
        }
      })
      .run(() => {
        stepCompleteTime = Date.now();
      });

    // onToolCall should have been called BEFORE the run callback
    expect(timestamps.length).toBeGreaterThan(0);
    expect(timestamps[0]).toBeLessThan(stepCompleteTime);
  }, 15000);

  it('should handle errors in onToolCall callback gracefully', async () => {
    if (!process.env.OPENAI_API_KEY) {
      console.log('Skipping test - OPENAI_API_KEY not set');
      return;
    }

    const llm = llmOpenAI({ 
      apiKey: process.env.OPENAI_API_KEY, 
      model: 'gpt-4o-mini' 
    });

    // Callback that throws error
    const errorCallback = () => {
      throw new Error('Callback error!');
    };

    // Should not throw - errors in callback should be caught
    await expect(
      agent({ llm })
        .then({
          prompt: 'Get user "dave"',
          mcps: [testMcp],
          maxToolIterations: 2,
          onToolCall: errorCallback
        })
        .run()
    ).resolves.toBeDefined();
  }, 15000);

  it('should work with onToolCall and onToken together', async () => {
    if (!process.env.OPENAI_API_KEY) {
      console.log('Skipping test - OPENAI_API_KEY not set');
      return;
    }

    const llm = llmOpenAI({ 
      apiKey: process.env.OPENAI_API_KEY, 
      model: 'gpt-4o-mini' 
    });

    const toolCalls: string[] = [];
    const tokens: string[] = [];

    await agent({ llm, hideProgress: true })
      .then({
        prompt: 'Get user "eve"',
        mcps: [testMcp],
        maxToolIterations: 2,
        onToolCall: (toolName) => {
          toolCalls.push(toolName);
        }
      })
      .then({
        prompt: 'Say exactly: The user has been retrieved',
        onToken: (token) => {
          tokens.push(token);
        }
      })
      .run();

    expect(toolCalls.length).toBeGreaterThan(0);
    expect(tokens.length).toBeGreaterThan(0);
  }, 30000);
});

