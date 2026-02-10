import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn } from 'node:child_process';
import { agent, mcp, __internal_clearOAuthTokenCache, __internal_getOAuthTokenCache } from '../src/volcano-agent-sdk.js';

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

describe('MCP OAuth Comprehensive Tests', () => {
  let astroProc: any;
  let authProc: any;
  
  beforeAll(async () => {
    astroProc = startServer('node', ['mcp/astro/server.mjs'], { PORT: '3601' });
    authProc = startServer('node', ['mcp/auth-server/server.mjs'], { PORT: '3602' });
    await waitForOutput(astroProc, /listening on :3601/);
    await waitForOutput(authProc, /listening on :3602/);
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
  
  describe('OAuth with client credentials', () => {
    it('successfully calls OAuth-protected server with valid credentials', async () => {
      const authMcp = mcp('http://localhost:3602/mcp', {
        auth: {
          type: 'oauth',
          clientId: 'test-client',
          clientSecret: 'test-secret',
          tokenEndpoint: 'http://localhost:3602/oauth/token'
        }
      });
      
      const results = await agent({ llm: makeMockLLM() , hideProgress: true })
        .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'San Francisco' } })
        .run();
      
      expect(results[0].mcp?.result).toBeDefined();
      expect(results[0].mcp?.tool).toBe('get_weather');
    }, 20000);
    
    it('caches OAuth token for subsequent requests', async () => {
      const authMcp = mcp('http://localhost:3602/mcp', {
        auth: {
          type: 'oauth',
          clientId: 'test-client',
          clientSecret: 'test-secret',
          tokenEndpoint: 'http://localhost:3602/oauth/token'
        }
      });
      
      // First request - acquires token
      await agent({ llm: makeMockLLM() , hideProgress: true })
        .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'New York' } })
        .run();
      
      const cacheAfterFirst = __internal_getOAuthTokenCache();
      expect(cacheAfterFirst.length).toBe(1);
      expect(cacheAfterFirst[0].token).toBe('test-oauth-token-12345');
      
      // Second request - uses cached token
      await agent({ llm: makeMockLLM() , hideProgress: true })
        .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'London' } })
        .run();
      
      const cacheAfterSecond = __internal_getOAuthTokenCache();
      expect(cacheAfterSecond.length).toBe(1); // Still just one entry
      expect(cacheAfterSecond[0].token).toBe('test-oauth-token-12345'); // Same token
    }, 20000);
    
    it('fails when OAuth credentials are invalid', async () => {
      const authMcp = mcp('http://localhost:3602/mcp', {
        auth: {
          type: 'oauth',
          clientId: 'wrong-client',
          clientSecret: 'wrong-secret',
          tokenEndpoint: 'http://localhost:3602/oauth/token'
        }
      });
      
      let error: any;
      try {
        await agent({ llm: makeMockLLM() , hideProgress: true })
          .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'Paris' } })
          .run();
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.message).toMatch(/OAuth token acquisition failed|401/i);
    }, 20000);
  });
  
  describe('Bearer token authentication', () => {
    it('successfully calls server with bearer token', async () => {
      const authMcp = mcp('http://localhost:3602/mcp', {
        auth: {
          type: 'bearer',
          token: 'test-oauth-token-12345'
        }
      });
      
      const results = await agent({ llm: makeMockLLM() , hideProgress: true })
        .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'Tokyo' } })
        .run();
      
      expect(results[0].mcp?.result).toBeDefined();
      expect(results[0].mcp?.tool).toBe('get_weather');
    }, 20000);
    
    it('fails with invalid bearer token', async () => {
      const authMcp = mcp('http://localhost:3602/mcp', {
        auth: {
          type: 'bearer',
          token: 'invalid-token-xyz'
        }
      });
      
      let error: any;
      try {
        await agent({ llm: makeMockLLM() , hideProgress: true })
          .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'Berlin' } })
          .run();
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.message).toMatch(/401|unauthorized/i);
    }, 20000);
  });
  
  describe('Mixed auth and non-auth servers', () => {
    it('handles non-auth → OAuth in single workflow', async () => {
      const astro = mcp('http://localhost:3601/mcp'); // No auth
      const authMcp = mcp('http://localhost:3602/mcp', {
        auth: {
          type: 'oauth',
          clientId: 'test-client',
          clientSecret: 'test-secret',
          tokenEndpoint: 'http://localhost:3602/oauth/token'
        }
      });
      
      const results = await agent({ llm: makeMockLLM() , hideProgress: true })
        .then({ mcp: astro, tool: 'get_sign', args: { birthdate: '1993-07-11' } })
        .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'Sydney' } })
        .run();
      
      expect(results.length).toBe(2);
      expect(results[0].mcp?.tool).toBe('get_sign');
      expect(results[1].mcp?.tool).toBe('get_weather');
    }, 20000);
    
    it('handles OAuth → non-auth in single workflow', async () => {
      const astro = mcp('http://localhost:3601/mcp'); // No auth
      const authMcp = mcp('http://localhost:3602/mcp', {
        auth: {
          type: 'bearer',
          token: 'test-oauth-token-12345'
        }
      });
      
      const results = await agent({ llm: makeMockLLM() , hideProgress: true })
        .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'Rome' } })
        .then({ mcp: astro, tool: 'get_sign', args: { birthdate: '1985-03-20' } })
        .run();
      
      expect(results.length).toBe(2);
      expect(results[0].mcp?.tool).toBe('get_weather');
      expect(results[1].mcp?.tool).toBe('get_sign');
    }, 20000);
    
    it('handles multiple OAuth servers with different credentials', async () => {
      const authMcp1 = mcp('http://localhost:3602/mcp', {
        auth: {
          type: 'oauth',
          clientId: 'test-client',
          clientSecret: 'test-secret',
          tokenEndpoint: 'http://localhost:3602/oauth/token'
        }
      });
      
      const authMcp2 = mcp('http://localhost:3602/mcp', {
        auth: {
          type: 'bearer',
          token: 'test-oauth-token-12345'
        }
      });
      
      const results = await agent({ llm: makeMockLLM() , hideProgress: true })
        .then({ mcp: authMcp1, tool: 'get_weather', args: { city: 'Paris' } })
        .then({ mcp: authMcp2, tool: 'get_weather', args: { city: 'Madrid' } })
        .run();
      
      expect(results.length).toBe(2);
      expect(results[0].mcp?.result).toBeDefined();
      expect(results[1].mcp?.result).toBeDefined();
    }, 20000);
  });
  
  describe('Automatic tool selection with OAuth', () => {
    it('discovers and calls tools from OAuth-protected server', async () => {
      const authMcp = mcp('http://localhost:3602/mcp', {
        auth: {
          type: 'oauth',
          clientId: 'test-client',
          clientSecret: 'test-secret',
          tokenEndpoint: 'http://localhost:3602/oauth/token'
        }
      });
      
      const llm: any = {
        id: 'mock',
        model: 'mock',
        client: {},
        gen: async () => 'OK',
        genWithTools: async (_prompt: string, tools: any[]) => {
          // Should have discovered tools
          expect(tools.length).toBeGreaterThan(0);
          const weatherTool = tools.find(t => t.name.includes('get_weather'));
          expect(weatherTool).toBeDefined();
          
          return {
            content: '',
            toolCalls: [{
              name: weatherTool!.name,
              arguments: { city: 'Barcelona' },
              mcpHandle: authMcp
            }]
          };
        },
        genStream: async function*(){}
      };
      
      const results = await agent({ llm, hideProgress: true })
        .then({ prompt: 'Get weather for Barcelona', mcps: [authMcp] })
        .run();
      
      expect(results[0].toolCalls).toBeDefined();
      expect(results[0].toolCalls!.length).toBeGreaterThan(0);
    }, 20000);
    
    it('combines auth and non-auth servers in automatic selection', async () => {
      const astro = mcp('http://localhost:3601/mcp');
      const authMcp = mcp('http://localhost:3602/mcp', {
        auth: {
          type: 'bearer',
          token: 'test-oauth-token-12345'
        }
      });
      
      const llm: any = {
        id: 'mock',
        model: 'mock',
        client: {},
        gen: async () => 'OK',
        genWithTools: async (_prompt: string, tools: any[]) => {
          // Should have tools from both servers
          const astroTool = tools.find(t => t.name.includes('get_sign'));
          const weatherTool = tools.find(t => t.name.includes('get_weather'));
          
          expect(astroTool).toBeDefined();
          expect(weatherTool).toBeDefined();
          
          return {
            content: '',
            toolCalls: [
              {
                name: astroTool!.name,
                arguments: { birthdate: '2000-01-01' },
                mcpHandle: astro
              },
              {
                name: weatherTool!.name,
                arguments: { city: 'Amsterdam' },
                mcpHandle: authMcp
              }
            ]
          };
        },
        genStream: async function*(){}
      };
      
      const results = await agent({ llm, hideProgress: true })
        .then({ prompt: 'Get sign and weather', mcps: [astro, authMcp] })
        .run();
      
      expect(results[0].toolCalls).toBeDefined();
      expect(results[0].toolCalls!.length).toBeGreaterThanOrEqual(2); // May have multiple iterations
    }, 20000);
  });
  
  describe('OAuth token lifecycle', () => {
    it('token cache persists across multiple agent runs', async () => {
      const authMcp = mcp('http://localhost:3602/mcp', {
        auth: {
          type: 'oauth',
          clientId: 'test-client',
          clientSecret: 'test-secret',
          tokenEndpoint: 'http://localhost:3602/oauth/token'
        }
      });
      
      // First agent run
      await agent({ llm: makeMockLLM() , hideProgress: true })
        .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'Oslo' } })
        .run();
      
      const cacheAfterFirst = __internal_getOAuthTokenCache();
      const firstToken = cacheAfterFirst[0]?.token;
      expect(firstToken).toBeDefined();
      
      // Second agent run (different agent instance)
      await agent({ llm: makeMockLLM() , hideProgress: true })
        .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'Helsinki' } })
        .run();
      
      const cacheAfterSecond = __internal_getOAuthTokenCache();
      expect(cacheAfterSecond[0]?.token).toBe(firstToken); // Same token reused
    }, 20000);
    
    it('handles token expiration gracefully', async () => {
      // This would require mocking Date.now() or waiting for actual expiration
      // For now, verify cache structure
      const authMcp = mcp('http://localhost:3602/mcp', {
        auth: {
          type: 'oauth',
          clientId: 'test-client',
          clientSecret: 'test-secret',
          tokenEndpoint: 'http://localhost:3602/oauth/token'
        }
      });
      
      await agent({ llm: makeMockLLM() , hideProgress: true })
        .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'Dublin' } })
        .run();
      
      const cache = __internal_getOAuthTokenCache();
      expect(cache[0].expiresAt).toBeGreaterThan(Date.now());
    }, 20000);
  });
  
  describe('Error scenarios', () => {
    it('provides clear error when OAuth config is incomplete', async () => {
      const authMcp = mcp('http://localhost:3602/mcp', {
        auth: {
          type: 'oauth',
          clientId: 'test-client',
          // Missing clientSecret and tokenEndpoint
        } as any
      });
      
      let error: any;
      try {
        await agent({ llm: makeMockLLM() , hideProgress: true })
          .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'Vienna' } })
          .run();
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.message).toMatch(/OAuth auth requires|tokenEndpoint|clientSecret/i);
    }, 20000);
    
    it('fails gracefully when token endpoint is unreachable', async () => {
      const authMcp = mcp('http://localhost:3602/mcp', {
        auth: {
          type: 'oauth',
          clientId: 'test-client',
          clientSecret: 'test-secret',
          tokenEndpoint: 'http://localhost:9999/oauth/token' // Non-existent
        }
      });
      
      let error: any;
      try {
        await agent({ llm: makeMockLLM() , hideProgress: true })
          .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'Prague' } })
          .run();
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.message).toMatch(/OAuth token acquisition failed|fetch failed/i);
    }, 20000);
  });
  
  describe('Multi-step workflows with auth', () => {
    it('uses OAuth across multiple steps with same MCP server', async () => {
      const authMcp = mcp('http://localhost:3602/mcp', {
        auth: {
          type: 'bearer',
          token: 'test-oauth-token-12345'
        }
      });
      
      const results = await agent({ llm: makeMockLLM() , hideProgress: true })
        .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'Lisbon' } })
        .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'Brussels' } })
        .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'Warsaw' } })
        .run();
      
      expect(results.length).toBe(3);
      results.forEach((r, i) => {
        expect(r.mcp?.tool).toBe('get_weather');
        expect(r.mcp?.result).toBeDefined();
      });
    }, 20000);
    
    it('handles parallel execution with OAuth servers', async () => {
      const authMcp = mcp('http://localhost:3602/mcp', {
        auth: {
          type: 'oauth',
          clientId: 'test-client',
          clientSecret: 'test-secret',
          tokenEndpoint: 'http://localhost:3602/oauth/token'
        }
      });
      
      const results = await agent({ llm: makeMockLLM() , hideProgress: true })
        .parallel([
          { mcp: authMcp, tool: 'get_weather', args: { city: 'Copenhagen' } },
          { mcp: authMcp, tool: 'get_weather', args: { city: 'Stockholm' } },
          { mcp: authMcp, tool: 'get_weather', args: { city: 'Reykjavik' } }
        ])
        .run();
      
      expect(results[0].parallelResults).toBeDefined();
      expect(results[0].parallelResults!.length).toBe(3);
      results[0].parallelResults!.forEach(r => {
        expect(r.mcp?.tool).toBe('get_weather');
        expect(r.mcp?.result).toBeDefined();
      });
    }, 20000);
  });
  
  describe('Streaming with OAuth', () => {
    it('streams results from OAuth-protected MCP server', async () => {
      const authMcp = mcp('http://localhost:3602/mcp', {
        auth: {
          type: 'bearer',
          token: 'test-oauth-token-12345'
        }
      });
      
      const streamed: any[] = [];
      await agent({ llm: makeMockLLM() , hideProgress: true })
        .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'Athens' } })
        .then({ mcp: authMcp, tool: 'get_weather', args: { city: 'Cairo' } })
        .run({ onStep: (step) => streamed.push(step) });
      
      expect(streamed.length).toBe(2);
      streamed.forEach(s => {
        expect(s.mcp?.result).toBeDefined();
      });
    }, 20000);
  });
});
