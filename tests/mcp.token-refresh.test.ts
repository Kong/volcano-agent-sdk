import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn } from 'node:child_process';
import { agent, mcp, discoverTools, __internal_clearOAuthTokenCache } from '../src/volcano-agent-sdk.js';

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

describe('MCP Automatic Token Refresh', () => {
  let serverProc: any;
  let requestCount = 0;
  let tokenRefreshCount = 0;

  beforeAll(async () => {
    const serverCode = `
import express from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const transports = new Map();
let requestCount = 0;
let tokenRefreshCount = 0;

const VALID_ACCESS_TOKEN = 'access-token-12345';
const VALID_REFRESH_TOKEN = 'refresh-token-67890';
let currentAccessToken = 'expired-token-initial';

function getServer() {
  const server = new McpServer({ name: 'refresh-test-mcp', version: '1.0.0' });
  
  server.tool('test_tool', 'Test tool that requires auth', 
    { message: z.string() }, 
    async ({ message }) => {
      return { content: [{ type: 'text', text: \`Echo: \${message}\` }] };
    }
  );
  
  return server;
}

app.post('/oauth/token', (req, res) => {
  const { grant_type, refresh_token, client_id, client_secret } = req.body;
  
  if (grant_type === 'refresh_token' && 
      refresh_token === VALID_REFRESH_TOKEN &&
      client_id === 'test-client' &&
      client_secret === 'test-secret') {
    
    tokenRefreshCount++;
    currentAccessToken = VALID_ACCESS_TOKEN + '-refreshed-' + tokenRefreshCount;
    
    return res.json({
      access_token: currentAccessToken,
      token_type: 'Bearer',
      expires_in: 3600
    });
  }
  
  res.status(401).json({ error: 'invalid_grant' });
});

app.post('/mcp', async (req, res) => {
  requestCount++;
  const authHeader = req.headers['authorization'];
  
  if (!authHeader || (!authHeader.includes(VALID_ACCESS_TOKEN) && !authHeader.includes('refreshed'))) {
    return res.status(401).json({ 
      error: 'unauthorized', 
      message: 'Invalid or expired token. Request count: ' + requestCount 
    });
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
  
  if (!authHeader || (!authHeader.includes(VALID_ACCESS_TOKEN) && !authHeader.includes('refreshed'))) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  
  const sessionId = req.headers['mcp-session-id'];
  const transport = sessionId ? transports.get(sessionId) : undefined;
  if (!transport) return res.status(400).send('Invalid session');
  await transport.handleRequest(req, res);
});

app.get('/test/stats', (req, res) => {
  res.json({ requestCount, tokenRefreshCount, currentAccessToken });
});

app.post('/test/reset', (req, res) => {
  requestCount = 0;
  tokenRefreshCount = 0;
  currentAccessToken = 'expired-token-initial';
  res.json({ reset: true });
});

const port = 3900;
app.listen(port, () => console.log('[refresh-test-mcp] listening on :' + port));
`;

    serverProc = spawn('node', ['--input-type=module', '-'], { 
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    serverProc.stdin?.write(serverCode);
    serverProc.stdin?.end();
    
    await waitForOutput(serverProc, /listening on :3900/);
    await new Promise(resolve => setTimeout(resolve, 500));
  }, 30000);

  afterAll(() => {
    if (serverProc) {
      serverProc.kill('SIGKILL');
      serverProc = null;
    }
  });

  beforeEach(async () => {
    __internal_clearOAuthTokenCache();
    requestCount = 0;
    tokenRefreshCount = 0;
    await fetch('http://localhost:3900/test/reset', { method: 'POST' }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  it('automatically refreshes expired Bearer token on 401 error', async () => {
    const testMcp = mcp('http://localhost:3900/mcp', {
      auth: {
        type: 'bearer',
        token: 'expired-token-initial',
        refreshToken: 'refresh-token-67890',
        tokenEndpoint: 'http://localhost:3900/oauth/token',
        clientId: 'test-client',
        clientSecret: 'test-secret'
      }
    });

    const results = await agent({ llm: makeMockLLM(), hideProgress: true })
      .then({ mcp: testMcp, tool: 'test_tool', args: { message: 'Hello' } })
      .run();

    expect(results[0].mcp?.result).toBeDefined();
    expect(results[0].mcp?.tool).toBe('test_tool');

    const stats = await fetch('http://localhost:3900/test/stats').then(r => r.json());
    expect(stats.tokenRefreshCount).toBeGreaterThanOrEqual(1);
    expect(stats.currentAccessToken).toContain('refreshed');
  }, 20000);

  it('uses refresh token when initially connecting with expired token', async () => {
    const testMcp = mcp('http://localhost:3900/mcp', {
      auth: {
        type: 'bearer',
        token: 'expired-token-initial',
        refreshToken: 'refresh-token-67890',
        tokenEndpoint: 'http://localhost:3900/oauth/token',
        clientId: 'test-client',
        clientSecret: 'test-secret'
      }
    });

    const tools = await discoverTools([testMcp]);
    
    expect(tools.length).toBeGreaterThan(0);
    expect(tools[0].name).toContain('test_tool');
  }, 20000);

  it('automatically refreshes token during automatic tool selection', async () => {
    const testMcp = mcp('http://localhost:3900/mcp', {
      auth: {
        type: 'bearer',
        token: 'expired-token-initial',
        refreshToken: 'refresh-token-67890',
        tokenEndpoint: 'http://localhost:3900/oauth/token',
        clientId: 'test-client',
        clientSecret: 'test-secret'
      }
    });

    const llm: any = {
      id: 'mock',
      model: 'mock',
      client: {},
      gen: async () => 'OK',
      genWithTools: async (_prompt: string, tools: any[]) => {
        const testTool = tools.find(t => t.name.includes('test_tool'));
        if (testTool) {
          return {
            content: '',
            toolCalls: [{ 
              name: testTool.name, 
              arguments: { message: 'auto-test' }, 
              mcpHandle: testMcp 
            }]
          };
        }
        return { content: 'Done', toolCalls: [] };
      },
      genStream: async function*(){}
    };

    const results = await agent({ llm, hideProgress: true })
      .then({ 
        prompt: 'Use the test tool', 
        mcps: [testMcp],
        maxToolIterations: 2
      })
      .run();

    expect(results[0].toolCalls).toBeDefined();
    expect(results[0].toolCalls!.length).toBeGreaterThan(0);

    const stats = await fetch('http://localhost:3900/test/stats').then(r => r.json());
    expect(stats.tokenRefreshCount).toBeGreaterThanOrEqual(1);
  }, 20000);

  it('fails gracefully when refresh token is invalid', async () => {
    const testMcp = mcp('http://localhost:3900/mcp', {
      auth: {
        type: 'bearer',
        token: 'expired-token',
        refreshToken: 'invalid-refresh-token',
        tokenEndpoint: 'http://localhost:3900/oauth/token',
        clientId: 'test-client',
        clientSecret: 'test-secret'
      }
    });

    let error: any;
    try {
      await agent({ llm: makeMockLLM(), hideProgress: true })
        .then({ mcp: testMcp, tool: 'test_tool', args: { message: 'test' } })
        .run();
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toMatch(/401|unauthorized|token.*failed/i);
  }, 20000);

  it('works without refresh token (backward compatibility)', async () => {
    const testMcp = mcp('http://localhost:3900/mcp', {
      auth: {
        type: 'bearer',
        token: 'access-token-12345'
      }
    });

    const results = await agent({ llm: makeMockLLM(), hideProgress: true })
      .then({ mcp: testMcp, tool: 'test_tool', args: { message: 'no-refresh' } })
      .run();

    expect(results[0].mcp?.result).toBeDefined();

    const stats = await fetch('http://localhost:3900/test/stats').then(r => r.json());
    expect(stats.tokenRefreshCount).toBe(0);
  }, 20000);
});

