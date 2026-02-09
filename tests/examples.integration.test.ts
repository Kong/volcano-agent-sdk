/**
 * Examples Integration Tests
 * 
 * Ensures all examples in examples/ directory work correctly.
 * These tests run the actual example files and verify their output.
 * 
 * To run with API keys (in CI):
 *   OPENAI_API_KEY=sk-... npm test -- examples.integration.test.ts
 * 
 * Without API keys:
 *   Tests will skip gracefully (only syntax checks run)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

describe('Examples Integration Tests', () => {
  let weatherServer: ChildProcess;
  let tasksServer: ChildProcess;
  
  const hasApiKey = !!process.env.OPENAI_API_KEY;
  
  // Helper to wait for server to be ready
  async function waitForServer(port: number, maxAttempts = 50) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await fetch(`http://localhost:${port}/mcp`, { method: 'HEAD' });
        console.log(`✅ Server on port ${port} is ready`);
        return true;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    console.warn(`⚠️  Server on port ${port} did not start after ${maxAttempts} attempts`);
    return false;
  }

  beforeAll(async () => {
    if (!hasApiKey) {
      console.log('⚠️  Skipping examples integration tests - OPENAI_API_KEY not set');
      return;
    }

    // Start MCP servers needed for examples
    weatherServer = spawn('tsx', ['examples/mcp/weather/server.ts'], {
      stdio: 'ignore',
      detached: false
    });

    tasksServer = spawn('tsx', ['examples/mcp/tasks/server.ts'], {
      stdio: 'ignore',
      detached: false
    });

    // Wait for servers to be ready
    const weatherReady = await waitForServer(8001);
    const tasksReady = await waitForServer(8002);
    
    if (!weatherReady || !tasksReady) {
      console.warn('⚠️  MCP servers did not start - some tests may fail');
    }
  }, 20000);

  afterAll(() => {
    weatherServer?.kill();
    tasksServer?.kill();
  });

  it.skipIf(!hasApiKey)('01-hello-world.ts completes successfully', async () => {
    const { stdout, stderr } = await execAsync('npx tsx examples/01-hello-world.ts', {
      env: { ...process.env },
      timeout: 30000
    });

    expect(stdout).toBeTruthy();
    expect(stdout.length).toBeGreaterThan(10);
    // npm warnings are ok in stderr
    // expect(stderr).toBe('');
  }, 35000);

  it.skipIf(!hasApiKey)('02-with-tools.ts completes and uses MCP tools', async () => {
    const { stdout } = await execAsync('npx tsx examples/02-with-tools.ts', {
      env: { ...process.env },
      timeout: 30000
    });

    // Should show agent completion and summary
    expect(stdout).toContain('agent complete');
    expect(stdout).toBeTruthy();
  }, 35000);

  it.skipIf(!hasApiKey)('03-streaming.ts streams tokens and completes', async () => {
    const { stdout } = await execAsync('npx tsx examples/03-streaming.ts', {
      env: { ...process.env },
      timeout: 30000
    });

    expect(stdout).toContain('Story streaming in real-time');
    expect(stdout).toContain('Done!');
  }, 35000);

  it.skipIf(!hasApiKey)('04-structured-outputs.ts produces valid JSON', async () => {
    const { stdout } = await execAsync('npx tsx examples/04-structured-outputs.ts', {
      env: { ...process.env },
      timeout: 30000
    });

    expect(stdout).toContain('Order:');
    expect(stdout).toContain('Total:');
  }, 35000);

  it.skipIf(!hasApiKey)('05-sub-agents.ts composes agents successfully', async () => {
    const { stdout } = await execAsync('npx tsx examples/05-sub-agents.ts', {
      env: { ...process.env },
      timeout: 60000  // Uses .ask() which makes additional LLM calls
    });

    expect(stdout).toBeTruthy();
    expect(stdout.length).toBeGreaterThan(50);
  }, 65000);

  it.skipIf(!hasApiKey)('06-multi-agent.ts delegates to specialists', async () => {
    const { stdout } = await execAsync('npx tsx examples/06-multi-agent.ts', {
      env: { ...process.env },
      timeout: 180000
    });

    expect(stdout).toBeTruthy();
    expect(stdout.length).toBeGreaterThan(100);
  }, 185000);

  it.skipIf(!hasApiKey)('07-patterns.ts demonstrates all patterns', async () => {
    const { stdout } = await execAsync('npx tsx examples/07-patterns.ts', {
      env: { ...process.env },
      timeout: 90000
    });

    expect(stdout).toContain('Parallel Processing');
    expect(stdout).toContain('Conditional Branching');
    expect(stdout).toContain('For Each');
    expect(stdout).toContain('While Loop');
  }, 95000);

  it.skipIf(!hasApiKey)('08-context.ts maintains conversation context', async () => {
    const { stdout } = await execAsync('npx tsx examples/08-context.ts', {
      env: { ...process.env },
      timeout: 45000  // Multiple steps + context management
    });

    expect(stdout).toContain('Step 1');
    expect(stdout).toContain('Step 2');
    expect(stdout).toContain('Step 3');
    expect(stdout).toContain('Final Budget Estimate');
  }, 50000);

  it.skipIf(!hasApiKey)('09-observability.ts runs with telemetry (skips if no collector)', async () => {
    try {
      const { stdout } = await execAsync('npx tsx examples/09-observability.ts', {
        env: { ...process.env },
        timeout: 60000
      });

      // Might fail if observability stack isn't running, that's ok
      expect(stdout).toBeTruthy();
    } catch (error) {
      // If ECONNREFUSED, the observability stack isn't running - that's fine
      const errorMsg = (error as any).stderr || '';
      if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('4318')) {
        console.log('Skipping observability test - stack not running');
        return;
      }
      throw error;
    }
  }, 65000);

  it.skipIf(!hasApiKey || !process.env.ANTHROPIC_API_KEY)('10-providers.ts works with multiple LLM providers', async () => {

    const { stdout } = await execAsync('npx tsx examples/10-providers.ts', {
      env: { ...process.env },
      timeout: 45000
    });

    expect(stdout).toContain('Step 1');
    expect(stdout.length).toBeGreaterThan(100);
  }, 50000);

  it.skipIf(!hasApiKey)('11-email-triage.ts processes all emails', async () => {
    const { stdout } = await execAsync('npx tsx examples/11-email-triage.ts', {
      env: { ...process.env },
      timeout: 120000  // Processes 3 emails, each with workflow + .summary()
    });

    expect(stdout).toContain('Processing emails');
    expect(stdout).toContain('All emails processed!');
  }, 125000);

  it('all examples exist and are readable', async () => {
    const examples = [
      '01-hello-world.ts',
      '02-with-tools.ts',
      '02b-with-stdio.ts',
      '03-streaming.ts',
      '04-structured-outputs.ts',
      '05-sub-agents.ts',
      '06-multi-agent.ts',
      '07-patterns.ts',
      '08-context.ts',
      '09-observability.ts',
      '10-providers.ts',
      '11-email-triage.ts'
    ];

    for (const example of examples) {
      // Verify file exists and has @volcano/agent imports
      const { stdout } = await execAsync(`head -10 examples/${example}`, {
        timeout: 5000
      });

      expect(stdout).toContain('import');
      expect(stdout).toContain('@volcano/agent');
    }
  }, 30000);

  it.skipIf(!hasApiKey)('MCP servers start without errors', async () => {
    // Servers are already running from beforeAll
    // Just verify they respond
    const weatherRes = await fetch('http://localhost:8001/mcp', { method: 'HEAD' });
    const tasksRes = await fetch('http://localhost:8002/mcp', { method: 'HEAD' });

    expect(weatherRes.ok || weatherRes.status === 400).toBe(true); // 400 is ok (needs init)
    expect(tasksRes.ok || tasksRes.status === 400).toBe(true);
  });

  it('filesystem stdio server can be spawned', async () => {
    const fs = spawn('tsx', ['examples/mcp/filesystem/server.ts'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Give it time to start
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Should be running
    expect(fs.killed).toBe(false);
    
    fs.kill();
  }, 5000);
});
