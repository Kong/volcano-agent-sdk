import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { z } from 'zod';
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

function startMockServer(name: string, port: string, tools: any) {
  const serverCode = `
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const app = express();
app.use(express.json());
app.use(cors({ origin: '*', exposedHeaders: ['Mcp-Session-Id'] }));

const transports = new Map();

function getServer() {
  const server = new McpServer({ name: '${name}', version: '1.0.0' });
  
  ${tools.map((tool: any) => `
  server.tool(
    '${tool.name}',
    '${tool.description}',
    ${JSON.stringify(tool.schema)},
    async (args) => ${tool.handler}
  );`).join('\n  ')}
  
  return server;
}

app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] || randomUUID();
  let transport = transports.get(sessionId);
  if (!transport) {
    transport = new StreamableHTTPServerTransport('/mcp', res, sessionId);
    transports.set(sessionId, transport);
    const server = getServer();
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

const port = ${port};
app.listen(port, () => console.log('[${name}] listening on :' + port));
`;

  const proc = spawn('node', ['--input-type=module', '-'], { 
    env: { ...process.env, PORT: port },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  proc.stdin?.write(serverCode);
  proc.stdin?.end();
  
  return proc;
}

function makeMockLLM(responses: string[]) {
  let callCount = 0;
  return {
    id: 'mock-llm',
    model: 'mock',
    client: {},
    gen: async (prompt: string) => {
      const response = responses[callCount] || responses[responses.length - 1];
      callCount++;
      return response;
    },
    genWithTools: async () => ({ content: '', toolCalls: [] }),
    genStream: async function*(){}
  } as any;
}

describe('GitHub Issue Handler - Context Persistence', () => {
  let issuesProc: any;
  let teamProc: any;
  let labelsProc: any;

  beforeAll(async () => {
    issuesProc = startMockServer('github-issues', '4101', [
      {
        name: 'get_issue',
        description: 'Get issue details',
        schema: {
          org: z.string(),
          repo: z.string(),
          issue_number: z.number()
        },
        handler: `{
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                number: args.issue_number,
                title: 'Add dark mode support',
                body: 'We need dark mode for the website',
                state: 'open',
                author: 'user123'
              })
            }]
          };
        }`
      },
      {
        name: 'add_comment',
        description: 'Add comment to issue',
        schema: {
          org: z.string(),
          repo: z.string(),
          issue_number: z.number(),
          comment: z.string()
        },
        handler: `{
          return {
            content: [{
              type: 'text',
              text: 'Comment added to issue ' + args.issue_number
            }]
          };
        }`
      },
      {
        name: 'add_label',
        description: 'Add label to issue',
        schema: {
          org: z.string(),
          repo: z.string(),
          issue_number: z.number(),
          label: z.string()
        },
        handler: `{
          return {
            content: [{
              type: 'text',
              text: 'Label "' + args.label + '" added to issue ' + args.issue_number
            }]
          };
        }`
      }
    ]);

    teamProc = startMockServer('team-members', '4102', [
      {
        name: 'list_team_members',
        description: 'List team members with their specialties and workload',
        schema: {},
        handler: `{
          return {
            content: [{
              type: 'text',
              text: JSON.stringify([
                { name: 'Alice', specialty: 'frontend', current_issues: 3 },
                { name: 'Bob', specialty: 'backend', current_issues: 5 },
                { name: 'Charlie', specialty: 'security', current_issues: 2 }
              ])
            }]
          };
        }`
      }
    ]);

    labelsProc = startMockServer('labels', '4103', [
      {
        name: 'create_label',
        description: 'Create a new label',
        schema: {
          org: z.string(),
          repo: z.string(),
          name: z.string(),
          color: z.string().optional()
        },
        handler: `{
          return {
            content: [{
              type: 'text',
              text: 'Label "' + args.name + '" created'
            }]
          };
        }`
      }
    ]);

    await waitForOutput(issuesProc, /listening on :4101/);
    await waitForOutput(teamProc, /listening on :4102/);
    await waitForOutput(labelsProc, /listening on :4103/);
  }, 30000);

  afterAll(async () => {
    if (issuesProc) {
      issuesProc.kill('SIGKILL');
      issuesProc = null;
    }
    if (teamProc) {
      teamProc.kill('SIGKILL');
      teamProc = null;
    }
    if (labelsProc) {
      labelsProc.kill('SIGKILL');
      labelsProc = null;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  it('maintains context across multiple MCP tool calls - issue number persists', async () => {
    const issuesMcp = mcp('http://localhost:4101/mcp');
    const teamMcp = mcp('http://localhost:4102/mcp');
    const labelsMcp = mcp('http://localhost:4103/mcp');

    const issueNumber = 123;

    const llm: any = {
      id: 'mock-github-llm',
      model: 'test',
      client: {},
      gen: async (prompt: string) => {
        if (prompt.includes('Write a label')) {
          // This prompt should include context about issue 123
          expect(prompt).toContain('123');
          return 'Based on frontend specialty, I will add the "frontend" label to issue 123';
        }
        return 'OK';
      },
      genWithTools: async (prompt: string, tools: any[]) => {
        // Step 1: Get issue
        if (prompt.includes('Get the issue')) {
          return {
            content: '',
            toolCalls: [{
              name: tools.find(t => t.name.includes('get_issue'))!.name,
              arguments: {
                org: 'johnharris85-test-org',
                repo: 'kuma-website',
                issue_number: issueNumber
              },
              mcpHandle: issuesMcp
            }]
          };
        }
        
        // Step 2: Get team members
        if (prompt.includes('Read the issue contents')) {
          return {
            content: '',
            toolCalls: [{
              name: tools.find(t => t.name.includes('list_team_members'))!.name,
              arguments: {},
              mcpHandle: teamMcp
            }]
          };
        }
        
        // Step 3: Add comment - should include issue number from context
        if (prompt.includes('Write an issue comment')) {
          // Verify context includes issue number
          expect(prompt).toContain('123');
          return {
            content: '',
            toolCalls: [{
              name: tools.find(t => t.name.includes('add_comment'))!.name,
              arguments: {
                org: 'johnharris85-test-org',
                repo: 'kuma-website',
                issue_number: issueNumber,
                comment: 'Assigned to Alice (frontend specialist, 3 current issues)'
              },
              mcpHandle: issuesMcp
            }]
          };
        }
        
        // Step 4: Add label - should also have issue number from context
        if (prompt.includes('Write a label')) {
          // Critical: Verify issue number is still in context
          expect(prompt).toContain('123');
          return {
            content: '',
            toolCalls: [{
              name: tools.find(t => t.name.includes('add_label'))!.name,
              arguments: {
                org: 'johnharris85-test-org',
                repo: 'kuma-website',
                issue_number: issueNumber,
                label: 'frontend'
              },
              mcpHandle: issuesMcp
            }]
          };
        }
        
        return { content: '', toolCalls: [] };
      },
      genStream: async function*(){}
    };

    const results = await agent({
      llm,
      hideProgress: true,
      instructions: `You are an assistant that triages GitHub issues. You will use the tools provided to you to get issue details and user information. You only need to use the tools necessary to complete your task. Be concise in your responses and only perform the tasks asked of you and required by the prompts.`,
      timeout: 180,
      maxToolIterations: 3,
      contextMaxChars: 150000,
      contextMaxToolResults: 10,
    })
      .then({
        prompt: `Get the issue with issue number ${issueNumber} for the 'kuma-website' repo in the 'johnharris85-test-org' organization.`,
        mcps: [issuesMcp],
      })
      .then({
        prompt: `Read the issue contents to determine which of the team members would be best suited to handle this issue. Also take into account their current assignment workload. Important: Only assign this current issue to one team member.`,
        mcps: [teamMcp],
      })
      .then({
        prompt: `Write an issue comment on the same issue number for the 'kuma-website' repo in the 'johnharris85-test-org' organization, saying who has been assigned it to, based on your analysis.`,
        mcps: [issuesMcp],
      })
      .then({
        prompt: `Write a label to the issue number for the 'kuma-website' repo in the 'johnharris85-test-org' organization, based on the person's speciality that caused you to make this suggestion. E.g. 'security' or 'frontend' etc. You may need to write a new label first in that org / repo.`,
        mcps: [labelsMcp, issuesMcp],
      })
      .run();

    // Verify all steps executed
    expect(results).toHaveLength(4);
    
    // Verify step 1: Got issue
    expect(results[0].toolCalls).toBeDefined();
    expect(results[0].toolCalls!.length).toBeGreaterThan(0);
    expect(results[0].toolCalls![0].name).toContain('get_issue');
    expect(results[0].toolCalls![0].arguments).toMatchObject({
      issue_number: 123
    });
    
    // Verify step 2: Got team members
    expect(results[1].toolCalls).toBeDefined();
    expect(results[1].toolCalls!.length).toBeGreaterThan(0);
    expect(results[1].toolCalls![0].name).toContain('list_team_members');
    
    // CRITICAL: Verify step 3 - comment includes issue number
    expect(results[2].toolCalls).toBeDefined();
    expect(results[2].toolCalls!.length).toBeGreaterThan(0);
    expect(results[2].toolCalls![0].name).toContain('add_comment');
    expect(results[2].toolCalls![0].arguments).toMatchObject({
      issue_number: 123  // Context should have preserved this!
    });
    
    // CRITICAL: Verify step 4 - label includes issue number
    expect(results[3].toolCalls).toBeDefined();
    expect(results[3].toolCalls!.length).toBeGreaterThan(0);
    const labelCall = results[3].toolCalls!.find((c: any) => c.name.includes('add_label'));
    expect(labelCall).toBeDefined();
    expect(labelCall!.arguments).toMatchObject({
      issue_number: 123  // Context should STILL have this!
    });
    
    // Verify context was injected properly by checking MCP tool results are in context
    // The issue details from step 1 should be available in later steps
    const step1ToolCall = results[0].toolCalls?.[0];
    expect(step1ToolCall).toBeDefined();
    expect(step1ToolCall!.arguments).toMatchObject({ issue_number: 123 });
    const step1ResultStr = typeof step1ToolCall!.result === 'string' 
      ? step1ToolCall!.result 
      : JSON.stringify(step1ToolCall!.result);
    expect(step1ResultStr).toContain('dark mode');
  }, 30000);

  it('context includes previous MCP tool results and LLM outputs', async () => {
    const issuesMcp = mcp('http://localhost:4101/mcp');
    const teamMcp = mcp('http://localhost:4102/mcp');

    let step2Prompt = '';
    let step3Prompt = '';

    const llm: any = {
      id: 'mock-context-llm',
      model: 'test',
      client: {},
      gen: async (prompt: string) => 'OK',
      genWithTools: async (prompt: string, tools: any[]) => {
        // Capture prompts to verify context injection
        if (prompt.includes('Read the issue contents')) {
          step2Prompt = prompt;
        }
        if (prompt.includes('Write an issue comment')) {
          step3Prompt = prompt;
        }

        // Step 1: Get issue
        if (prompt.includes('Get the issue')) {
          return {
            content: '',
            toolCalls: [{
              name: tools.find(t => t.name.includes('get_issue'))!.name,
              arguments: { org: 'test-org', repo: 'test-repo', issue_number: 456 },
              mcpHandle: issuesMcp
            }]
          };
        }
        
        // Step 2: List team
        if (prompt.includes('Read the issue contents')) {
          // Should have issue details in context
          expect(prompt).toContain('456');
          expect(prompt).toContain('dark mode');
          return {
            content: '',
            toolCalls: [{
              name: tools.find(t => t.name.includes('list_team_members'))!.name,
              arguments: {},
              mcpHandle: teamMcp
            }]
          };
        }
        
        // Step 3: Add comment
        if (prompt.includes('Write an issue comment')) {
          // Should have BOTH issue details AND team info in context
          expect(prompt).toContain('456');
          expect(prompt).toContain('Alice');
          expect(prompt).toContain('frontend');
          return {
            content: '',
            toolCalls: [{
              name: tools.find(t => t.name.includes('add_comment'))!.name,
              arguments: {
                org: 'test-org',
                repo: 'test-repo',
                issue_number: 456,
                comment: 'Assigned to Alice'
              },
              mcpHandle: issuesMcp
            }]
          };
        }
        
        return { content: '', toolCalls: [] };
      },
      genStream: async function*(){}
    };

    const results = await agent({
      llm,
      hideProgress: true,
      contextMaxChars: 150000,
      contextMaxToolResults: 10,
    })
      .then({
        prompt: `Get the issue with issue number 456 for the 'test-repo' repo in the 'test-org' organization.`,
        mcps: [issuesMcp],
      })
      .then({
        prompt: `Read the issue contents to determine which team member should handle this.`,
        mcps: [teamMcp],
      })
      .then({
        prompt: `Write an issue comment on the same issue, saying who was assigned.`,
        mcps: [issuesMcp],
      })
      .run();

    expect(results).toHaveLength(3);
    
    // Verify context was properly built for step 2
    expect(step2Prompt).toContain('456');
    expect(step2Prompt).toContain('dark mode');
    
    // Verify context accumulated for step 3
    expect(step3Prompt).toContain('456');
    expect(step3Prompt).toContain('Alice');
  }, 30000);
});

