/**
 * Execution Pipeline — Ready → Execution Job reconciler + diagnostics.
 * Production Validation Mode: no Ready item may lack a job or verified terminal state.
 */
import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import {
  createExecution,
  startJob,
  markJobFailedToStart,
  appendLog,
} from './bee.service.js';
import {
  getSiteProfileByDomain,
  isOutreachOnlyProfile,
  isPaidDirectoryNeedsReview,
  isProfileExecutionReady,
} from './site-intelligence.service.js';

export type PipelineItemDiag = {
  campaignItemId: string;
  website: string;
  domain: string | null;
  currentStatus: string | null;
  campaignLifecycle: string | null;
  executionJobExists: boolean;
  executionJobId: string | null;
  executionJobStatus: string | null;
  whyNoJob: string | null;
  queueAccepted: boolean | null;
  workerAssigned: boolean | null;
  browserAllocated: boolean | null;
  startApiCalled: boolean | null;
  startApiResponse: string | null;
  workerState: string | null;
  browserState: string | null;
  queuePosition: number | null;
  verifiedBlocker: string | null;
  creationError: string | null;
  creationStack: string | null;
};

export type ExecutionDiagnostics = {
  readyItems: number;
  executionJobsCreated: number;
  jobsQueued: number;
  jobsRunning: number;
  jobsWaitingHuman: number;
  jobsFailed: number;
  jobsCompleted: number;
  jobsSkipped: number;
  missingExecutionJobs: number;
  pipelineBroken: boolean;
  rootCause: string | null;
  items: PipelineItemDiag[];
  ensuredAt?: string;
  ensureSummary?: {
    created: number;
    started: number;
    skippedTerminal: number;
    failed: number;
    alreadyHadJob: number;
  };
};

type ReadyOpp = {
  id: string;
  domain: string | null;
  url: string | null;
  website_name: string | null;
  campaign_lifecycle: string | null;
  pipeline_stage: string | null;
  generation_status: string | null;
  package_approved_by: string | null;
  automation_status: string | null;
  metadata: Record<string, unknown> | null;
  last_error: string | null;
};

function admin() {
  return getSupabaseAdmin();
}

async function writeOppPipelineMeta(
  workspaceId: string,
  opportunityId: string,
  patch: Record<string, unknown>
) {
  const { data: opp } = await admin()
    .from('opportunities')
    .select('metadata')
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  const meta = (opp?.metadata as Record<string, unknown> | null) ?? {};
  const prev =
    typeof meta.execution_pipeline === 'object' && meta.execution_pipeline
      ? (meta.execution_pipeline as Record<string, unknown>)
      : {};
  await admin()
    .from('opportunities')
    .update({
      metadata: {
        ...meta,
        execution_pipeline: {
          ...prev,
          ...patch,
          updatedAt: new Date().toISOString(),
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId);
}

/** Ready campaign items that must have an execution job or terminal state. */
export async function listReadyCampaignItems(workspaceId: string): Promise<ReadyOpp[]> {
  const { data, error } = await admin()
    .from('opportunities')
    .select(
      'id, domain, url, website_name, campaign_lifecycle, pipeline_stage, generation_status, package_approved_by, automation_status, metadata, last_error'
    )
    .eq('workspace_id', workspaceId)
    .or('campaign_lifecycle.eq.Ready,pipeline_stage.eq.campaign_ready')
    .not('automation_status', 'in', '("deleted","ignored")')
    .order('domain');
  if (error) throw error;
  return ((data ?? []) as ReadyOpp[]).filter((o) => {
    const life = String(o.campaign_lifecycle ?? '');
    if (
      [
        'Submitting',
        'Waiting Human',
        'Retrying',
        'Submitted',
        'Verified',
        'Completed',
        'Failed',
        'Ignored',
        'Deleted',
      ].includes(life)
    ) {
      return false;
    }
    if (life === 'Ready') return true;
    if (o.pipeline_stage === 'campaign_ready' && o.package_approved_by) return true;
    if (o.pipeline_stage === 'campaign_ready' && o.generation_status === 'Completed') return true;
    return false;
  });
}

async function latestJobForOpp(workspaceId: string, opportunityId: string) {
  const { data } = await admin()
    .from('execution_jobs')
    .select(
      'id, status, disposition, error_code, error_message, metrics, created_at, browser_session_id, worker_id'
    )
    .eq('workspace_id', workspaceId)
    .eq('opportunity_id', opportunityId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

function isTerminalJobStatus(status: string, disposition?: string | null): boolean {
  if (['completed', 'failed', 'skipped', 'deleted', 'ignored', 'cancelled'].includes(status))
    return true;
  if (disposition === 'failed_to_start') return true;
  return false;
}

function isActiveOrTerminalJob(status: string, disposition?: string | null): boolean {
  if (isTerminalJobStatus(status, disposition)) return true;
  return ['queued', 'preparing', 'running', 'waiting_human', 'paused', 'starting'].includes(
    status
  );
}

/**
 * Create a terminal skipped job when a verified blocker prevents browser start.
 */
export async function createVerifiedBlockerJob(params: {
  workspaceId: string;
  opportunityId: string;
  domain: string;
  reason: string;
  code: string;
  userId?: string;
}) {
  const jobId = randomUUID();
  const { data: job, error } = await admin()
    .from('execution_jobs')
    .insert({
      id: jobId,
      workspace_id: params.workspaceId,
      opportunity_id: params.opportunityId,
      mode: 'prepare',
      status: 'skipped',
      disposition: 'skipped',
      site_domain: params.domain,
      error_code: params.code,
      error_message: params.reason,
      finished_at: new Date().toISOString(),
      plan_snapshot: { verifiedBlocker: true, code: params.code, reason: params.reason },
      policy_snapshot: {},
      mapping_overrides: {},
      metrics: {
        verifiedBlocker: true,
        skipBrowserAutomation: true,
        disposition: 'skipped',
        blockerCode: params.code,
      },
      created_by: params.userId ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;

  await appendLog(params.workspaceId, jobId, 'warn', 'Verified blocker — no browser start', {
    code: params.code,
    reason: params.reason,
  }).catch(() => undefined);

  await writeOppPipelineMeta(params.workspaceId, params.opportunityId, {
    executionJobExists: true,
    executionJobId: jobId,
    verifiedBlocker: params.reason,
    whyNoBrowser: params.reason,
    startApiCalled: false,
    queueAccepted: false,
  });

  return job;
}

async function detectVerifiedBlocker(
  workspaceId: string,
  domain: string
): Promise<{ code: string; reason: string } | null> {
  if (!domain || domain === 'unknown') {
    return { code: 'NO_DOMAIN', reason: 'Campaign item has no domain' };
  }
  const profile = await getSiteProfileByDomain(workspaceId, domain);
  if (!profile) return null;
  if (profile.profile_status === 'failed') {
    return {
      code: 'SITE_UNPROFILABLE',
      reason: profile.last_error || 'Site profiling failed',
    };
  }
  if (profile.profile_status === 'unsupported') {
    return {
      code: 'SITE_UNSUPPORTED',
      reason: 'Site unsupported for submission — no evidence-backed path',
    };
  }
  if (isPaidDirectoryNeedsReview(profile)) {
    return {
      code: 'PAID_DIRECTORY',
      reason: 'Paid / premium directory — Needs Review (never auto-pay)',
    };
  }
  if (isOutreachOnlyProfile(profile)) {
    return {
      code: 'EMAIL_OUTREACH_ONLY',
      reason: 'Email / outreach strategy — no browser automation',
    };
  }
  if (profile.profile_status === 'complete' && !isProfileExecutionReady(profile)) {
    const strat = profile.strategy as { chosen?: string; entryUrl?: string | null } | null;
    return {
      code: 'PROFILE_NOT_EXECUTABLE',
      reason: `Profile complete but not executable (strategy=${strat?.chosen ?? 'none'}, entryUrl=${strat?.entryUrl ?? 'none'})`,
    };
  }
  return null;
}

/**
 * Ensure every Ready item has an execution job (or verified terminal skipped job).
 */
export async function ensureExecutionJobsForReady(params: {
  workspaceId: string;
  userId?: string;
  startImmediately?: boolean;
}): Promise<{
  diagnostics: ExecutionDiagnostics;
  ensureSummary: NonNullable<ExecutionDiagnostics['ensureSummary']>;
}> {
  const startImmediately = params.startImmediately !== false;
  const ready = await listReadyCampaignItems(params.workspaceId);
  const summary = {
    created: 0,
    started: 0,
    skippedTerminal: 0,
    failed: 0,
    alreadyHadJob: 0,
  };

  logger.info(
    { workspaceId: params.workspaceId, ready: ready.length, startImmediately },
    'execution pipeline ensure start'
  );

  for (const item of ready) {
    const domain = String(item.domain ?? 'unknown');
    const website = String(item.website_name || item.domain || item.id);
    try {
      const existing = await latestJobForOpp(params.workspaceId, item.id);
      if (
        existing &&
        isActiveOrTerminalJob(String(existing.status), existing.disposition as string | null)
      ) {
        summary.alreadyHadJob++;
        await writeOppPipelineMeta(params.workspaceId, item.id, {
          executionJobExists: true,
          executionJobId: existing.id,
          executionJobStatus: existing.status,
          whyNoJob: null,
        });
        continue;
      }

      const blocker = await detectVerifiedBlocker(params.workspaceId, domain);
      if (blocker) {
        await createVerifiedBlockerJob({
          workspaceId: params.workspaceId,
          opportunityId: item.id,
          domain,
          reason: blocker.reason,
          code: blocker.code,
          userId: params.userId,
        });
        summary.skippedTerminal++;
        summary.created++;
        continue;
      }

      let jobId: string | null = null;
      try {
        const job = await createExecution({
          workspaceId: params.workspaceId,
          opportunityId: item.id,
          mode: 'prepare',
          userId: params.userId,
        });
        jobId = String(job.id);
        summary.created++;
        await writeOppPipelineMeta(params.workspaceId, item.id, {
          executionJobExists: true,
          executionJobId: jobId,
          executionJobStatus: 'queued',
          whyNoJob: null,
          queueAccepted: true,
          startApiCalled: false,
          creationError: null,
          creationStack: null,
        });

        try {
          const { updateCampaignItem } = await import('../campaigns/campaign-state.service.js');
          await updateCampaignItem(params.workspaceId, item.id, {
            currentStatus: 'Submitting',
            submissionStatus: 'pending',
            lastError: null,
            force: true,
          });
        } catch (lifeErr) {
          logger.warn(
            { opportunityId: item.id, err: lifeErr },
            'lifecycle → Submitting failed (job still created)'
          );
        }

        if (startImmediately) {
          await writeOppPipelineMeta(params.workspaceId, item.id, { startApiCalled: true });
          try {
            const started = await startJob(params.workspaceId, jobId, params.userId);
            summary.started++;
            await writeOppPipelineMeta(params.workspaceId, item.id, {
              startApiResponse: String(started?.status ?? 'ok'),
              executionJobStatus: String(started?.status ?? 'queued'),
              queueAccepted: true,
              workerAssigned: Boolean(
                (started as { worker_id?: string } | null)?.worker_id ||
                  (started as { metrics?: { workerId?: string } } | null)?.metrics?.workerId
              ),
            });
          } catch (startErr) {
            const msg = startErr instanceof Error ? startErr.message : String(startErr);
            const stack = startErr instanceof Error ? startErr.stack ?? null : null;
            await markJobFailedToStart(params.workspaceId, jobId, msg);
            await writeOppPipelineMeta(params.workspaceId, item.id, {
              startApiCalled: true,
              startApiResponse: msg,
              creationError: msg,
              creationStack: stack,
            });
            summary.failed++;
            logger.error(
              { opportunityId: item.id, jobId, msg, stack },
              'execution pipeline start failed'
            );
          }
        }
      } catch (createErr) {
        const msg = createErr instanceof Error ? createErr.message : String(createErr);
        const stack = createErr instanceof Error ? createErr.stack ?? null : null;
        summary.failed++;
        await writeOppPipelineMeta(params.workspaceId, item.id, {
          executionJobExists: false,
          whyNoJob: msg,
          creationError: msg,
          creationStack: stack,
          startApiCalled: false,
          currentState: item.campaign_lifecycle,
          website,
        });
        await admin()
          .from('opportunities')
          .update({
            last_error: `execution_job_create_failed: ${msg}`.slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id);
        logger.error(
          {
            opportunityId: item.id,
            website,
            domain,
            msg,
            stack,
            campaignId: params.workspaceId,
            currentState: item.campaign_lifecycle,
          },
          'execution_job creation failed — not silent'
        );
      }
    } catch (err) {
      summary.failed++;
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack ?? null : null;
      await writeOppPipelineMeta(params.workspaceId, item.id, {
        whyNoJob: msg,
        creationError: msg,
        creationStack: stack,
      });
      logger.error({ opportunityId: item.id, msg, stack }, 'ensure loop item failed');
    }
  }

  const diagnostics = await getExecutionDiagnostics(params.workspaceId);
  diagnostics.ensuredAt = new Date().toISOString();
  diagnostics.ensureSummary = summary;
  return { diagnostics, ensureSummary: summary };
}

export async function getExecutionDiagnostics(
  workspaceId: string
): Promise<ExecutionDiagnostics> {
  const ready = await listReadyCampaignItems(workspaceId);
  const { data: allJobs } = await admin()
    .from('execution_jobs')
    .select('id, opportunity_id, status, disposition, metrics, error_message, site_domain')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null);

  const jobs = allJobs ?? [];
  const byOpp = new Map<string, (typeof jobs)[0]>();
  for (const j of jobs) {
    const oid = String(j.opportunity_id);
    if (!byOpp.has(oid)) byOpp.set(oid, j);
  }

  const countStatus = (pred: (s: string, d: string | null) => boolean) =>
    jobs.filter((j) => pred(String(j.status), (j.disposition as string | null) ?? null)).length;

  const jobsQueued = countStatus((s) => ['queued', 'preparing', 'starting'].includes(s));
  const jobsRunning = countStatus((s) => s === 'running');
  const jobsWaitingHuman = countStatus((s) => s === 'waiting_human');
  const jobsFailed = countStatus((s, d) => s === 'failed' || d === 'failed_to_start');
  const jobsCompleted = countStatus((s) => ['completed', 'submitted', 'verified'].includes(s));
  const jobsSkipped = countStatus((s) => s === 'skipped');

  const items: PipelineItemDiag[] = [];
  let missing = 0;

  for (const item of ready) {
    const job = byOpp.get(item.id);
    const meta = (item.metadata as Record<string, unknown> | null) ?? {};
    const pipe =
      typeof meta.execution_pipeline === 'object' && meta.execution_pipeline
        ? (meta.execution_pipeline as Record<string, unknown>)
        : {};
    const metrics = (job?.metrics as Record<string, unknown> | null) ?? {};
    const exists = Boolean(job);
    if (!exists) missing++;

    items.push({
      campaignItemId: item.id,
      website: String(item.website_name || item.domain || item.id),
      domain: item.domain,
      currentStatus: item.campaign_lifecycle,
      campaignLifecycle: item.campaign_lifecycle,
      executionJobExists: exists,
      executionJobId: job ? String(job.id) : null,
      executionJobStatus: job ? String(job.status) : null,
      whyNoJob: exists
        ? null
        : (pipe.whyNoJob as string) ||
          (pipe.creationError as string) ||
          'Ready item has no execution_jobs row — ensure never ran or create failed',
      queueAccepted: exists
        ? [
            'queued',
            'preparing',
            'starting',
            'running',
            'waiting_human',
            'completed',
            'skipped',
            'failed',
          ].includes(String(job!.status))
        : ((pipe.queueAccepted as boolean | null) ?? false),
      workerAssigned: Boolean(
        metrics.workerId || (job as { worker_id?: string } | undefined)?.worker_id
      ),
      browserAllocated: Boolean(
        metrics.browserSessionId ||
          (job as { browser_session_id?: string } | undefined)?.browser_session_id
      ),
      startApiCalled: (pipe.startApiCalled as boolean | null) ?? null,
      startApiResponse: (pipe.startApiResponse as string | null) ?? null,
      workerState: metrics.workerState
        ? String(metrics.workerState)
        : job
          ? String(job.status)
          : null,
      browserState: metrics.browserState ? String(metrics.browserState) : null,
      queuePosition: null,
      verifiedBlocker:
        (pipe.verifiedBlocker as string) ||
        (job?.status === 'skipped' ? String(job.error_message ?? 'skipped') : null),
      creationError: (pipe.creationError as string) || null,
      creationStack: (pipe.creationStack as string) || null,
    });
  }

  const readyCount = ready.length;
  const jobsForReady = ready.filter((r) => byOpp.has(r.id)).length;
  const pipelineBroken = readyCount > jobsForReady;
  let rootCause: string | null = null;
  if (pipelineBroken) {
    const sample = items.find((i) => !i.executionJobExists);
    rootCause =
      sample?.creationError ||
      sample?.whyNoJob ||
      'Ready Campaign Items exist without execution_jobs — ensureExecutionJobsForReady was not invoked or createExecution failed';
  }

  return {
    readyItems: readyCount,
    executionJobsCreated: jobsForReady,
    jobsQueued,
    jobsRunning,
    jobsWaitingHuman,
    jobsFailed,
    jobsCompleted,
    jobsSkipped,
    missingExecutionJobs: missing,
    pipelineBroken,
    rootCause,
    items,
  };
}
