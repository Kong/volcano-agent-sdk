import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { agent, mcp } from '../src/volcano-agent-sdk.js';

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

function startServer(cmd: string, args: string[], env: Record<string, string | undefined> = {}) {
  const proc = spawn(cmd, args, { env: { ...process.env, ...env } });
  return proc;
}

describe('MCP OAuth Authentication', () => {
  let astroProc: any; // No auth server
  let authProc: any;  // OAuth auth server
  
  beforeAll(async () => {
    // Start regular MCP server (no auth)
    astroProc = startServer('node', ['mcp/astro/server.mjs'], { PORT: '3401' });
    await waitForOutput(astroProc, /listening on :3401/);
    
    // Start OAuth-protected MCP server
    authProc = startServer('node', ['mcp/auth-server/server.mjs'], { PORT: '3402' });
    await waitForOutput(authProc, /listening on :3402/);
  }, 30000);
  
  afterAll(async () => {
    if (astroProc) {
      astroProc.kill('SIGKILL');
      astroProc = null;
    }
    if (authProc) {
      authProc.kill('SIGKILL');
      authProc = null;
    }
    // Give processes time to terminate
    await new Promise(resolve => setTimeout(resolve, 100));
  });
  
  describe('without authentication', () => {
    it('successfully calls non-authenticated MCP server', async () => {
      const astro = mcp('http://localhost:3401/mcp');
      const llm: any = {
        id: 'mock',
        model: 'mock',
        client: {},
        gen: async () => 'OK',
        genWithTools: async () => ({ content: '', toolCalls: [] }),
        genStream: async function*(){}
      };
      
      const results = await agent({ llm, hideProgress: true })
        .then({ mcp: astro, tool: 'get_sign', args: { birthdate: '1993-07-11' } })
        .run();
      
      expect(results[0].mcp?.result).toBeDefined();
      expect(results[0].mcp?.tool).toBe('get_sign');
    }, 20000);
  });
  
  describe('with OAuth authentication', () => {
    it('fails when calling authenticated MCP server without token', async () => {
      const authMcp = mcp('http://localhost:3402/mcp');
      const llm: any = {
        id: 'mock',
        model: 'mock',
        client: {},
        gen: async () => 'OK',
        genWithTools: async () => ({ content: '', toolCalls: [] }),
        genStream: async function*(){}
      };
      
      // This should fail with 401 Unauthorized
      let error: any;
      try {
        await agent({ llm, hideProgress: true })
          .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'San Francisco' } })
          .run();
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.message).toMatch(/401|unauthorized|authentication/i);
    }, 20000);
    
    it('throws MCPConnectionError when discovery fails due to missing auth', async () => {
      const authMcp = mcp('http://localhost:3402/mcp');
      const llm: any = {
        id: 'mock',
        model: 'mock',
        client: {},
        gen: async () => 'OK',
        genWithTools: async () => ({ content: '', toolCalls: [] }),
        genStream: async function*(){}
      };
      
      // Discovery should now throw instead of silently failing
      let error: any;
      try {
        await agent({ llm, hideProgress: true })
          .then({ prompt: 'Get weather for London', mcps: [authMcp] })
          .run();
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.name).toBe('MCPConnectionError');
      expect(error.message).toMatch(/401|unauthorized/i);
    }, 20000);
  });
  
  describe('mixed authenticated and non-authenticated servers', () => {
    it('succeeds on non-auth server but fails on auth server in same workflow', async () => {
      const astro = mcp('http://localhost:3401/mcp');
      const authMcp = mcp('http://localhost:3402/mcp');
      const llm: any = {
        id: 'mock',
        model: 'mock',
        client: {},
        gen: async () => 'OK',
        genWithTools: async () => ({ content: '', toolCalls: [] }),
        genStream: async function*(){}
      };
      
      let error: any;
      try {
        await agent({ llm, hideProgress: true })
          .then({ mcp: astro, tool: 'get_sign', args: { birthdate: '1993-07-11' } })
          .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'New York' } })
          .run();
      } catch (e) {
        error = e;
      }
      
      // First step should succeed, second should fail
      expect(error).toBeDefined();
      expect(error.message).toMatch(/401|unauthorized|authentication/i);
      // The error should indicate it's from step 1 (0-indexed)
      if (error.meta) {
        expect(error.meta.stepId).toBe(1);
      }
    }, 20000);
  });
});