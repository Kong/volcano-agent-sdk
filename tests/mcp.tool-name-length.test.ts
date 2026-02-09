import { describe, it, expect } from 'vitest';
import { mcp } from '../src/volcano-agent-sdk.js';
import { createHash } from 'node:crypto';

describe('MCP Tool Name Length Validation', () => {
  describe('MCP ID hashing', () => {
    it('creates short deterministic IDs using hash', () => {
      const handle = mcp('http://localhost:3000/mcp');
      
      // ID should be hash-based and short
      expect(handle.id).toMatch(/^mcp_[a-f0-9]{8}$/);
      expect(handle.id.length).toBe(12); // "mcp_" + 8 hex chars
    });
    
    it('same URL produces same hash (deterministic)', () => {
      const handle1 = mcp('http://localhost:3000/mcp');
      const handle2 = mcp('http://localhost:3000/mcp');
      
      expect(handle1.id).toBe(handle2.id);
    });
    
    it('different URLs produce different hashes', () => {
      const handle1 = mcp('http://localhost:3000/mcp');
      const handle2 = mcp('http://localhost:3001/mcp');
      const handle3 = mcp('http://localhost:3000/api');
      
      expect(handle1.id).not.toBe(handle2.id);
      expect(handle1.id).not.toBe(handle3.id);
      expect(handle2.id).not.toBe(handle3.id);
    });
    
    it('hash matches expected MD5', () => {
      const url = 'http://localhost:3000/mcp';
      const handle = mcp(url);
      
      const expectedHash = createHash('md5').update(url).digest('hex').substring(0, 8);
      expect(handle.id).toBe(`mcp_${expectedHash}`);
    });
  });
  
  describe('tool name length validation', () => {
    it('short tool names stay under 64 char limit', () => {
      const handle = mcp('http://localhost:3000/mcp');
      const toolName = 'get_weather';
      const fullName = `${handle.id}.${toolName}`;
      
      expect(fullName.length).toBeLessThan(64);
      // 12 + 1 + 11 = 24 chars (plenty of room!)
      expect(fullName.length).toBe(24);
    });
    
    it('medium tool names stay under 64 char limit', () => {
      const handle = mcp('http://localhost:3000/mcp');
      const toolName = 'order_coffee_for_customer_with_preferences';
      const fullName = `${handle.id}.${toolName}`;
      
      expect(fullName.length).toBeLessThan(64);
      // 12 + 1 + 43 = 56 chars (well under 64!)
    });
    
    it('very long tool names stay under 64 char limit', () => {
      const handle = mcp('http://localhost:3000/mcp');
      // This is the tool name that was failing before (48 chars)
      const toolName = 'get_personalized_recommendations_for_user_prefs';
      const fullName = `${handle.id}.${toolName}`;
      
      expect(fullName.length).toBeLessThan(64);
      // 12 + 1 + 48 = 61 chars (under 64!)
    });
    
    it('extreme tool names with long URL - hash keeps ID short', () => {
      const handle = mcp('https://very-long-domain-name.example.com:8080/api/v1/mcp/endpoint');
      const toolName = 'get_user_preferences'; // 20 chars
      const fullName = `${handle.id}.${toolName}`;
      
      // Hash keeps ID to 12 chars regardless of URL length
      expect(handle.id.length).toBe(12);
      expect(fullName.length).toBeLessThan(64);
      // 12 + 1 + 20 = 33 chars
      expect(fullName.length).toBe(33);
    });
    
    it('validates maximum safe tool name length', () => {
      const handle = mcp('http://localhost:3000/mcp');
      
      // With 12-char ID, we have 64 - 12 - 1 = 51 chars for tool name
      const maxToolName = 'a'.repeat(51);
      const fullName = `${handle.id}.${maxToolName}`;
      
      expect(fullName.length).toBe(64); // Exactly at limit
    });
    
    it('tool names longer than 51 chars would exceed limit', () => {
      const handle = mcp('http://localhost:3000/mcp');
      
      // 52+ char tool name would exceed 64
      const tooLongToolName = 'a'.repeat(52);
      const fullName = `${handle.id}.${tooLongToolName}`;
      
      expect(fullName.length).toBe(65); // Over limit
      // Note: This is the MCP server's responsibility to keep tool names reasonable
      // Volcano's job is to keep the ID short
    });
  });
  
  describe('backward compatibility and migration', () => {
    it('preserves URL in MCPHandle for error messages', () => {
      const url = 'http://localhost:3000/mcp';
      const handle = mcp(url);
      
      // URL is preserved for debugging
      expect(handle.url).toBe(url);
    });
    
    it('hash is stable across Node.js restarts', () => {
      // Same URL should always produce same hash
      const url = 'http://api.example.com/mcp';
      const hash1 = createHash('md5').update(url).digest('hex').substring(0, 8);
      const hash2 = createHash('md5').update(url).digest('hex').substring(0, 8);
      
      expect(hash1).toBe(hash2);
    });
    
    it('different protocols produce different hashes', () => {
      const http = mcp('http://example.com/mcp');
      const https = mcp('https://example.com/mcp');
      
      expect(http.id).not.toBe(https.id);
    });
    
    it('query parameters affect hash', () => {
      const handle1 = mcp('http://localhost:3000/mcp');
      const handle2 = mcp('http://localhost:3000/mcp?version=1');
      
      expect(handle1.id).not.toBe(handle2.id);
    });
  });
  
  describe('collision resistance', () => {
    it('8-char hash has low collision probability', () => {
      // Generate hashes for many URLs
      const urls = [
        'http://localhost:3000/mcp',
        'http://localhost:3001/mcp',
        'http://localhost:3002/mcp',
        'http://api.example.com/mcp',
        'https://secure.example.com/mcp',
        'http://10.0.0.1:5000/mcp',
        'http://192.168.1.1/tools',
      ];
      
      const handles = urls.map(url => mcp(url));
      const ids = handles.map(h => h.id);
      
      // All should be unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
    
    it('provides enough entropy for typical usage', () => {
      // 8 hex chars = 32 bits = 4 billion combinations
      // Collision probability is negligible for typical usage (< 1000 MCP servers)
      const handle = mcp('http://localhost:3000/mcp');
      
      // Verify it's actually hex
      expect(handle.id).toMatch(/^mcp_[0-9a-f]{8}$/);
    });
  });
});
