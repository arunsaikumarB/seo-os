import { runSyncJob } from '../../modules/integrations/integrations.service.js';
import { logger } from '../../lib/logger.js';

export async function handleIntegrationJobs(
  jobs: Array<{ id: string; data: Record<string, unknown> }>
): Promise<void> {
  for (const job of jobs) {
    const type = String(job.data.type ?? '');
    if (type !== 'integration_sync') continue;
    const syncJobId = String(job.data.syncJobId ?? '');
    if (!syncJobId) {
      logger.warn({ jobId: job.id }, 'Integration sync job missing syncJobId');
      continue;
    }
    logger.info({ jobId: job.id, syncJobId }, 'Processing integration sync job');
    await runSyncJob(syncJobId);
  }
}
