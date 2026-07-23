/**
 * Phase 6.3.4 — Record execution failures with full stack; never silent-requeue.
 * A leased/running job that throws must land Failed or Retrying with a Why/Blocker.
 */
import {
  classifyExecutionError,
  isAutoRetryable,
  analyzeFailureAi,
} from '@seo-os/backlink-builder';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';

export type RecordFailureResult = {
  outcome: 'failed' | 'retrying' | 'waiting_infrastructure' | 'waiting_human';
  failureCode: string;
  message: string;
  attempt: number;
};

/**
 * Persist failure on the job + opportunity pipeline meta (Campaign Health Why/Blocker).
 * Never leaves the job as Queued without a logged error.
 */
export async function recordFailure(params: {
  workspaceId: string;
  jobId: string;
  err: unknown;
  source: string;
  step?: string | null;
  /** Prefer retry_scheduled when retryable and under max attempts */
  allowRetry?: boolean;
}): Promise<RecordFailureResult> {
  const { workspaceId, jobId, err, source } = params;
  const stack = err instanceof Error ? err.stack ?? err.message : String(err);
  const message = err instanceof Error ? err.message : String(err);
  const classified = classifyExecutionError(err, { step: params.step ?? null });
  const failureCode = classified.failureCode;
  const fullMessage = `${classified.label}: ${message}`.slice(0, 800);
  const analysis = analyzeFailureAi({
    failureCode,
    failureMessage: classified.failureMessage,
    status: 'failed',
  });

  const { data: job } = await getSupabaseAdmin()
    .from('execution_jobs')
    .select('id, opportunity_id, retry_count, status, session_id, metrics')
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  const attempt = Number(job?.retry_count ?? 0) + 1;
  const prevMetrics = (job?.metrics as Record<string, unknown> | null) ?? {};

  let maxRetries = 2;
  try {
    const { getOrCreatePolicy } = await import('./bee.service.js');
    const policy = await getOrCreatePolicy(workspaceId);
    maxRetries = Number(policy.retry_count ?? 2);
  } catch {
    /* default */
  }

  const retryable =
    params.allowRetry !== false && isAutoRetryable(failureCode) && attempt <= maxRetries;

  // Browser missing → waiting_infrastructure (still a logged, non-silent state)
  const isRuntimeMissing =
    failureCode === 'BROWSER_RUNTIME_MISSING' ||
    /Browser Runtime Missing|executable doesn't exist|could not find browser|playwright.*install chromium/i.test(
      `${fullMessage} ${stack}`
    );

  let outcome: RecordFailureResult['outcome'] = 'failed';
  let nextStatus = 'failed';
  let disposition: string | null = 'failed';

  if (isRuntimeMissing) {
    outcome = 'waiting_infrastructure';
    nextStatus = 'waiting_infrastructure';
    disposition = 'waiting_infrastructure';
  } else if (retryable) {
    outcome = 'retrying';
    nextStatus = 'retry_scheduled';
    disposition = null;
  } else {
    outcome = 'failed';
    nextStatus = 'failed';
    disposition = 'failed';
  }

  const now = new Date().toISOString();
  const metrics = {
    ...prevMetrics,
    failure: {
      failureCode,
      failureMessage: classified.failureMessage,
      failureStep: classified.failureStep ?? params.step ?? null,
      failureTimestamp: now,
      label: classified.label,
      suggestedFix: classified.suggestedFix,
      stack: stack.slice(0, 8000),
      analysis,
      source,
      attempt,
      maxRetries,
      outcome,
    },
    lastError: fullMessage,
    lastErrorStack: stack.slice(0, 8000),
    lastErrorSource: source,
  };

  await getSupabaseAdmin()
    .from('execution_jobs')
    .update({
      status: nextStatus,
      disposition,
      error_code: failureCode,
      error_message: fullMessage,
      failure_classification: failureCode,
      retry_count: attempt,
      finished_at: outcome === 'retrying' ? null : now,
      session_id: outcome === 'retrying' ? null : job?.session_id ?? null,
      lease_holder: null,
      lease_expires_at: null,
      metrics,
      updated_at: now,
    })
    .eq('id', jobId)
    .eq('workspace_id', workspaceId);

  // Opportunity last_error + pipeline meta → Campaign Health Why / Blocker
  const opportunityId = job?.opportunity_id ? String(job.opportunity_id) : null;
  if (opportunityId) {
    try {
      const { data: opp } = await getSupabaseAdmin()
        .from('opportunities')
        .select('metadata')
        .eq('id', opportunityId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      const meta = (opp?.metadata as Record<string, unknown> | null) ?? {};
      const prevPipe =
        typeof meta.execution_pipeline === 'object' && meta.execution_pipeline
          ? (meta.execution_pipeline as Record<string, unknown>)
          : {};
      const why = `[${source}] ${fullMessage}`.slice(0, 1000);
      const oppUpdate: Record<string, unknown> = {
        last_error: why,
        metadata: {
          ...meta,
          execution_pipeline: {
            ...prevPipe,
            whyNoJob: why,
            verifiedBlocker: why,
            creationError: why,
            creationStack: stack.slice(0, 4000),
            lastFailureCode: failureCode,
            lastFailureSource: source,
            lastFailureAttempt: attempt,
            updatedAt: now,
          },
        },
        updated_at: now,
      };
      if (outcome === 'retrying') oppUpdate.campaign_lifecycle = 'Retrying';
      else if (outcome === 'failed') oppUpdate.campaign_lifecycle = 'Failed';
      await getSupabaseAdmin()
        .from('opportunities')
        .update(oppUpdate)
        .eq('id', opportunityId)
        .eq('workspace_id', workspaceId);

      try {
        const { updateCampaignItem } = await import('../campaigns/campaign-state.service.js');
        await updateCampaignItem(workspaceId, opportunityId, {
          currentStatus: outcome === 'retrying' ? 'Retrying' : 'Failed',
          lastError: why,
          force: true,
        });
      } catch {
        /* CSM optional */
      }
    } catch (metaErr) {
      logger.warn({ metaErr, opportunityId, jobId }, 'recordFailure: opportunity meta write failed');
    }
  }

  try {
    const { appendLog } = await import('./bee.service.js');
    await appendLog(workspaceId, jobId, 'error', fullMessage, {
      failureCode,
      source,
      attempt,
      outcome,
      stack: stack.slice(0, 2000),
    });
  } catch {
    /* best-effort */
  }

  logger.error(
    { jobId, workspaceId, failureCode, outcome, attempt, source },
    'recordFailure — job left Running/Queued without silent requeue'
  );

  // Schedule delayed retry without clearing the error trail
  if (outcome === 'retrying') {
    try {
      const { retryJob } = await import('./bee.service.js');
      const { retryBackoffSeconds } = await import('@seo-os/backlink-builder');
      const delaySec = retryBackoffSeconds(attempt) ?? 10;
      await retryJob(workspaceId, jobId, { delaySeconds: delaySec });
    } catch (retryErr) {
      logger.warn({ retryErr, jobId }, 'recordFailure: retry schedule failed — leaving Failed');
      await getSupabaseAdmin()
        .from('execution_jobs')
        .update({
          status: 'failed',
          disposition: 'failed',
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
      return { outcome: 'failed', failureCode, message: fullMessage, attempt };
    }
  }

  if (isRuntimeMissing) {
    try {
      const { parkJobWaitingInfrastructure } = await import(
        './browser-runtime-manager.service.js'
      );
      await parkJobWaitingInfrastructure(workspaceId, jobId, fullMessage);
    } catch {
      /* already stamped */
    }
  }

  return { outcome, failureCode, message: fullMessage, attempt };
}

/**
 * Stamp a Why/Blocker when requeueing for recovery — never clear the trail.
 * Call from lease sweep / supervision instead of blank Queued.
 */
export async function stampRequeueTrace(params: {
  workspaceId: string;
  jobId: string;
  reason: string;
  source: string;
}): Promise<void> {
  const { workspaceId, jobId, reason, source } = params;
  const now = new Date().toISOString();
  const { data: job } = await getSupabaseAdmin()
    .from('execution_jobs')
    .select('opportunity_id, metrics, error_message')
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  const prevMetrics = (job?.metrics as Record<string, unknown> | null) ?? {};
  const msg = `[${source}] ${reason}`.slice(0, 800);
  await getSupabaseAdmin()
    .from('execution_jobs')
    .update({
      error_message: job?.error_message ? String(job.error_message) : msg,
      metrics: {
        ...prevMetrics,
        requeueTrace: { reason: msg, source, at: now },
        lastError: job?.error_message ? String(job.error_message) : msg,
      },
      updated_at: now,
    })
    .eq('id', jobId);

  const opportunityId = job?.opportunity_id ? String(job.opportunity_id) : null;
  if (!opportunityId) return;
  const { data: opp } = await getSupabaseAdmin()
    .from('opportunities')
    .select('metadata, last_error')
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  const meta = (opp?.metadata as Record<string, unknown> | null) ?? {};
  const prevPipe =
    typeof meta.execution_pipeline === 'object' && meta.execution_pipeline
      ? (meta.execution_pipeline as Record<string, unknown>)
      : {};
  const why = String(opp?.last_error || prevPipe.whyNoJob || msg).slice(0, 1000);
  await getSupabaseAdmin()
    .from('opportunities')
    .update({
      last_error: why,
      metadata: {
        ...meta,
        execution_pipeline: {
          ...prevPipe,
          whyNoJob: why,
          verifiedBlocker: why,
          creationError: prevPipe.creationError || msg,
          lastRequeueReason: msg,
          updatedAt: now,
        },
      },
      updated_at: now,
    })
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId);
}

/** Assert job is not left Running without terminal status or logged error. */
export async function assertLeftRunningSafely(
  workspaceId: string,
  jobId: string
): Promise<void> {
  const { data: job } = await getSupabaseAdmin()
    .from('execution_jobs')
    .select('status, error_message, metrics, disposition')
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!job) return;
  const st = String(job.status);
  const inFlight = [
    'preparing',
    'launching_browser',
    'authenticating',
    'navigating',
    'analyzing_form',
    'uploading_assets',
    'filling_fields',
    'validating',
    'submitting',
    'waiting_verification',
    'running',
  ].includes(st);
  if (!inFlight) return;
  const hasError =
    Boolean(job.error_message) ||
    Boolean((job.metrics as { failure?: unknown } | null)?.failure);
  if (hasError) return;
  // Soft-fail: stamp and fail — never leave Running with no trace
  await recordFailure({
    workspaceId,
    jobId,
    err: new Error(
      `Invariant: job left ${st} without terminal status or logged error (Phase 6.3.4)`
    ),
    source: 'assertLeftRunningSafely',
    allowRetry: false,
  });
}
