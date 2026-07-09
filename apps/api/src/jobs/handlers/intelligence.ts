import { executeWebsiteScan } from '../../modules/intelligence/website-scan.service.js';
import { logger } from '../../lib/logger.js';

export async function handleIntelligenceScanJobs(
  jobs: Array<{ id: string; data: Record<string, unknown> }>
): Promise<void> {
  for (const job of jobs) {
    const { scanId, workspaceId, orgId } = job.data as {
      scanId: string;
      workspaceId: string;
      orgId?: string;
    };
    logger.info({ jobId: job.id, scanId }, 'Processing browser intelligence scan job');
    await executeWebsiteScan(scanId, workspaceId, orgId);
  }
}
