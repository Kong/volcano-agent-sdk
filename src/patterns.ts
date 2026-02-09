import type { StepResult, AgentBuilder } from "./volcano-agent-sdk.js";

export async function executeParallel(
  stepsOrDict: any[] | Record<string, any>,
  executeStep: (step: any) => Promise<StepResult>
): Promise<StepResult> {
  const stepStart = Date.now();
  
  if (Array.isArray(stepsOrDict)) {
    const results = await Promise.all(stepsOrDict.map(s => executeStep(s)));
    return {
      parallelResults: results,
      durationMs: Date.now() - stepStart,
    };
  } else {
    const keys = Object.keys(stepsOrDict);
    const promises = keys.map(key => executeStep(stepsOrDict[key]));
    const results = await Promise.all(promises);
    
    const parallel: Record<string, StepResult> = {};
    keys.forEach((key, idx) => {
      parallel[key] = results[idx];
    });
    
    return {
      parallel,
      durationMs: Date.now() - stepStart,
    };
  }
}

export async function executeBranch(
  condition: (history: StepResult[]) => boolean,
  branches: { true: (agent: AgentBuilder) => AgentBuilder; false: (agent: AgentBuilder) => AgentBuilder },
  history: StepResult[],
  createSubAgent: () => AgentBuilder
): Promise<StepResult[]> {
  const shouldTakeTrue = condition(history);
  const branch = shouldTakeTrue ? branches.true : branches.false;
  
  const subAgent = branch(createSubAgent());
  return await subAgent.run();
}

export async function executeSwitch<T>(
  selector: (history: StepResult[]) => T,
  cases: Record<string, (agent: AgentBuilder) => AgentBuilder> & { default?: (agent: AgentBuilder) => AgentBuilder },
  history: StepResult[],
  createSubAgent: () => AgentBuilder
): Promise<StepResult[]> {
  const value = selector(history);
  const key = String(value);
  const caseBuilder = cases[key] || cases.default;
  
  if (!caseBuilder) {
    throw new Error(`No matching case for value: ${key} and no default case provided`);
  }
  
  const subAgent = caseBuilder(createSubAgent());
  return await subAgent.run();
}

export async function executeWhile(
  condition: (history: StepResult[]) => boolean,
  body: (agent: AgentBuilder) => AgentBuilder,
  history: StepResult[],
  createSubAgent: () => AgentBuilder,
  opts?: { maxIterations?: number; timeout?: number }
): Promise<StepResult[]> {
  const maxIterations = opts?.maxIterations || 10;
  const allResults: StepResult[] = [];
  let iterations = 0;
  
  while (condition(history.concat(allResults)) && iterations < maxIterations) {
    const subAgent = body(createSubAgent());
    const results = await subAgent.run();
    allResults.push(...results);
    iterations++;
  }
  
  return allResults;
}

export async function executeForEach<T>(
  items: T[],
  body: (item: T, agent: AgentBuilder) => AgentBuilder,
  createSubAgent: () => AgentBuilder
): Promise<StepResult[]> {
  const allResults: StepResult[] = [];
  
  for (const item of items) {
    const subAgent = body(item, createSubAgent());
    const results = await subAgent.run();
    allResults.push(...results);
  }
  
  return allResults;
}

export async function executeRetryUntil(
  body: (agent: AgentBuilder) => AgentBuilder,
  successCondition: (result: StepResult) => boolean,
  createSubAgent: () => AgentBuilder,
  opts?: { maxAttempts?: number; backoff?: number }
): Promise<StepResult[]> {
  const maxAttempts = opts?.maxAttempts || 5;
  const backoff = opts?.backoff || 1.5;
  const allResults: StepResult[] = [];
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const subAgent = body(createSubAgent());
    const attemptResults = await subAgent.run();
    allResults.push(...attemptResults);
    
    const lastResult = attemptResults[attemptResults.length - 1];
    if (successCondition(lastResult)) {
      return allResults;
    }
    
    if (attempt < maxAttempts - 1) {
      const waitMs = 1000 * Math.pow(backoff, attempt);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
  
  throw new Error(`retryUntil: Failed to meet success condition after ${maxAttempts} attempts`);
}

export async function executeRunAgent(
  subAgent: AgentBuilder,
  parentStepIndex?: number,
  parentTotalSteps?: number,
  parentContext?: StepResult[]
): Promise<StepResult[]> {
  // Suppress progress header/footer but keep step progress for explicit composition
  interface AgentBuilderInternal {
    __isSubAgent?: boolean;
    __isExplicitSubAgent?: boolean;
    __parentStepIndex?: number;
    __parentTotalSteps?: number;
    __parentContext?: any[];
  }
  
  const subAgentInternal = subAgent as unknown as AgentBuilderInternal;
  subAgentInternal.__isSubAgent = true;
  subAgentInternal.__isExplicitSubAgent = true;
  subAgentInternal.__parentStepIndex = parentStepIndex;
  subAgentInternal.__parentTotalSteps = parentTotalSteps;
  
  // Pass parent's context so subagent has access to previous steps
  if (parentContext && parentContext.length > 0) {
    subAgentInternal.__parentContext = parentContext;
  }
  
  return await subAgent.run();
}
