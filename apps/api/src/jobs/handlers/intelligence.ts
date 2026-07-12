import { executeWebsiteScan } from '../../modules/intelligence/website-scan.service.js';
import { runTechnicalAudit } from '../../modules/technical-seo/technical-seo.service.js';
import { logger } from '../../lib/logger.js';

export async function handleIntelligenceScanJobs(
  jobs: Array<{ id: string; data: Record<string, unknown> }>
): Promise<void> {
  for (const job of jobs) {
    const type = String(job.data.type ?? '');
    if (type === 'technical_audit' || type === 'technical.audit') {
      const auditId = String(job.data.auditId ?? '');
      const workspaceId = String(job.data.workspaceId ?? '');
      if (!auditId || !workspaceId) {
        logger.warn({ jobId: job.id }, 'Technical audit job missing fields');
        continue;
      }
      logger.info({ jobId: job.id, auditId }, 'Processing technical SEO audit job');
      await runTechnicalAudit(auditId, workspaceId);
      continue;
    }

    const { scanId, workspaceId, orgId } = job.data as {
      scanId: string;
      workspaceId: string;
      orgId?: string;
    };
    logger.info({ jobId: job.id, scanId }, 'Processing browser intelligence scan job');
    await executeWebsiteScan(scanId, workspaceId, orgId);
  }
}
