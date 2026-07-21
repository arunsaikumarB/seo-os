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
  });
  await releaseSession(job as Record<string, unknown>);
  await mergeJobMetrics(workspaceId, jobId, {
    disposition: 'skipped',
    dispositionReason: opts?.reason ?? 'skipped_campaign',
  });
  await appendLog(workspaceId, jobId, 'warn', 'Skipped for this campaign', {
    reason: opts?.reason ?? 'skipped_campaign',
  });
  await recordHistory(workspaceId, jobId, 'skipped');
  await enqueueJob(
    QUEUES.LOW,
    'bee_queue',
    { type: 'bee_queue', workspaceId },
    { singletonKey: `bee-queue-drain-${workspaceId}`, startAfter: 0 }
  );
  return getJob(workspaceId, jobId);
}

/** Delete forever — cancel + Global Ignore List (all future projects skip). */
export async function deleteInterventionForever(
  workspaceId: string,
  jobId: string,
  opts?: { userId?: string; reason?: string }
) {
  const job = await getJob(workspaceId, jobId);
  if (!job) throw Object.assign(new Error('Job not found'), { status: 404 });
  const domain = String(job.site_domain ?? '');
  if (domain) {
    await addToGlobalIgnore({
      workspaceId,
      siteDomain: domain,
      reason: opts?.reason ?? 'deleted_forever',
      sourceJobId: jobId,
      userId: opts?.userId,
    });
  }
  await setJobStatus(workspaceId, jobId, 'cancelled', {
    finished_at: new Date().toISOString(),
    disposition: 'deleted_forever',
    disposition_at: new Date().toISOString(),
    disposition_by: opts?.userId ?? null,
    error_message: 'Deleted forever — added to Global Ignore List',
  });
  await releaseSession(job as Record<string, unknown>);
  await mergeJobMetrics(workspaceId, jobId, {
    disposition: 'deleted_forever',
    globallyIgnored: true,
  });
  await appendLog(workspaceId, jobId, 'warn', 'Deleted forever — Global Ignore List', {
    domain,
  });
  await recordHistory(workspaceId, jobId, 'cancelled');
  await enqueueJob(
    QUEUES.LOW,
    'bee_queue',
    { type: 'bee_queue', workspaceId },
    { singletonKey: `bee-queue-drain-${workspaceId}`, startAfter: 0 }
  );
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
  }
  await setJobStatus(workspaceId, jobId, 'unsupported', {
    finished_at: new Date().toISOString(),
    disposition: 'unsupported',
    disposition_at: new Date().toISOString(),
    disposition_by: opts?.userId ?? null,
    error_code: 'UNSUPPORTED_SITE',
    error_message: 'Marked unsupported',
  });
  await releaseSession(job as Record<string, unknown>);
  await appendLog(workspaceId, jobId, 'warn', 'Marked unsupported', { domain });
  await recordHistory(workspaceId, jobId, 'unsupported');
  await enqueueJob(
    QUEUES.LOW,
    'bee_queue',
    { type: 'bee_queue', workspaceId },
    { singletonKey: `bee-queue-drain-${workspaceId}`, startAfter: 0 }
  );
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
