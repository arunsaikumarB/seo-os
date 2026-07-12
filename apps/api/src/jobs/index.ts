import { logger } from '../lib/logger.js';
import { getBoss, registerJobHandler, QUEUES } from './boss.js';
import { handleAgentJobs } from './handlers/agents.js';
import { handleIngestJobs } from './handlers/ingest.js';
import { handleIntelligenceScanJobs } from './handlers/intelligence.js';
import { handleOutreachJobs } from './handlers/outreach.js';
import { handleWorkflowJobs } from './handlers/workflow.js';

export async function startJobInfrastructure(): Promise<void> {
  const boss = await getBoss();
  if (!boss) return;

  await registerJobHandler(QUEUES.AGENTS, async (jobs) => {
    await handleAgentJobs(jobs.map((j) => ({ id: j.id, data: j.data as Record<string, unknown> })));
  });

  await registerJobHandler(QUEUES.INGEST, async (jobs) => {
    await handleIngestJobs(
      jobs.map((j) => ({ id: j.id, data: j.data as Record<string, unknown> }))
    );
  });

  await registerJobHandler(QUEUES.CRAWL, async (jobs) => {
    await handleIntelligenceScanJobs(
      jobs.map((j) => ({ id: j.id, data: j.data as Record<string, unknown> }))
    );
  });

  await registerJobHandler(QUEUES.LOW, async (jobs) => {
    const outreachJobs = jobs.filter((j) => (j.data as Record<string, unknown>)?.messageId);
    const workflowJobs = jobs.filter(
      (j) => (j.data as Record<string, unknown>)?.type === 'workflow_advance'
    );
    const otherJobs = jobs.filter((j) => {
      const d = j.data as Record<string, unknown>;
      return !d?.messageId && d?.type !== 'workflow_advance';
    });
    if (outreachJobs.length) {
      await handleOutreachJobs(
        outreachJobs.map((j) => ({ id: j.id, data: j.data as Record<string, unknown> }))
      );
    }
    if (workflowJobs.length) {
      await handleWorkflowJobs(
        workflowJobs.map((j) => ({ id: j.id, data: j.data as Record<string, unknown> }))
      );
    }
    for (const job of otherJobs) {
      logger.debug({ jobId: job.id }, 'Low-priority job received');
    }
  });

  logger.info(
    'Job infrastructure ready (agents, ingest, crawl, outreach, workflow handlers registered)'
  );
}
