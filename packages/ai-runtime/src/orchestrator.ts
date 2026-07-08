import type { AgentType } from '@seo-os/agent-contracts';
import type { AgentRunner } from './agent-runner.js';
import { randomUUID } from 'node:crypto';

export interface OrchestrationStep {
  agentType: AgentType;
  input?: Record<string, unknown>;
  dependsOn?: string;
}

export interface OrchestrationPlan {
  id: string;
  workspaceId: string;
  steps: OrchestrationStep[];
}

export interface OrchestrationResult {
  planId: string;
  runIds: string[];
  results: Awaited<ReturnType<AgentRunner['run']>>[];
}

export class AgentOrchestrator {
  constructor(private runner: AgentRunner) {}

  async execute(plan: OrchestrationPlan, options?: { useAI?: boolean }): Promise<OrchestrationResult> {
    const runIds: string[] = [];
    const results: Awaited<ReturnType<AgentRunner['run']>>[] = [];

    for (const step of plan.steps) {
      const runId = randomUUID();
      runIds.push(runId);
      const result = await this.runner.run({
        runId,
        workspaceId: plan.workspaceId,
        agentType: step.agentType,
        input: step.input,
        useAI: options?.useAI,
      });
      results.push(result);
      if (result.status === 'failed') break;
    }

    return { planId: plan.id, runIds, results };
  }
}
