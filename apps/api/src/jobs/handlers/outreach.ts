import { logger } from '../../lib/logger.js';
import { executeSendMessage } from '../../modules/outreach/outreach.service.js';

export async function handleOutreachJobs(
  jobs: Array<{ id: string; data: Record<string, unknown> }>
): Promise<void> {
  for (const job of jobs) {
    const messageId = String(job.data.messageId ?? '');
    const workspaceId = String(job.data.workspaceId ?? '');
    if (!messageId || !workspaceId) {
      logger.warn({ jobId: job.id }, 'Outreach job missing messageId or workspaceId');
      continue;
    }
    try {
      await executeSendMessage(messageId, workspaceId);
      logger.info({ jobId: job.id, messageId }, 'Outreach message sent');
    } catch (err) {
      logger.error({ jobId: job.id, messageId, err }, 'Outreach send failed');
      throw err;
    }
  }
}
