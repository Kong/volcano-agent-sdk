import { describe, it, expect } from 'vitest';
import { mcp, discoverTools, __internal_primeDiscoveryCache } from '../src/volcano-agent-sdk.js';

describe('OpenAI 64-Character Tool Name Limit', () => {
  it('tool names stay under OpenAI 64-char limit with new hash-based IDs', () => {
    const handle = mcp('http://localhost:3000/mcp');
    
    // Simulate various realistic tool names (MCP servers should keep names ≤ 51 chars)
    const toolNames = [
      'get_weather', // 11 chars
      'order_coffee', // 12 chars
      'send_notification_to_user', // 26 chars
      'query_database_for_user_records', // 32 chars
      'order_coffee_for_customer_with_preferences', // 43 chars
      'get_personalized_recommendations_for_users' // 43 chars
    ];
    
    toolNames.forEach(toolName => {
      const fullName = `${handle.id}.${toolName}`;
      
      // All should be 64 chars or less
      expect(fullName.length).toBeLessThanOrEqual(64);
      
      // Log for visibility
      if (fullName.length > 60) {
        console.log(`⚠️  Close to limit: ${fullName} (${fullName.length} chars)`);
      }
    });
  });
  
  it('previously failing tool name now works', () => {
    const handle = mcp('http://localhost:3000/mcp');
    
    // Even with a 48-char tool name:
    const longToolName = 'order_specialty_coffee_with_customer_preferences'; // 48 chars
    const fullName = `${handle.id}.${longToolName}`;
    
    expect(handle.id.length).toBe(12); // mcp_XXXXXXXX
    expect(fullName.length).toBe(61); // 12 + 1 + 48 = 61 (under 64!)
    expect(fullName.length).toBeLessThan(64);
  });
  
  it('maximum safe tool name is now 51 characters', () => {
    const handle = mcp('http://localhost:3000/mcp');
    
    // With 12-char ID: 64 - 12 - 1 (dot) = 51 chars available
    const maxToolName = 'a'.repeat(51);
    const fullName = `${handle.id}.${maxToolName}`;
    
    expect(fullName.length).toBe(64); // Exactly at limit
  });
  
  it('tool discovery returns correctly formatted names', async () => {
    const handle = mcp('http://localhost:5000/mcp');
    
    // Prime cache with mock tools (use reasonable length)
    __internal_primeDiscoveryCache(handle, [
      { 
        name: 'get_personalized_recommendations', // 30 chars
        description: 'Test tool',
        inputSchema: { type: 'object', properties: {} }
      }
    ]);
    
    const tools = await discoverTools([handle]);
    
    expect(tools.length).toBe(1);
    
    // Tool name should be prefixed with hash-based ID
    expect(tools[0].name).toMatch(/^mcp_[a-f0-9]{8}\./);
    expect(tools[0].name.length).toBeLessThanOrEqual(64);
    // 12 + 1 + 30 = 43 chars (well under limit)
  });
  
  it('validates old long-ID format would have failed', () => {
    // Demonstrate the old format problem
    const url = 'http://localhost:3000/mcp';
    const oldId = 'localhost_3000_mcp'; // 18 chars (old format)
    const toolName = 'order_coffee_for_customer_with_specific_preferences'; // 51 chars
    const oldFullName = `${oldId}.${toolName}`;
    
    // Old format: 18 + 1 + 51 = 70 chars (OVER LIMIT!)
    expect(oldFullName.length).toBe(70);
    expect(oldFullName.length).toBeGreaterThan(64); // Would fail with OpenAI
    
    // New format with hash
    const handle = mcp(url);
    const newFullName = `${handle.id}.${toolName}`;
    
    // New format: 12 + 1 + 51 = 64 chars (EXACTLY at limit!)
    expect(newFullName.length).toBe(64);
    expect(newFullName.length).toBeLessThanOrEqual(64); // Works!
  });
});
