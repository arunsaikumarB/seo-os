import type { AgentType } from '@seo-os/agent-contracts';
import { executeAgentRun } from '../../modules/ai/agent.service.js';
import { logger } from '../../lib/logger.js';

export async function handleAgentJobs(
  jobs: Array<{ id: string; data: Record<string, unknown> }>
): Promise<void> {
  for (const job of jobs) {
    const { runId, workspaceId, agentType, input, useAI } = job.data as {
      runId: string;
      workspaceId: string;
      agentType: AgentType;
      input?: Record<string, unknown>;
      useAI?: boolean;
    };

    logger.info({ jobId: job.id, runId, agentType }, 'Processing agent job');
    try {
      await executeAgentRun({ runId, workspaceId, agentType, input, useAI });
    } catch (err) {
      logger.error({ err, jobId: job.id, runId }, 'Agent job failed');
      throw err;
    }
  }
}
