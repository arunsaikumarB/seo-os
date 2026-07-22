/**
 * Human Intervention Queue actions — skip / delete forever / unsupported / bulk.
 * Never blocks the automatic submission worker queue.
 */
import { getSupabaseAdmin } from '../../lib/supabase.js';
import {
  appendLog,
  cancelJob,
  getJob,
  mergeJobMetrics,
  recordHistory,
  retryJob,
  setJobStatus,
} from './bee.service.js';
import { addToGlobalIgnore } from './bee-ignore.service.js';
import {
  cancelQueuedBossJobsForExecution,
  removeOpportunityFromProject,
} from './execution-state.service.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';
import { disposeSessionRuntime } from './browser-runtime.service.js';
import { persistSessionStorageState } from './bee-session.js';

async function releaseSession(job: Record<string, unknown>) {
  const sessionId = job.session_id ? String(job.session_id) : '';
  if (!sessionId) return;
  try {
    await persistSessionStorageState(sessionId).catch(() => undefined);
    await disposeSessionRuntime(sessionId).catch(() => undefined);
  } catch {
    /* optional */
  }
  await getSupabaseAdmin()
    .from('browser_sessions')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', sessionId);
}

async function drainQueue(workspaceId: string) {
  await enqueueJob(
    QUEUES.LOW,
    'bee_queue',
    { type: 'bee_queue', workspaceId },
    { singletonKey: `bee-queue-drain-${workspaceId}`, startAfter: 0 }
  );
}

async function syncOpportunityStatus(
  workspaceId: string,
  opportunityId: string | null | undefined,
  automationStatus: string
) {
  if (!opportunityId) return;
  await getSupabaseAdmin()
    .from('opportunities')
    .update({
      automation_status: automationStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId);
}

/**
 * Phase 6.3 — silently move a gated job to Manual (offline Excel).
 * Never leaves Waiting Human / never prompts Complete Now.
 * Disposition is manual_offline (not Failed).
 */
export async function divertToManualOffline(
  workspaceId: string,
  jobId: string,
  opts: {
    gate: string;
    truthClaim?: string | null;
    reason?: string;
    pausedUrl?: string | null;
  }
) {
  const { manualReasonFromGate } = await import('@seo-os/backlink-builder');
  const job = await getJob(workspaceId, jobId);
  if (!job) throw Object.assign(new Error('Job not found'), { status: 404 });

  const reasonLabel =
    opts.reason ??
    manualReasonFromGate(opts.gate, opts.truthClaim ?? null);

  await setJobStatus(workspaceId, jobId, 'skipped', {
    finished_at: new Date().toISOString(),
    disposition: 'manual_offline',
    disposition_at: new Date().toISOString(),
    pause_reason: opts.gate,
    error_code: null,
    error_message: null,
  });
  await releaseSession(job as Record<string, unknown>);
  await cancelQueuedBossJobsForExecution(jobId);
  await mergeJobMetrics(workspaceId, jobId, {
    disposition: 'manual_offline',
    dispositionReason: reasonLabel,
    submissionLane: 'manual',
    manualReason: reasonLabel,
    divertedFromGate: opts.gate,
    pausedUrl: opts.pausedUrl ?? null,
    truthClaim: opts.truthClaim ?? null,
  });

  const opportunityId = job.opportunity_id ? String(job.opportunity_id) : null;
  if (opportunityId) {
    try {
      const { updateCampaignItem } = await import('../campaigns/campaign-state.service.js');
      const { data: row } = await getSupabaseAdmin()
        .from('opportunities')
        .select('metadata')
        .eq('id', opportunityId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      const prev = (row?.metadata as Record<string, unknown> | null) ?? {};
      await updateCampaignItem(workspaceId, opportunityId, {
        currentStatus: 'Skipped',
        submissionStatus: 'Skipped',
        lastError: `Manual — ${reasonLabel}`,
        force: true,
      });
      await getSupabaseAdmin()
        .from('opportunities')
        .update({
          metadata: {
            ...prev,
            submissionLane: 'manual',
            manualReason: reasonLabel,
            laneSource: 'truth_engine_divert',
            laneSticky: true,
            divertedGate: opts.gate,
            divertedUrl: opts.pausedUrl ?? null,
            truthClaim: opts.truthClaim ?? null,
          },
          automation_status: 'manual_offline',
          updated_at: new Date().toISOString(),
        })
        .eq('id', opportunityId)
        .eq('workspace_id', workspaceId);
    } catch {
      await syncOpportunityStatus(workspaceId, opportunityId, 'manual_offline');
    }
  }

  await appendLog(workspaceId, jobId, 'info', 'Moved to Manual (offline) — auto queue continues', {
    gate: opts.gate,
    reason: reasonLabel,
  });
  await recordHistory(workspaceId, jobId, 'skipped');
  await drainQueue(workspaceId);
  return getJob(workspaceId, jobId);
}

/** Skip only this campaign/job — domain stays eligible for future projects. */
export async function skipInterventionJob(
  workspaceId: string,
  jobId: string,
  opts?: { userId?: string; reason?: string }
) {
  const job = await getJob(workspaceId, jobId);
  if (!job) throw Object.assign(new Error('Job not found'), { status: 404 });

  await setJobStatus(workspaceId, jobId, 'skipped', {
    finished_at: new Date().toISOString(),
    disposition: 'skipped',
    disposition_at: new Date().toISOString(),
    disposition_by: opts?.userId ?? null,
    pause_reason: job.pause_reason ?? null,
    error_code: null,
    error_message: null,
  });
  await releaseSession(job as Record<string, unknown>);
  await cancelQueuedBossJobsForExecution(jobId);
  await mergeJobMetrics(workspaceId, jobId, {
    disposition: 'skipped',
    dispositionReason: opts?.reason ?? 'skipped_campaign',
  });
  // Phase 4.5: track false-intervention rate when human marks no action needed
  if (
    opts?.reason === 'no_action_needed' ||
    opts?.reason === 'false_intervention' ||
    opts?.reason === 'auto_skip_login'
  ) {
    await getSupabaseAdmin()
      .from('execution_jobs')
      .update({ false_intervention: true, updated_at: new Date().toISOString() })
      .eq('id', jobId)
      .eq('workspace_id', workspaceId);
  }
  await syncOpportunityStatus(workspaceId, job.opportunity_id as string | null, 'skipped');
  await appendLog(workspaceId, jobId, 'warn', 'Skipped for this campaign', {
    reason: opts?.reason ?? 'skipped_campaign',
  });
  await recordHistory(workspaceId, jobId, 'skipped');
  await drainQueue(workspaceId);
  return getJob(workspaceId, jobId);
}

/**
 * Delete Forever — status becomes Deleted (never Failed).
 * Cancels execution, frees workers, drops queues, removes from project,
 * Global Ignore List, clears pending verification, recalculates via ESM.
 */
export async function deleteInterventionForever(
  workspaceId: string,
  jobId: string,
  opts?: { userId?: string; reason?: string }
) {
  const job = await getJob(workspaceId, jobId);
  if (!job) throw Object.assign(new Error('Job not found'), { status: 404 });
  const domain = String(job.site_domain ?? '');
  const opportunityId = job.opportunity_id ? String(job.opportunity_id) : null;

  // 1. Global Ignore List first
  if (domain) {
    await addToGlobalIgnore({
      workspaceId,
      siteDomain: domain,
      reason: opts?.reason ?? 'deleted_forever',
      sourceJobId: jobId,
      userId: opts?.userId,
    });
  }

  // 2. Cancel worker / session / queued boss jobs
  await releaseSession(job as Record<string, unknown>);
  await cancelQueuedBossJobsForExecution(jobId);

  // 3. Mark all steps cancelled
  await getSupabaseAdmin()
    .from('execution_steps')
    .update({ status: 'cancelled', finished_at: new Date().toISOString() })
    .eq('job_id', jobId)
    .in('status', ['pending', 'running', 'paused']);

  // 4. Status = deleted (never failed)
  await setJobStatus(workspaceId, jobId, 'deleted', {
    finished_at: new Date().toISOString(),
    disposition: 'deleted_forever',
    disposition_at: new Date().toISOString(),
    disposition_by: opts?.userId ?? null,
    pause_reason: null,
    error_code: null,
    error_message: null,
    watch_finished_at: new Date().toISOString(),
  });

  await mergeJobMetrics(workspaceId, jobId, {
    disposition: 'deleted_forever',
    globallyIgnored: true,
    removedFromProject: true,
  });

  // 5. Remove from current project + pending verification
  await removeOpportunityFromProject(workspaceId, opportunityId);

  // Also clear any pending backlinks by domain
  if (domain) {
    await getSupabaseAdmin()
      .from('backlinks')
      .update({
        verification_status: 'lost',
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', workspaceId)
      .eq('domain', domain)
      .eq('verification_status', 'pending');
  }

  await appendLog(workspaceId, jobId, 'warn', 'Deleted forever — removed from project', {
    domain,
    status: 'deleted',
  });
  await recordHistory(workspaceId, jobId, 'deleted');
  await drainQueue(workspaceId);
  return getJob(workspaceId, jobId);
}

/** Mark site unsupported for this campaign (optional ignore). */
export async function markInterventionUnsupported(
  workspaceId: string,
  jobId: string,
  opts?: { userId?: string; addToIgnore?: boolean }
) {
  const job = await getJob(workspaceId, jobId);
  if (!job) throw Object.assign(new Error('Job not found'), { status: 404 });
  const domain = String(job.site_domain ?? '');
  if (opts?.addToIgnore && domain) {
    await addToGlobalIgnore({
      workspaceId,
      siteDomain: domain,
      reason: 'unsupported',
      sourceJobId: jobId,
      userId: opts?.userId,
    });
    await setJobStatus(workspaceId, jobId, 'ignored', {
      finished_at: new Date().toISOString(),
      disposition: 'ignored',
      disposition_at: new Date().toISOString(),
      disposition_by: opts?.userId ?? null,
      error_code: null,
      error_message: null,
    });
    await removeOpportunityFromProject(workspaceId, job.opportunity_id as string | null);
  } else {
    // Phase 6.3 — Unsupported → Manual Excel (not Failed)
    await divertToManualOffline(workspaceId, jobId, {
      gate: 'unsupported',
      reason: 'Unsupported',
    });
    if (opts?.userId) {
      await mergeJobMetrics(workspaceId, jobId, { dispositionBy: opts.userId });
    }
    return getJob(workspaceId, jobId);
  }
  await releaseSession(job as Record<string, unknown>);
  await cancelQueuedBossJobsForExecution(jobId);
  await appendLog(workspaceId, jobId, 'warn', 'Marked unsupported', { domain });
  await recordHistory(workspaceId, jobId, 'unsupported');
  await drainQueue(workspaceId);
  return getJob(workspaceId, jobId);
}

export async function bulkInterventionAction(
  workspaceId: string,
  jobIds: string[],
  action: 'skip' | 'delete_forever' | 'retry' | 'unsupported',
  opts?: { userId?: string }
) {
  const results: Array<{ jobId: string; ok: boolean; error?: string }> = [];
  for (const jobId of jobIds) {
    try {
      if (action === 'skip') {
        await skipInterventionJob(workspaceId, jobId, { userId: opts?.userId });
      } else if (action === 'delete_forever') {
        await deleteInterventionForever(workspaceId, jobId, { userId: opts?.userId });
      } else if (action === 'unsupported') {
        await markInterventionUnsupported(workspaceId, jobId, {
          userId: opts?.userId,
          addToIgnore: false,
        });
      } else if (action === 'retry') {
        await retryJob(workspaceId, jobId, { force: true, delaySeconds: 0 });
      }
      results.push({ jobId, ok: true });
    } catch (err) {
      results.push({
        jobId,
        ok: false,
        error: err instanceof Error ? err.message : 'Failed',
      });
    }
  }
  return {
    action,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

/** Soft-cancel alias used by older callers */
export async function skipJobAsCancel(workspaceId: string, jobId: string) {
  return cancelJob(workspaceId, jobId, 'skipped_by_user');
}
