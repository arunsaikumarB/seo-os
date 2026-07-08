import { ingestDocument } from '../../modules/knowledge/ingestion.service.js';
import { logger } from '../../lib/logger.js';

export async function handleIngestJobs(
  jobs: Array<{ id: string; data: Record<string, unknown> }>
): Promise<void> {
  for (const job of jobs) {
    const { documentId, workspaceId } = job.data as {
      documentId: string;
      workspaceId: string;
    };
    logger.info({ jobId: job.id, documentId }, 'Processing KB ingest job');
    await ingestDocument(documentId, workspaceId);
  }
}
