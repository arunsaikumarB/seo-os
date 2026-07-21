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
    await setJobStatus(workspaceId, jobId, 'skipped', {
      finished_at: new Date().toISOString(),
      disposition: 'unsupported',
      disposition_at: new Date().toISOString(),
      disposition_by: opts?.userId ?? null,
      error_code: 'UNSUPPORTED_SITE',
      error_message: 'Marked unsupported',
    });
    await syncOpportunityStatus(workspaceId, job.opportunity_id as string | null, 'unsupported');
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
