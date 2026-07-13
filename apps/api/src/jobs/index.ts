import { logger } from '../lib/logger.js';
import { getBoss, registerJobHandler, QUEUES } from './boss.js';
import { handleAgentJobs } from './handlers/agents.js';
import { handleIngestJobs } from './handlers/ingest.js';
import { handleIntelligenceScanJobs } from './handlers/intelligence.js';
import { handleOutreachJobs } from './handlers/outreach.js';
import { handleWorkflowJobs } from './handlers/workflow.js';
import { handleReportJobs } from './handlers/reports.js';
import { handleIntegrationJobs } from './handlers/integrations.js';
import { handleBacklinkJobs } from './handlers/backlinks.js';
import { handlePlaywrightJobs } from './handlers/playwright.js';
import { handleBeeCleanupJobs, handleBeeLearningJobs } from './handlers/bee-learning.js';
import {
  handleBeeQueueJobs,
  handleBeeResumeJobs,
  handleBeeSessionHealthJobs,
  handleBeeWatchJobs,
} from '../modules/browser-execution/bee-watchers.js';
import { handleImageJobs } from '../modules/image-intelligence/iie-worker.js';
import { handleProviderJobs } from '../modules/providers/pif-worker.js';

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
    const all = jobs.map((j) => ({ id: j.id, data: j.data as Record<string, unknown> }));
    const backlinkJobs = all.filter((j) =>
      String(j.data.type ?? '').startsWith('backlink_')
    );
    const scanJobs = all.filter((j) => !String(j.data.type ?? '').startsWith('backlink_'));
    if (backlinkJobs.length) await handleBacklinkJobs(backlinkJobs);
    if (scanJobs.length) await handleIntelligenceScanJobs(scanJobs);
  });

  await registerJobHandler(QUEUES.PLAYWRIGHT, async (jobs) => {
    const mapped = jobs.map((j) => ({ id: j.id, data: j.data as Record<string, unknown> }));
    const watch = mapped.filter((j) => String(j.data.type ?? '') === 'bee_watch');
    const resume = mapped.filter((j) => String(j.data.type ?? '') === 'bee_resume');
    const exec = mapped.filter(
      (j) =>
        String(j.data.type ?? '') !== 'bee_watch' && String(j.data.type ?? '') !== 'bee_resume'
    );
    if (watch.length) await handleBeeWatchJobs(watch);
    if (resume.length) await handleBeeResumeJobs(resume);
    if (exec.length) await handlePlaywrightJobs(exec);
  });

  await registerJobHandler(QUEUES.LOW, async (jobs) => {
    const outreachJobs = jobs.filter((j) => (j.data as Record<string, unknown>)?.messageId);
    const workflowJobs = jobs.filter(
      (j) => (j.data as Record<string, unknown>)?.type === 'workflow_advance'
    );
    const reportJobs = jobs.filter(
      (j) => (j.data as Record<string, unknown>)?.type === 'report_generate'
    );
    const integrationJobs = jobs.filter(
      (j) => (j.data as Record<string, unknown>)?.type === 'integration_sync'
    );
    const beeLearning = jobs.filter(
      (j) => (j.data as Record<string, unknown>)?.type === 'bee_learning'
    );
    const beeCleanup = jobs.filter(
      (j) => (j.data as Record<string, unknown>)?.type === 'bee_cleanup'
    );
    const beeQueue = jobs.filter(
      (j) => (j.data as Record<string, unknown>)?.type === 'bee_queue'
    );
    const beeSessionHealth = jobs.filter(
      (j) => (j.data as Record<string, unknown>)?.type === 'bee_session_health'
    );
    const imageJobs = jobs.filter((j) =>
      String((j.data as Record<string, unknown>)?.type ?? '').startsWith('image_')
    );
    const providerJobs = jobs.filter((j) =>
      String((j.data as Record<string, unknown>)?.type ?? '').startsWith('provider_')
    );
    const otherJobs = jobs.filter((j) => {
      const d = j.data as Record<string, unknown>;
      return (
        !d?.messageId &&
        d?.type !== 'workflow_advance' &&
        d?.type !== 'report_generate' &&
        d?.type !== 'integration_sync' &&
        d?.type !== 'bee_learning' &&
        d?.type !== 'bee_cleanup' &&
        d?.type !== 'bee_queue' &&
        d?.type !== 'bee_session_health' &&
        !String(d?.type ?? '').startsWith('image_') &&
        !String(d?.type ?? '').startsWith('provider_')
      );
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
    if (reportJobs.length) {
      await handleReportJobs(
        reportJobs.map((j) => ({ id: j.id, data: j.data as Record<string, unknown> }))
      );
    }
    if (integrationJobs.length) {
      await handleIntegrationJobs(
        integrationJobs.map((j) => ({ id: j.id, data: j.data as Record<string, unknown> }))
      );
    }
    if (beeLearning.length) {
      await handleBeeLearningJobs(
        beeLearning.map((j) => ({ id: j.id, data: j.data as Record<string, unknown> }))
      );
    }
    if (beeCleanup.length) {
      await handleBeeCleanupJobs(
        beeCleanup.map((j) => ({ id: j.id, data: j.data as Record<string, unknown> }))
      );
    }
    if (beeQueue.length) {
      await handleBeeQueueJobs(
        beeQueue.map((j) => ({ id: j.id, data: j.data as Record<string, unknown> }))
      );
    }
    if (beeSessionHealth.length) {
      await handleBeeSessionHealthJobs(
        beeSessionHealth.map((j) => ({ id: j.id, data: j.data as Record<string, unknown> }))
      );
    }
    if (imageJobs.length) {
      await handleImageJobs(
        imageJobs.map((j) => ({ id: j.id, data: j.data as Record<string, unknown> }))
      );
    }
    if (providerJobs.length) {
      await handleProviderJobs(
        providerJobs.map((j) => ({ id: j.id, data: j.data as Record<string, unknown> }))
      );
    }
    for (const job of otherJobs) {
      logger.debug({ jobId: job.id }, 'Low-priority job received');
    }
  });

  logger.info(
    'Job infrastructure ready (agents, ingest, crawl, playwright/BEE+watch/resume, outreach, workflow, report, integration, bee-learning/queue/session-health, image-intelligence, provider-framework handlers registered)'
  );
}
