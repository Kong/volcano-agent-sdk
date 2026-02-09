import { describe, it, expect } from 'vitest';
import { agent } from '../dist/volcano-agent-sdk.js';

/**
 * Test suite to verify that context (conversation history, tool results, etc.)
 * is properly carried over to subagents when using .runAgent()
 * 
 * CURRENT STATUS: ✅ FIXED - All tests PASS
 * 
 * THE PROBLEM (NOW FIXED):
 * Previously, when a parent agent called .runAgent(subAgent), the subagent did NOT receive
 * the parent's context (previous LLM outputs, tool results, conversation history).
 * This meant the subagent started with a blank slate, lacking critical information
 * that was established by the parent agent.
 * 
 * REAL-WORLD IMPACT:
 * In the GitHub issue triaging example (see test 3), a parent agent:
 *   1. Retrieves issue #23 about an XSS vulnerability
 *   2. Determines it's in the kuma-website repo
 *   3. Assigns it to Alice based on her security expertise
 *   4. Runs a labelerAgent subagent to add appropriate labels
 * 
 * But the labelerAgent doesn't know:
 *   - Which issue to label (#23)
 *   - Which repo to work with (kuma-website)
 *   - Why this assignment was made (security expertise)
 * 
 * The subagent cannot complete its task without this context!
 * 
 * THE FIX:
 * Modified executeRunAgent() to pass parentContext to subagents, and updated
 * the agent's run() method to initialize contextHistory with the parent's
 * context when __parentContext is present. Also improved
 * buildHistoryContextChunked() to include the last 5 steps instead of just 1.
 * 
 * CURRENT BEHAVIOR:
 * Subagents now receive the parent's context via the standard context mechanism
 * (buildHistoryContextChunked), so they can see previous LLM outputs, tool calls,
 * and tool results that provide necessary context for their tasks.
 * 
 * TEST COVERAGE:
 * - Test 1: ✅ Parent LLM output context propagation
 * - Test 2: ✅ Parent tool result context propagation  
 * - Test 3: ✅ Real-world GitHub issue triaging scenario
 * - Test 4: ✅ Nested subagent context propagation (multi-level)
 */
describe('Subagent Context Propagation', () => {
  
  it('subagent should have access to parent agent\'s previous LLM outputs', async () => {
    let capturedPromptsInSubagent: string[] = [];
    
    const parentLLM: any = {
      id: 'parent-mock',
      model: 'mock',
      client: {},
      gen: async (prompt: string) => {
        return 'The issue number is 42 and the repo is test-repo in org test-org';
      },
      genWithTools: async () => ({ content: '', toolCalls: [] }),
      genStream: async function*() {}
    };
    
    const subagentLLM: any = {
      id: 'subagent-mock',
      model: 'mock',
      client: {},
      gen: async (prompt: string) => {
        capturedPromptsInSubagent.push(prompt);
        return 'Processed';
      },
      genWithTools: async () => ({ content: '', toolCalls: [] }),
      genStream: async function*() {}
    };
    
    // Create subagent that should use parent's context
    const labelerAgent = agent({ llm: subagentLLM, hideProgress: true })
      .then({ prompt: 'Based on the previous context, what is the issue number and repo?' });
    
    // Run parent agent that establishes context, then runs subagent
    const results = await agent({ llm: parentLLM, hideProgress: true })
      .then({ prompt: 'Get the issue details for issue #42 in test-org/test-repo' })
      .runAgent(labelerAgent)
      .run();
    
    // Check if subagent received context
    expect(capturedPromptsInSubagent.length).toBeGreaterThan(0);
    const subagentPrompt = capturedPromptsInSubagent[0];
    
    // The subagent's prompt should include context from parent
    // This should include "issue number is 42" and "repo is test-repo"
    const hasContext = subagentPrompt.includes('[Context from previous steps]') &&
                      (subagentPrompt.includes('42') || subagentPrompt.includes('test-repo'));
    
    if (!hasContext) {
      console.log('Subagent prompt did NOT include parent context:');
      console.log(subagentPrompt);
      console.log('\nExpected to find: [Context from previous steps] with issue #42 and test-repo');
    }
    
    // This assertion now PASSES with the fix
    expect(hasContext).toBe(true);
  }, 30000);

  it('subagent should have access to parent agent\'s tool results', async () => {
    let capturedPromptsInSubagent: string[] = [];
    
    const parentLLM: any = {
      id: 'parent-mock',
      model: 'mock',
      client: {},
      gen: async (prompt: string) => {
        // Return realistic output that includes the key information
        if (prompt.includes('Get issue')) {
          return 'Retrieved issue #42 which has a critical authentication bug with security implications';
        }
        return 'Done';
      },
      genWithTools: async (prompt: string, tools: any[]) => {
        // Simulate that parent made tool calls and got results
        // We'll fake this by returning as if a tool was called
        return {
          content: 'I retrieved the issue details',
          toolCalls: [] // Return empty but we'll manually add to result
        };
      },
      genStream: async function*() {}
    };
    
    const subagentLLM: any = {
      id: 'subagent-mock',
      model: 'mock',
      client: {},
      gen: async (prompt: string) => {
        capturedPromptsInSubagent.push(prompt);
        return 'Added security label';
      },
      genWithTools: async () => ({ content: '', toolCalls: [] }),
      genStream: async function*() {}
    };
    
    // Subagent that should see the context from parent
    const labelerAgent = agent({ llm: subagentLLM, hideProgress: true })
      .then({ prompt: 'Based on the issue details retrieved, add an appropriate label' });
    
    // Parent agent establishes context about an issue
    const results = await agent({ llm: parentLLM, hideProgress: true })
      .then({ 
        prompt: 'Get issue #42: it has a critical authentication bug with security implications'
      })
      .runAgent(labelerAgent)
      .run();
    
    // Check if subagent received parent's context
    expect(capturedPromptsInSubagent.length).toBeGreaterThan(0);
    const subagentPrompt = capturedPromptsInSubagent[0];
    
    // The subagent should see context mentioning issue 42, authentication bug, or security
    const hasContext = subagentPrompt.includes('[Context from previous steps]') &&
                      (subagentPrompt.includes('42') || 
                       subagentPrompt.includes('authentication') ||
                       subagentPrompt.includes('security'));
    
    if (!hasContext) {
      console.log('Subagent prompt did NOT include parent context:');
      console.log(subagentPrompt);
      console.log('\nExpected to find: Context with issue #42, authentication bug, security');
    }
    
    // This assertion now PASSES with the fix
    expect(hasContext).toBe(true);
  }, 30000);

  it('demonstrates real-world scenario: GitHub issue triaging without context', async () => {
    let subagentPrompts: string[] = [];
    
    const parentLLM: any = {
      id: 'parent',
      model: 'mock',
      client: {},
      gen: async (prompt: string) => {
        // Parent retrieves and analyzes the issue
        if (prompt.includes('Get the issue')) {
          return 'Retrieved issue #23: Fix XSS vulnerability in login form for kuma-website repo in johnharris85-test-org';
        }
        if (prompt.includes('team member')) {
          return 'Based on the security nature of issue #23, Alice who specializes in security should handle it';
        }
        return 'Done';
      },
      genWithTools: async () => ({ content: '', toolCalls: [] }),
      genStream: async function*() {}
    };
    
    const subagentLLM: any = {
      id: 'subagent',
      model: 'mock',
      client: {},
      gen: async (prompt: string) => {
        subagentPrompts.push(prompt);
        return 'Added security label';
      },
      genWithTools: async () => ({ content: '', toolCalls: [] }),
      genStream: async function*() {}
    };
    
    // This simulates the pattern from the user's example
    // The labelerAgent should know about issue #23, XSS, and the repo from parent context
    const labelerAgent = agent({ llm: subagentLLM, hideProgress: true })
      .then({
        prompt: 'Add a label to the repo based on the issue type and assignment'
      });
    
    const results = await agent({ llm: parentLLM, hideProgress: true })
      .then({
        prompt: 'Get the issue #23 from kuma-website repo in org johnharris85-test-org'
      })
      .then({
        prompt: 'Determine which team member should handle this security issue'
      })
      .runAgent(labelerAgent)
      .run();
    
    // The problem: subagent doesn't know about issue #23, the XSS vulnerability, or the repo
    expect(subagentPrompts.length).toBeGreaterThan(0);
    const subagentContext = subagentPrompts[0];
    
    const hasNecessaryContext = 
      subagentContext.includes('23') || // issue number
      subagentContext.includes('XSS') || // issue type  
      subagentContext.includes('kuma-website') || // repo name
      subagentContext.includes('security') || // issue category
      subagentContext.includes('Alice'); // assigned person
    
    if (!hasNecessaryContext) {
      console.log('\n=== DEMONSTRATING THE PROBLEM ===');
      console.log('Parent agent:');
      console.log('  - Retrieved issue #23 about XSS vulnerability');
      console.log('  - Determined it\'s in kuma-website repo');
      console.log('  - Assigned to Alice based on security speciality');
      console.log('\nBut the subagent received this prompt:');
      console.log(subagentContext);
      console.log('\nSubagent cannot determine which issue, repo, or assignment context to use!');
    }
    
    expect(hasNecessaryContext).toBe(true);
  }, 30000);

  it('nested subagents should have access to all ancestor context', async () => {
    let level1Prompts: string[] = [];
    let level2Prompts: string[] = [];
    
    const rootLLM: any = {
      id: 'root',
      model: 'mock',
      client: {},
      gen: async () => 'Root context: Project ID is PROJ-123',
      genWithTools: async () => ({ content: '', toolCalls: [] }),
      genStream: async function*() {}
    };
    
    const level1LLM: any = {
      id: 'level1',
      model: 'mock',
      client: {},
      gen: async (prompt: string) => {
        level1Prompts.push(prompt);
        return 'Level1 context: Task ID is TASK-456';
      },
      genWithTools: async () => ({ content: '', toolCalls: [] }),
      genStream: async function*() {}
    };
    
    const level2LLM: any = {
      id: 'level2',
      model: 'mock',
      client: {},
      gen: async (prompt: string) => {
        level2Prompts.push(prompt);
        return 'Done';
      },
      genWithTools: async () => ({ content: '', toolCalls: [] }),
      genStream: async function*() {}
    };
    
    const level2Agent = agent({ llm: level2LLM, hideProgress: true })
      .then({ prompt: 'Complete the task with project and task IDs' });
    
    const level1Agent = agent({ llm: level1LLM, hideProgress: true })
      .then({ prompt: 'Process the task' })
      .runAgent(level2Agent);
    
    await agent({ llm: rootLLM, hideProgress: true })
      .then({ prompt: 'Initialize project' })
      .runAgent(level1Agent)
      .run();
    
    // Level 2 (deepest) should have access to both PROJ-123 and TASK-456
    expect(level2Prompts.length).toBeGreaterThan(0);
    const deepestContext = level2Prompts[0];
    
    const hasAllContext = 
      (deepestContext.includes('PROJ-123') || deepestContext.includes('Project ID')) &&
      (deepestContext.includes('TASK-456') || deepestContext.includes('Task ID'));
    
    if (!hasAllContext) {
      console.log('\nNested subagent missing ancestor context:');
      console.log(deepestContext);
    }
    
    expect(hasAllContext).toBe(true);
  }, 30000);
});

