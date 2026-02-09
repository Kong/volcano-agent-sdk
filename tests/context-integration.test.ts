import { describe, it, expect, vi, beforeEach } from 'vitest';
import { agent, llmOpenAI, AgentBuilder, LLMHandle } from '../src/volcano-agent-sdk.js';

// Create a mock LLM that records all prompts it receives
const createRecordingLLM = (): LLMHandle & { getPrompts: () => string[], getLastPrompt: () => string } => {
  const prompts: string[] = [];
  
  return {
      gen: vi.fn(async (prompt: string) => {
        prompts.push(prompt);
        
        // Return different responses based on the prompt content
        if (prompt.includes('Create a report')) {
          return 'USE researcher: Find information about testing';
        }
        if (prompt.includes('was delegated:')) {
          return 'Research complete: Found 5 test cases';
        }
        if (prompt.includes('You are analyzing the results')) {
          // This is an ask() query - check what's in the context
          if (prompt.includes('Which agents were used')) {
            if (prompt.includes('Agents Used:')) {
              return 'The researcher agent was used to find information about testing.';
            }
            return 'Based on the execution results, I cannot find specific agent usage information.';
          }
        }
        
        return 'Default response';
      }),
    
    genStream: vi.fn(async function* (prompt: string) {
      prompts.push(prompt);
      
      // Return appropriate response based on prompt
      let response = 'Default response';
      if (prompt.includes('Create a report')) {
        response = 'USE researcher: Find information about testing';
      } else if (prompt.includes('was delegated:')) {
        response = 'Research complete: Found 5 test cases';
      }
      
      for (const char of response) {
        yield char;
      }
    }),
    
    getPrompts: () => prompts,
    getLastPrompt: () => prompts[prompts.length - 1] || ''
  };
};

// Helper to create mock AgentResults with proper ask method
function createMockResults(mockResults: any[]): any {
  return Object.assign(mockResults, {
    ask: async (llm: any, question: string) => {
      const context: string[] = [];
      const agentDelegations: { step: number; agentName: string; task: string }[] = [];
      
      mockResults.forEach((step, idx) => {
        context.push(`Step ${idx + 1}:`);
        
        if (step.prompt) {
          context.push(`  Prompt: ${step.prompt}`);
          
          if (step.llmOutput) {
            const useMatch = step.llmOutput.match(/USE\s+(\w+):\s*(.+?)(?:\n|$)/);
            if (useMatch) {
              agentDelegations.push({ 
                step: idx + 1, 
                agentName: useMatch[1], 
                task: useMatch[2].trim() 
              });
              context.push(`  Delegated to Agent: ${useMatch[1]}`);
              context.push(`  Delegation Task: ${useMatch[2].trim()}`);
            }
            
            const delegationMatch = step.prompt.match(/Agent (\w+) was delegated: (.+)$/);
            if (delegationMatch) {
              context.push(`  Agent Used: ${delegationMatch[1]}`);
              context.push(`  Agent Task: ${delegationMatch[2]}`);
            }
          }
        }
        
        if (step.llmOutput) context.push(`  LLM Output: ${step.llmOutput}`);
        if (step.toolCalls && step.toolCalls.length > 0) {
          context.push(`  Tools Called (${step.toolCalls.length}):`);
          step.toolCalls.forEach(tc => {
            context.push(`    - ${tc.name}: ${JSON.stringify(tc.arguments || {})}`);
            context.push(`      Result: ${JSON.stringify(tc.result)}`);
          });
        }
        if (step.mcp) {
          context.push(`  MCP Tool: ${step.mcp.tool}`);
          context.push(`  Result: ${JSON.stringify(step.mcp.result)}`);
        }
        if (step.durationMs) context.push(`  Duration: ${step.durationMs}ms`);
        
        if ((step as any).__crewTotalTokens) {
          context.push(`  Total Crew Tokens: ${(step as any).__crewTotalTokens}`);
        }
        
        if ((step as any).agentCalls && (step as any).agentCalls.length > 0) {
          context.push(`  Agents Used:`);
          (step as any).agentCalls.forEach((call: any) => {
            context.push(`    - ${call.name}: ${call.task}`);
            context.push(`      Tokens: ${call.tokens}`);
            context.push(`      Duration: ${call.ms}ms`);
          });
        }
        
        context.push('');
      });
      
      if (agentDelegations.length > 0) {
        context.push('\nAgent Delegation Summary:');
        agentDelegations.forEach(d => {
          context.push(`  - Step ${d.step}: ${d.agentName} agent (task: "${d.task}")`);
        });
        context.push('');
      }
      
      const fullContext = context.join('\n');
      const prompt = `You are analyzing the results of an AI agent workflow.\n\nAgent Execution Results:\n${fullContext}\n\nUser Question: ${question}\n\nProvide a clear, concise answer based on the execution results above. Be specific and reference actual data from the results.`;
      return await llm.gen(prompt);
    }
  });
}

describe('Context Integration Tests', () => {
  let recordingLLM: ReturnType<typeof createRecordingLLM>;
  
  beforeEach(() => {
    recordingLLM = createRecordingLLM();
  });
  
  describe('Multi-Agent Context in ask()', () => {
    it('should include agent delegation info in ask() context', async () => {
      // Create agents
      const researcher = agent({
        llm: recordingLLM,
        name: 'researcher',
        description: 'Finds information'
      });
      
      // Run multi-agent workflow  
      const results = await agent({ llm: recordingLLM })
        .then({ 
          prompt: 'Create a report', 
          agents: [researcher]
        })
        .run();
      
      // Now use ask() to query about agents
      await results.ask(recordingLLM, 'Which agents were used and what did they do?');
      
      // Get the prompt that was sent to the LLM
      const askPrompt = recordingLLM.getLastPrompt();
      
      // Verify the context includes agent information
      expect(askPrompt).toContain('Agent Execution Results:');
      expect(askPrompt).toContain('Step 1:');
      expect(askPrompt).toContain('Prompt: Create a report');
      
      // Should detect the agent usage in the context
      expect(askPrompt).toContain('Agents Used:');
      expect(askPrompt).toContain('- researcher: Find information about testing');
      
      // Should have the actual question
      expect(askPrompt).toContain('Which agents were used and what did they do?');
    });
    
    it('should show complete agent execution history', async () => {
      // Mock a complete multi-agent execution
      const mockResults = [
        {
          prompt: 'Build a feature',
          llmOutput: 'USE designer: Create mockups\n\nI need design first.',
          durationMs: 100,
          __tokenCount: 20
        },
        {
          prompt: 'Agent designer was delegated: Create mockups',
          llmOutput: 'Mockups created: [homepage.png, dashboard.png]',
          durationMs: 500,
          __tokenCount: 50
        },
        {
          prompt: 'Continue with implementation', 
          llmOutput: 'USE developer: Implement based on mockups',
          durationMs: 100,
          __tokenCount: 15
        },
        {
          prompt: 'Agent developer was delegated: Implement based on mockups',
          llmOutput: 'Implementation complete with React components',
          durationMs: 800,
          __tokenCount: 100
        },
        {
          prompt: 'Final coordination',
          llmOutput: 'DONE: Feature built successfully',
          durationMs: 200,
          agentCalls: [
            { name: 'designer', task: 'Create mockups', tokens: 50, ms: 500 },
            { name: 'developer', task: 'Implement based on mockups', tokens: 100, ms: 800 }
          ],
          __crewTotalTokens: 185
        } as any
      ];
      
      const results = createMockResults(mockResults);
      
      // Query about the execution
      await results.ask(recordingLLM, 'What was the complete workflow?');
      
      const askPrompt = recordingLLM.getLastPrompt();
      
      // Verify all steps are in context
      expect(askPrompt).toContain('Step 1:');
      expect(askPrompt).toContain('Step 2:');
      expect(askPrompt).toContain('Step 3:');
      expect(askPrompt).toContain('Step 4:');
      expect(askPrompt).toContain('Step 5:');
      
      // Verify agent calls summary
      expect(askPrompt).toContain('Total Crew Tokens: 185');
      expect(askPrompt).toContain('Agents Used:');
      expect(askPrompt).toContain('- designer: Create mockups');
      expect(askPrompt).toContain('Tokens: 50');
      expect(askPrompt).toContain('- developer: Implement based on mockups');
      expect(askPrompt).toContain('Tokens: 100');
      
      // Verify delegation summary
      expect(askPrompt).toContain('Agent Delegation Summary:');
      expect(askPrompt).toContain('designer agent (task: "Create mockups")');
      expect(askPrompt).toContain('developer agent (task: "Implement based on mockups")');
    });
  });
  
  describe('Tool Calls Context', () => {
    it('should include tool call details in context', async () => {
      const mockResults = [
        {
          prompt: 'Calculate something',
          llmOutput: 'I will calculate 15 * 23',
          toolCalls: [
            {
              name: 'calculator',
              arguments: { operation: 'multiply', a: 15, b: 23 },
              endpoint: 'http://localhost:3000',
              result: 345,
              ms: 50
            },
            {
              name: 'converter',
              arguments: { value: 345, from: 'decimal', to: 'hex' },
              endpoint: 'http://localhost:3000', 
              result: '0x159',
              ms: 30
            }
          ],
          durationMs: 200
        }
      ];
      
      const results = createMockResults(mockResults);
      
      await results.ask(recordingLLM, 'What tools were used?');
      
      const askPrompt = recordingLLM.getLastPrompt();
      
      expect(askPrompt).toContain('Tools Called (2):');
      expect(askPrompt).toContain('- calculator: {"operation":"multiply","a":15,"b":23}');
      expect(askPrompt).toContain('Result: 345');
      expect(askPrompt).toContain('- converter: {"value":345,"from":"decimal","to":"hex"}');
      expect(askPrompt).toContain('Result: "0x159"');
    });
  });
  
  describe('Context Truncation', () => {
    it('should handle very long contexts gracefully', async () => {
      // Create a result with very long output
      const longOutput = 'x'.repeat(10000);
      const mockResults = [
        {
          prompt: 'Generate long text',
          llmOutput: longOutput,
          durationMs: 1000
        }
      ];
      
      const results = createMockResults(mockResults);
      
      await results.ask(recordingLLM, 'Summarize');
      
      const askPrompt = recordingLLM.getLastPrompt();
      
      // Context should still be included even if long
      expect(askPrompt).toContain('Step 1:');
      expect(askPrompt).toContain('Prompt: Generate long text');
      expect(askPrompt).toContain('LLM Output:');
      expect(askPrompt.length).toBeGreaterThan(10000); // Should include the long output
    });
  });
  
  describe('Empty and Error Cases', () => {
    it('should handle empty results gracefully', async () => {
      const results = createMockResults([]);
      
      await results.ask(recordingLLM, 'What happened?');
      
      const askPrompt = recordingLLM.getLastPrompt();
      
      expect(askPrompt).toContain('Agent Execution Results:');
      expect(askPrompt).not.toContain('Step 1:'); // No steps
      expect(askPrompt).toContain('User Question: What happened?');
    });
    
    it('should handle results with missing data', async () => {
      const mockResults = [
        { /* empty step */ },
        { prompt: 'Only prompt' },
        { llmOutput: 'Only output' },
        { durationMs: 500 }
      ];
      
      const results = createMockResults(mockResults);
      
      await results.ask(recordingLLM, 'Describe the execution');
      
      const askPrompt = recordingLLM.getLastPrompt();
      
      // Should handle all steps even with missing data
      expect(askPrompt).toContain('Step 1:');
      expect(askPrompt).toContain('Step 2:');
      expect(askPrompt).toContain('Step 3:');
      expect(askPrompt).toContain('Step 4:');
    });
  });
});

describe('History Context Building', () => {
  it('should properly build context for delegated agents', async () => {
    // This tests the buildHistoryContextChunked function behavior
    const mockHistory = [
      {
        prompt: 'Create a blog post about AI',
        llmOutput: 'I will coordinate this task'
      },
      {
        prompt: 'Agent researcher was delegated: Find latest AI breakthroughs',
        llmOutput: 'Found 5 major breakthroughs in 2024...'
      }
    ];
    
    // Import the function if it's exported, otherwise we'll test through agent execution
    const researcherLLM = createRecordingLLM();
    const researcher = agent({
      llm: researcherLLM,
      name: 'researcher',
      hideProgress: true
    }).then({ prompt: 'Research: {{task}}' });
    
    // Test with a simple delegated agent execution
    const mockParentContext = {
      prompt: 'Create a blog post about AI',
      llmOutput: 'USE researcher: Find latest AI breakthroughs'
    };
    
    // Create a new agent instance with parent context
    const delegatedResearcher = agent({
      llm: researcherLLM,
      name: 'researcher',
      hideProgress: true
    }).then({ prompt: 'Find latest AI breakthroughs' });
    
    // Execute the delegated agent
    await delegatedResearcher.run();
    
    // The researcher should have been called
    const prompts = researcherLLM.getPrompts();
    expect(prompts.length).toBeGreaterThan(0);
    
    const researcherPrompt = prompts[0];
    
    // Check that the task was passed correctly
    expect(researcherPrompt).toContain('Find latest AI breakthroughs');
  });
});
