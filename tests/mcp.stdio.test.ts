import { describe, it, expect } from 'vitest';
import { mcpStdio, MCPStdioConfig } from '../src/volcano-agent-sdk.js';

describe('MCP stdio transport', () => {
  it('should create stdio MCP handle with correct configuration', () => {
    const config: MCPStdioConfig = {
      command: 'node',
      args: ['test.js'],
      cwd: '/test/dir',
      env: { TEST_VAR: 'value' }
    };
    
    const handle = mcpStdio(config);
    
    expect(handle).toBeDefined();
    expect(handle.id).toBeDefined();
    expect(handle.url).toContain('stdio:');
    expect(handle.transport).toBe('stdio');
    expect(handle.listTools).toBeDefined();
    expect(handle.callTool).toBeDefined();
    expect(handle.cleanup).toBeDefined();
  });

  it('should create unique IDs for different configurations', () => {
    const handle1 = mcpStdio({
      command: 'node',
      args: ['server1.js']
    });
    
    const handle2 = mcpStdio({
      command: 'node',
      args: ['server2.js']
    });
    
    expect(handle1.id).not.toBe(handle2.id);
    expect(handle1.url).not.toBe(handle2.url);
  });

  it('should create same ID for identical configurations', () => {
    const config: MCPStdioConfig = {
      command: 'npx',
      args: ['-y', 'test-server'],
      cwd: '/same/dir'
    };
    
    const handle1 = mcpStdio(config);
    const handle2 = mcpStdio(config);
    
    expect(handle1.id).toBe(handle2.id);
    expect(handle1.url).toBe(handle2.url);
  });

  it('should handle minimal configuration', () => {
    const handle = mcpStdio({
      command: 'node'
    });
    
    expect(handle).toBeDefined();
    expect(handle.transport).toBe('stdio');
  });

  it('should handle configuration with environment variables', () => {
    const handle = mcpStdio({
      command: 'node',
      args: ['server.js'],
      env: {
        API_KEY: 'test-key',
        DEBUG: 'true',
        CUSTOM_VAR: 'value'
      }
    });
    
    expect(handle).toBeDefined();
    expect(handle.id).toBeDefined();
  });
});

