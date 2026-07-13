import { logger } from '../../lib/logger.js';
import { runAutomationPipeline, runVerificationCheck } from '../../modules/backlinks/automation.service.js';
import { runDiscoverWebsites } from '../../modules/backlinks/discovery.service.js';

export async function handleBacklinkJobs(
  jobs: Array<{ id: string; data: Record<string, unknown> }>
): Promise<void> {
  for (const job of jobs) {
    const type = String(job.data.type ?? '');
    try {
      if (type === 'backlink_verify') {
        await runVerificationCheck(String(job.data.workspaceId), String(job.data.backlinkId));
        logger.info({ jobId: job.id }, 'Backlink verification completed');
      } else if (type === 'backlink_automation') {
        await runAutomationPipeline(
          String(job.data.workspaceId),
          String(job.data.importId),
          job.data.orgId ? String(job.data.orgId) : undefined,
          job.data.userId ? String(job.data.userId) : undefined
        );
        logger.info({ jobId: job.id }, 'Backlink automation pipeline completed');
      } else if (type === 'backlink_discover') {
        await runDiscoverWebsites(
          String(job.data.workspaceId),
          (job.data.inputs as Record<string, unknown>) ?? {},
          {
            userId: job.data.userId ? String(job.data.userId) : undefined,
            orgId: job.data.orgId ? String(job.data.orgId) : undefined,
          }
        );
        logger.info({ jobId: job.id }, 'Backlink discovery completed');
      } else {
        logger.debug({ jobId: job.id, type }, 'Unknown backlink job type');
      }
    } catch (err) {
      logger.error({ jobId: job.id, type, err }, 'Backlink job failed');
      throw err;
    }
  }
}
