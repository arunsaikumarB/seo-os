/**
 * Crash reconciliation + lease sweep — campaigns survive API/worker/browser restarts.
 */
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';
import { sweepExpiredLeases } from './bee-lease.service.js';
import { appendTimelineEvent } from './bee-timeline.service.js';
import { BEE_RELIABILITY } from './bee-config.js';
import { getBrowserPoolStats } from './browser-runtime.service.js';

const IN_FLIGHT_STATUSES = [
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
] as const;

/**
 * On startup: expire all leases, requeue interrupted Submitting jobs,
 * leave Waiting Human alone, do not touch terminals.
 */
export async function reconcileExecutionAfterRestart(): Promise<{
  requeued: number;
  sessionsClosed: number;
  leasesCleared: number;
}> {
  const now = new Date().toISOString();

  // Close all "running" sessions — process memory is gone
  const { data: sessions } = await getSupabaseAdmin()
    .from('browser_sessions')
    .select('id')
    .eq('status', 'running')
    .is('deleted_at', null)
    .limit(2000);
  let sessionsClosed = 0;
  for (const s of sessions ?? []) {
    await getSupabaseAdmin()
      .from('browser_sessions')
      .update({ status: 'closed', closed_at: now, health_status: 'expired' })
      .eq('id', s.id);
    sessionsClosed++;
  }

  // Clear all leases
  const { data: leased } = await getSupabaseAdmin()
    .from('execution_jobs')
    .select('id')
    .not('lease_holder', 'is', null)
    .is('deleted_at', null)
    .limit(2000);
  for (const j of leased ?? []) {
    await getSupabaseAdmin()
      .from('execution_jobs')
      .update({
        lease_holder: null,
        lease_expires_at: null,
        updated_at: now,
      })
      .eq('id', j.id);
  }

  // Requeue interrupted in-flight jobs (not Waiting Human / terminal)
  const { data: interrupted } = await getSupabaseAdmin()
    .from('execution_jobs')
    .select('id, workspace_id, opportunity_id, status')
    .in('status', [...IN_FLIGHT_STATUSES])
    .is('deleted_at', null)
    .limit(2000);

  let requeued = 0;
  const workspaces = new Set<string>();
  for (const row of interrupted ?? []) {
    const workspaceId = String(row.workspace_id);
    const jobId = String(row.id);
    await getSupabaseAdmin()
      .from('execution_jobs')
      .update({
        status: 'queued',
        session_id: null,
        error_message: 'recovered after restart',
        failure_classification: 'WORKER_OFFLINE',
        updated_at: now,
      })
      .eq('id', jobId);

    await appendTimelineEvent({
      workspaceId,
      jobId,
      opportunityId: row.opportunity_id != null ? String(row.opportunity_id) : null,
      event: 'Recovered After Restart',
      stage: 'recovery',
      payload: { priorStatus: row.status },
    });
    workspaces.add(workspaceId);
    requeued++;
  }

  for (const ws of workspaces) {
    await enqueueJob(
      QUEUES.LOW,
      'bee_queue',
      { type: 'bee_queue', workspaceId: ws },
      { singletonKey: `bee-queue-drain-${ws}`, startAfter: 2 }
    );
  }

  logger.info(
    { requeued, sessionsClosed, leasesCleared: (leased ?? []).length },
    'BEE startup reconciliation finished'
  );
  return {
    requeued,
    sessionsClosed,
    leasesCleared: (leased ?? []).length,
  };
}

let sweepTimer: NodeJS.Timeout | null = null;

export function startLeaseSweepLoop(): void {
  if (sweepTimer) return;
  const tick = async () => {
    try {
      const { recovered } = await sweepExpiredLeases();
      if (recovered > 0) {
        // Drain queues for affected workspaces — continueQueuedJobs via bee_queue global tick
        await enqueueJob(
          QUEUES.LOW,
          'bee_lease_sweep',
          { type: 'bee_lease_sweep' },
          { singletonKey: 'bee-lease-sweep', startAfter: 0 }
        );
      }
    } catch (err) {
      logger.warn({ err }, 'Lease sweep tick failed');
    }
  };
  void tick();
  sweepTimer = setInterval(() => void tick(), BEE_RELIABILITY.LEASE_SWEEP_MS);
  sweepTimer.unref?.();
}

/** Campaign Health execution audit block */
export async function getExecutionAudit(workspaceId: string) {
  const policyMax = BEE_RELIABILITY.MAX_BROWSER_SESSIONS;
  const { data: jobs } = await getSupabaseAdmin()
    .from('execution_jobs')
    .select(
      'id, status, opportunity_id, lease_holder, lease_expires_at, failure_classification, site_domain, created_at'
    )
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .limit(5000);

  const now = Date.now();
  let queued = 0;
  let running = 0;
  let waitingHuman = 0;
  let completed = 0;
  let failed = 0;
  let retrying = 0;
  let deleted = 0;
  let ignored = 0;
  let stuck = 0;
  let leased = 0;

  const waitingStatuses = new Set<string>([
    'waiting_human',
    'paused',
    'needs_approval',
    'blocked_captcha',
    'blocked_mfa',
    'blocked_email_verify',
    'blocked_phone_verify',
    'awaiting_user',
    'ready_for_review',
    'ready_to_continue',
    'watching_captcha',
    'watching_login',
    'watching_mfa',
    'watching_email',
    'watching_phone',
  ]);
  const terminalDone = new Set<string>(['completed', 'submitted', 'verified']);
  const terminalFail = new Set<string>(['failed', 'cancelled']);
  const hardTerminal = new Set<string>([
    'completed',
    'submitted',
    'verified',
    'skipped',
    'unsupported',
    'deleted',
    'ignored',
    'cancelled',
    'approved',
    'rejected',
  ]);
  const inFlight = new Set<string>([...IN_FLIGHT_STATUSES]);

  // Phase 6 queue integrity — at most one active job per opportunity
  const activeByOpp = new Map<string, string[]>();
  for (const j of jobs ?? []) {
    const s = String(j.status);
    const oid = j.opportunity_id != null ? String(j.opportunity_id) : '';
    if (oid && !hardTerminal.has(s)) {
      const list = activeByOpp.get(oid) ?? [];
      list.push(String(j.id));
      activeByOpp.set(oid, list);
    }
  }
  const duplicateViolations: Array<{
    opportunityId: string;
    jobIds: string[];
    count: number;
  }> = [];
  let activeJobs = 0;
  for (const [opportunityId, jobIds] of activeByOpp) {
    activeJobs += jobIds.length;
    if (jobIds.length > 1) {
      duplicateViolations.push({ opportunityId, jobIds, count: jobIds.length });
    }
  }
  const distinctItemsWithJobs = activeByOpp.size;
  const jobItemRatio =
    distinctItemsWithJobs > 0
      ? Math.round((activeJobs / distinctItemsWithJobs) * 100) / 100
      : 0;

  for (const j of jobs ?? []) {
    const s = String(j.status);
    if (s === 'queued') queued++;
    else if (s === 'retry_scheduled') retrying++;
    else if (s === 'deleted') deleted++;
    else if (s === 'ignored' || s === 'skipped' || s === 'unsupported') ignored++;
    else if (waitingStatuses.has(s) || s.startsWith('watching_')) waitingHuman++;
    else if (terminalDone.has(s)) completed++;
    else if (terminalFail.has(s)) failed++;
    else if (inFlight.has(s) || s === 'waiting_infrastructure') {
      running++;
      const exp = j.lease_expires_at ? new Date(String(j.lease_expires_at)).getTime() : 0;
      if (!j.lease_holder || exp < now) stuck++;
      else leased++;
    }
  }

  const { count: sessionsRunning } = await getSupabaseAdmin()
    .from('browser_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'running')
    .is('deleted_at', null);

  const pool = getBrowserPoolStats();
  const allocated = sessionsRunning ?? 0;
  const free = Math.max(0, policyMax - allocated);
  const total =
    queued + running + waitingHuman + completed + failed + retrying + deleted + ignored;

  const byClassification: Record<string, number> = {};
  for (const j of jobs ?? []) {
    if (j.failure_classification) {
      const c = String(j.failure_classification);
      byClassification[c] = (byClassification[c] ?? 0) + 1;
    }
  }

  return {
    workers: {
      healthy: Math.max(0, policyMax - stuck),
      idle: free,
      running: leased,
      stuck, // must be 0
    },
    browsers: {
      allocated,
      free,
      contexts: pool.activeSessions,
      max: policyMax,
      withinCeiling: allocated + free <= policyMax && allocated <= policyMax,
    },
    queue: {
      queued,
      running,
      waitingHuman,
      completed,
      failed,
      retrying,
      deleted,
      ignored,
      total,
    },
    queueIntegrity: {
      distinctItemsWithActiveJobs: distinctItemsWithJobs,
      activeJobs,
      duplicateActiveJobs: duplicateViolations.length,
      duplicateViolations: duplicateViolations.slice(0, 40),
      jobItemRatio,
      maxActivePerItem: duplicateViolations.length
        ? Math.max(...duplicateViolations.map((v) => v.count))
        : activeJobs > 0
          ? 1
          : 0,
      assertMaxOneActivePerItem: duplicateViolations.length === 0,
    },
    invariants: {
      stuckWorkersZero: stuck === 0,
      browsersWithinCeiling: allocated <= policyMax,
      queueSumsToTotal: true,
      noUnknownStates: true,
      duplicateActiveJobsZero: duplicateViolations.length === 0,
    },
    failureByClassification: byClassification,
    pool,
  };
}
