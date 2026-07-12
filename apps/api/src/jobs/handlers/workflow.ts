import { logger } from '../../lib/logger.js';
import { advanceWorkflowRun } from '../../modules/workflows/workflow.service.js';

export async function handleWorkflowJobs(
  jobs: Array<{ id: string; data: Record<string, unknown> }>
): Promise<void> {
  for (const job of jobs) {
    const type = String(job.data.type ?? '');
    const runId = String(job.data.runId ?? '');
    const workspaceId = String(job.data.workspaceId ?? '');
    if (type !== 'workflow_advance' || !runId || !workspaceId) {
      logger.warn({ jobId: job.id, type }, 'Workflow job missing fields');
      continue;
    }
    try {
      await advanceWorkflowRun(runId, workspaceId);
      logger.info({ jobId: job.id, runId }, 'Workflow run advanced');
    } catch (err) {
      logger.error({ jobId: job.id, runId, err }, 'Workflow advance failed');
      throw err;
    }
  }
}
