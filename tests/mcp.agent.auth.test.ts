import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn } from 'node:child_process';
import { agent, mcp, __internal_clearOAuthTokenCache } from '../src/volcano-agent-sdk.js';

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

describe('Agent-Level MCP Authentication', () => {
  let astroProc: any;
  let authProc: any;
  
  beforeAll(async () => {
    astroProc = startServer('node', ['mcp/astro/server.mjs'], { PORT: '3701' });
    authProc = startServer('node', ['mcp/auth-server/server.mjs'], { PORT: '3702' });
    await waitForOutput(astroProc, /listening on :3701/);
    await waitForOutput(authProc, /listening on :3702/);
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
  
  beforeEach(() => {
    __internal_clearOAuthTokenCache();
  });
  
  describe('agent-level OAuth configuration', () => {
    it('successfully uses agent-level OAuth config for MCP server', async () => {
      // MCP handle without auth
      const authMcp = mcp('http://localhost:3702/mcp');
      
      // Auth configured at agent level
      const results = await agent({ 
        llm: makeMockLLM(),
        hideProgress: true,
        mcpAuth: {
          'http://localhost:3702/mcp': {
            type: 'oauth',
            clientId: 'test-client',
            clientSecret: 'test-secret',
            tokenEndpoint: 'http://localhost:3702/oauth/token'
          }
        }
      })
        .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'Paris' } })
        .run();
      
      expect(results[0].mcp?.result).toBeDefined();
      expect(results[0].mcp?.tool).toBe('get_weather');
    }, 20000);
    
    it('handle-level auth takes precedence over agent-level auth', async () => {
      // Handle with valid auth
      const authMcp = mcp('http://localhost:3702/mcp', {
        auth: {
          type: 'bearer',
          token: 'test-oauth-token-12345'
        }
      });
      
      // Agent has invalid auth (should be ignored)
      const results = await agent({ 
        llm: makeMockLLM(),
        hideProgress: true,
        mcpAuth: {
          'http://localhost:3702/mcp': {
            type: 'bearer',
            token: 'wrong-token'  // This should be ignored
          }
        }
      })
        .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'London' } })
        .run();
      
      expect(results[0].mcp?.result).toBeDefined();
      expect(results[0].mcp?.tool).toBe('get_weather');
    }, 20000);
    
    it('applies different auth to different MCP servers', async () => {
      const astro = mcp('http://localhost:3701/mcp');
      const authMcp = mcp('http://localhost:3702/mcp');
      
      const results = await agent({ 
        llm: makeMockLLM(),
        hideProgress: true,
        mcpAuth: {
          'http://localhost:3702/mcp': {
            type: 'oauth',
            clientId: 'test-client',
            clientSecret: 'test-secret',
            tokenEndpoint: 'http://localhost:3702/oauth/token'
          }
          // No auth for astro server
        }
      })
        .then({ mcp: astro, tool: 'get_sign', args: { birthdate: '1993-07-11' } })
        .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'Tokyo' } })
        .run();
      
      expect(results.length).toBe(2);
      expect(results[0].mcp?.tool).toBe('get_sign');
      expect(results[1].mcp?.tool).toBe('get_weather');
    }, 20000);
    
    it('works with automatic tool selection', async () => {
      const authMcp = mcp('http://localhost:3702/mcp');
      
      const llm: any = {
        id: 'mock',
        model: 'mock',
        client: {},
        gen: async () => 'OK',
        genWithTools: async (_prompt: string, tools: any[]) => {
          // Should have discovered tools
          expect(tools.length).toBeGreaterThan(0);
          const weatherTool = tools.find(t => t.name.includes('get_weather'));
          
          return {
            content: '',
            toolCalls: [{
              name: weatherTool!.name,
              arguments: { city: 'Berlin' },
              mcpHandle: authMcp
            }]
          };
        },
        genStream: async function*(){}
      };
      
      const results = await agent({ 
        llm,
        hideProgress: true,
        mcpAuth: {
          'http://localhost:3702/mcp': {
            type: 'bearer',
            token: 'test-oauth-token-12345'
          }
        }
      })
        .then({ prompt: 'Get weather', mcps: [authMcp] })
        .run();
      
      expect(results[0].toolCalls).toBeDefined();
      expect(results[0].toolCalls!.length).toBeGreaterThan(0);
    }, 20000);
  });
  
  describe('error scenarios with agent-level auth', () => {
    it('fails when agent-level OAuth config is invalid', async () => {
      const authMcp = mcp('http://localhost:3702/mcp');
      
      let error: any;
      try {
        await agent({ 
          llm: makeMockLLM(),
          hideProgress: true,
          mcpAuth: {
            'http://localhost:3702/mcp': {
              type: 'oauth',
              clientId: 'wrong-client',
              clientSecret: 'wrong-secret',
              tokenEndpoint: 'http://localhost:3702/oauth/token'
            }
          }
        })
          .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'Madrid' } })
          .run();
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.message).toMatch(/OAuth token acquisition failed|401/i);
    }, 20000);
    
    it('fails when agent-level OAuth config is incomplete', async () => {
      const authMcp = mcp('http://localhost:3702/mcp');
      
      let error: any;
      try {
        await agent({ 
          llm: makeMockLLM(),
          hideProgress: true,
          mcpAuth: {
            'http://localhost:3702/mcp': {
              type: 'oauth',
              clientId: 'test-client',
              // Missing clientSecret and tokenEndpoint
            } as any
          }
        })
          .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'Barcelona' } })
          .run();
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.message).toMatch(/OAuth|401|unauthorized/i);
    }, 20000);
    
    it('fails when no auth provided for protected server', async () => {
      const authMcp = mcp('http://localhost:3702/mcp');
      
      let error: any;
      try {
        await agent({ 
          llm: makeMockLLM(),
          hideProgress: true
          // No mcpAuth configured
        })
          .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'Rome' } })
          .run();
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.message).toMatch(/401|unauthorized/i);
    }, 20000);
  });
  
  describe('agent-level auth with parallel execution', () => {
    it('applies auth to all parallel MCP calls', async () => {
      const authMcp = mcp('http://localhost:3702/mcp');
      
      const results = await agent({ 
        llm: makeMockLLM(),
        hideProgress: true,
        mcpAuth: {
          'http://localhost:3702/mcp': {
            type: 'bearer',
            token: 'test-oauth-token-12345'
          }
        }
      })
        .parallel([
          { mcp: authMcp, tool: 'get_weather', args: { city: 'Oslo' } },
          { mcp: authMcp, tool: 'get_weather', args: { city: 'Stockholm' } },
          { mcp: authMcp, tool: 'get_weather', args: { city: 'Helsinki' } }
        ])
        .run();
      
      expect(results[0].parallelResults).toBeDefined();
      expect(results[0].parallelResults!.length).toBe(3);
      results[0].parallelResults!.forEach(r => {
        expect(r.mcp?.result).toBeDefined();
      });
    }, 20000);
  });
  
  describe('agent-level auth with run() and onStep', () => {
    it('applies auth in workflows with onStep callback', async () => {
      const authMcp = mcp('http://localhost:3702/mcp');
      
      const streamed: any[] = [];
      await agent({ 
        llm: makeMockLLM(),
        hideProgress: true,
        mcpAuth: {
          'http://localhost:3702/mcp': {
            type: 'oauth',
            clientId: 'test-client',
            clientSecret: 'test-secret',
            tokenEndpoint: 'http://localhost:3702/oauth/token'
          }
        }
      })
        .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'Prague' } })
        .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'Vienna' } })
        .run({ onStep: (step) => streamed.push(step) });
      
      expect(streamed.length).toBe(2);
      streamed.forEach(s => {
        expect(s.mcp?.result).toBeDefined();
      });
    }, 20000);
  });
});
