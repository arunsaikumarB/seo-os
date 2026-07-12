import { logger } from '../../lib/logger.js';
import { generateReportRun } from '../../modules/reports/reports.service.js';

export async function handleReportJobs(
  jobs: Array<{ id: string; data: Record<string, unknown> }>
): Promise<void> {
  for (const job of jobs) {
    const type = String(job.data.type ?? '');
    const runId = String(job.data.runId ?? '');
    const workspaceId = String(job.data.workspaceId ?? '');
    if (type !== 'report_generate' || !runId || !workspaceId) {
      logger.warn({ jobId: job.id, type }, 'Report job missing fields');
      continue;
    }
    try {
      await generateReportRun(runId, workspaceId);
      logger.info({ jobId: job.id, runId }, 'Report generated');
    } catch (err) {
      logger.error({ jobId: job.id, runId, err }, 'Report generation failed');
      throw err;
    }
  }
}
