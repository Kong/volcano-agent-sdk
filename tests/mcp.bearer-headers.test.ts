import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { agent, mcp, discoverTools } from '../src/volcano-agent-sdk.js';

function waitForOutput(proc: any, match: RegExp, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for: ${match}`)), timeoutMs);
    const handler = (data: Buffer) => {
      if (match.test(data.toString())) {
        clearTimeout(timer);
        proc.stdout?.off('data', handler);
        proc.stderr?.off('data', handler);
        resolve(true);
      }
    };
    proc.stdout?.on('data', handler);
    proc.stderr?.on('data', handler);
  });
}

function makeMockLLM() {
  return {
    id: 'mock',
    model: 'mock',
    client: {},
    gen: async () => 'OK',
    genWithTools: async () => ({ content: '', toolCalls: [] }),
    genStream: async function*(){}
  } as any;
}

describe('MCP Bearer Token Header Validation', () => {
  let serverProc: any;
  let capturedHeaders: Record<string, string>[] = [];

  beforeAll(async () => {
    const serverCode = `
import express from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const app = express();
app.use(express.json());

const transports = new Map();
const capturedHeaders = [];

app.use((req, res, next) => {
  capturedHeaders.push({
    authorization: req.headers['authorization'] || '',
    contentType: req.headers['content-type'] || '',
    accept: req.headers['accept'] || '',
    path: req.path,
    method: req.method
  });
  next();
});

function getServer() {
  const server = new McpServer({ name: 'header-test-mcp', version: '1.0.0' });
  
  server.tool('echo', 'Echo back a message', { message: z.string() }, async ({ message }) => {
    return { content: [{ type: 'text', text: message }] };
  });
  
  return server;
}

app.post('/mcp', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || authHeader !== 'Bearer test-token-12345') {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid or missing Bearer token' });
  }

  const sessionId = req.headers['mcp-session-id'];
  let transport = sessionId ? transports.get(sessionId) : undefined;
  
  if (!transport) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => { transports.set(sid, transport); }
    });
    const server = getServer();
    await server.connect(transport);
  }
  
  await transport.handleRequest(req, res, req.body);
});

app.get('/mcp', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || authHeader !== 'Bearer test-token-12345') {
    return res.status(401).json({ error: 'unauthorized' });
  }
  
  const sessionId = req.headers['mcp-session-id'];
  const transport = sessionId ? transports.get(sessionId) : undefined;
  if (!transport) return res.status(400).send('Invalid session');
  await transport.handleRequest(req, res);
});

app.get('/test/headers', (req, res) => {
  res.json(capturedHeaders);
});

const port = 3850;
app.listen(port, () => console.log('[header-test-mcp] listening on :' + port));
`;

    serverProc = spawn('node', ['--input-type=module', '-'], { 
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    serverProc.stdin?.write(serverCode);
    serverProc.stdin?.end();
    
    await waitForOutput(serverProc, /listening on :3850/);
  }, 30000);

  afterAll(() => {
    if (serverProc) {
      serverProc.kill('SIGKILL');
      serverProc = null;
    }
  });

  it('sends correct Authorization: Bearer header to MCP server', async () => {
    const testMcp = mcp('http://localhost:3850/mcp', {
      auth: {
        type: 'bearer',
        token: 'test-token-12345'
      }
    });

    const results = await agent({ llm: makeMockLLM(), hideProgress: true })
      .then({ mcp: testMcp, tool: 'echo', args: { message: 'Hello' } })
      .run();

    expect(results[0].mcp?.result).toBeDefined();
    expect(results[0].mcp?.tool).toBe('echo');

    const headers = await fetch('http://localhost:3850/test/headers').then(r => r.json());
    
    const postRequests = headers.filter((h: any) => h.method === 'POST');
    expect(postRequests.length).toBeGreaterThan(0);
    
    const authHeaders = postRequests.filter((h: any) => h.authorization);
    expect(authHeaders.length).toBeGreaterThan(0);
    
    authHeaders.forEach((h: any) => {
      expect(h.authorization).toBe('Bearer test-token-12345');
    });
  }, 20000);

  it('sends Bearer header during tool discovery (discoverTools)', async () => {
    const testMcp = mcp('http://localhost:3850/mcp', {
      auth: {
        type: 'bearer',
        token: 'test-token-12345'
      }
    });

    const tools = await discoverTools([testMcp]);
    
    expect(tools.length).toBeGreaterThan(0);
    expect(tools[0].name).toContain('echo');

    const headers = await fetch('http://localhost:3850/test/headers').then(r => r.json());
    const authHeaders = headers.filter((h: any) => h.authorization === 'Bearer test-token-12345');
    
    expect(authHeaders.length).toBeGreaterThan(0);
  }, 20000);

  it('sends Bearer header during automatic tool selection', async () => {
    const testMcp = mcp('http://localhost:3850/mcp', {
      auth: {
        type: 'bearer',
        token: 'test-token-12345'
      }
    });

    const llm: any = {
      id: 'mock',
      model: 'mock',
      client: {},
      gen: async () => 'OK',
      genWithTools: async (_prompt: string, tools: any[]) => {
        const echoTool = tools.find(t => t.name.includes('echo'));
        if (echoTool) {
          return {
            content: '',
            toolCalls: [{ 
              name: echoTool.name, 
              arguments: { message: 'test' }, 
              mcpHandle: testMcp 
            }]
          };
        }
        return { content: 'No tools', toolCalls: [] };
      },
      genStream: async function*(){}
    };

    const results = await agent({ llm, hideProgress: true })
      .then({ 
        prompt: 'Use the echo tool', 
        mcps: [testMcp],
        maxToolIterations: 2
      })
      .run();

    expect(results[0].toolCalls).toBeDefined();
    expect(results[0].toolCalls!.length).toBeGreaterThan(0);

    const headers = await fetch('http://localhost:3850/test/headers').then(r => r.json());
    const authHeaders = headers.filter((h: any) => h.authorization === 'Bearer test-token-12345');
    
    expect(authHeaders.length).toBeGreaterThan(0);
  }, 20000);

  it('fails with helpful error when Bearer token is wrong', async () => {
    const testMcp = mcp('http://localhost:3850/mcp', {
      auth: {
        type: 'bearer',
        token: 'wrong-token'
      }
    });

    let error: any;
    try {
      await agent({ llm: makeMockLLM(), hideProgress: true })
        .then({ mcp: testMcp, tool: 'echo', args: { message: 'test' } })
        .run();
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toMatch(/401|unauthorized/i);
    expect(error.name).toMatch(/MCP(Connection|Tool)Error/);
  }, 20000);
});

