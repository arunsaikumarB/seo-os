import { logger } from '../lib/logger.js';
import { getBoss, registerJobHandler, QUEUES } from './boss.js';
import { handleAgentJobs } from './handlers/agents.js';
import { handleIngestJobs } from './handlers/ingest.js';
import { handleIntelligenceScanJobs } from './handlers/intelligence.js';

export async function startJobInfrastructure(): Promise<void> {
  const boss = await getBoss();
  if (!boss) return;

  await registerJobHandler(QUEUES.AGENTS, async (jobs) => {
    await handleAgentJobs(jobs.map((j) => ({ id: j.id, data: j.data as Record<string, unknown> })));
  });

  await registerJobHandler(QUEUES.INGEST, async (jobs) => {
    await handleIngestJobs(jobs.map((j) => ({ id: j.id, data: j.data as Record<string, unknown> })));
  });

  await registerJobHandler(QUEUES.LOW, async (jobs) => {
    const intelligence = jobs.filter((j) => (j.data as Record<string, unknown>).scanId);
    const other = jobs.filter((j) => !(j.data as Record<string, unknown>).scanId);
    if (intelligence.length) {
      await handleIntelligenceScanJobs(
        intelligence.map((j) => ({ id: j.id, data: j.data as Record<string, unknown> }))
      );
    }
    for (const job of other) {
      logger.debug({ jobId: job.id }, 'Low-priority job received');
    }
  });

  logger.info('Job infrastructure ready (agents queue registered)');
}
