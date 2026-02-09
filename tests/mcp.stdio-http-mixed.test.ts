import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mcpStdio, mcp } from '../src/volcano-agent-sdk.js';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import type { Server } from 'http';

// Create HTTP MCP server
function createHTTPServer(port: number): { server: Server; mcp: () => ReturnType<typeof mcp> } {
  const app = express();
  app.use(express.json());
  app.use(cors({ origin: '*', exposedHeaders: ['Mcp-Session-Id'] }));

  const transports = new Map();

  function getRemoteServer() {
    const server = new McpServer({ name: 'test-http-remote', version: '1.0.0' });

    server.tool(
      'remote_greet',
      'Generate a remote greeting',
      { name: z.string().describe('Name to greet') },
      async ({ name }) => {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ greeting: `[REMOTE] Hello, ${name}!` })
          }]
        };
      }
    );

    server.tool(
      'remote_fetch',
      'Fetch remote data',
      { resource: z.string().describe('Resource ID') },
      async ({ resource }) => {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              data: `Remote data for ${resource}`,
              source: 'remote-http'
            })
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
      const server = getRemoteServer();
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

  const server = app.listen(port);
  
  return {
    server,
    mcp: () => mcp(`http://localhost:${port}/mcp`)
  };
}

describe('MCP stdio + HTTP mixed transport', () => {
  let httpServer: Server;
  let httpMcp: ReturnType<typeof mcp>;
  const HTTP_PORT = 18123;

  beforeAll(async () => {
    const httpSetup = createHTTPServer(HTTP_PORT);
    httpServer = httpSetup.server;
    httpMcp = httpSetup.mcp();
    
    // Wait for HTTP server to be ready
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  afterAll(async () => {
    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }
  });

  it('should create both stdio and HTTP handles with different transports', () => {
    const stdioHandle = mcpStdio({
      command: 'node',
      args: ['server.js']
    });

    const httpHandle = mcp(`http://localhost:${HTTP_PORT}/mcp`);

    expect(stdioHandle.transport).toBe('stdio');
    expect(httpHandle.transport).toBe('http');
    expect(stdioHandle.id).not.toBe(httpHandle.id);
  });

  it('should list tools from HTTP MCP server', async () => {
    const httpTools = await httpMcp.listTools();

    expect(httpTools.tools).toBeDefined();
    expect(httpTools.tools.length).toBeGreaterThan(0);
    
    const httpToolNames = httpTools.tools.map(t => t.name);
    expect(httpToolNames).toContain('remote_greet');
    expect(httpToolNames).toContain('remote_fetch');
  }, 15000);

  it('should call tools from HTTP MCP server', async () => {
    const remoteResult = await httpMcp.callTool('remote_greet', { name: 'Bob' });
    expect(remoteResult).toBeDefined();
    expect(JSON.stringify(remoteResult)).toContain('REMOTE');
  }, 15000);

  it('should allow mixing stdio and HTTP handles in configuration', () => {
    const stdioMcp = mcpStdio({
      command: 'npx',
      args: ['-y', 'test-server'],
      env: { API_KEY: 'test' }
    });
    
    const remoteMcp = mcp('https://api.example.com/mcp');
    
    // Both should have compatible interfaces
    expect(typeof stdioMcp.listTools).toBe('function');
    expect(typeof stdioMcp.callTool).toBe('function');
    expect(typeof remoteMcp.listTools).toBe('function');
    expect(typeof remoteMcp.callTool).toBe('function');
    
    // But different transports
    expect(stdioMcp.transport).toBe('stdio');
    expect(remoteMcp.transport).toBe('http');
  });
});

