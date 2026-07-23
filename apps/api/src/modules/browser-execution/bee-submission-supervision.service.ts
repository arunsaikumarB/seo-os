/**
 * Phase 6.3.2 — Submission / BEE consumer supervision (mirror Phase 5.7 content-gen).
 * Idle workers + Queued/stale in-flight must self-heal: lease → run → terminal.
 */
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';
import { BEE_RELIABILITY } from './bee-config.js';

const SUPERVISION_INTERVAL_MS = Number(process.env.BEE_SUPERVISION_MS ?? 20_000);
const STALE_IN_FLIGHT_MS = Number(process.env.BEE_STALE_IN_FLIGHT_MS ?? 45_000);

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

let supervisionTimer: NodeJS.Timeout | null = null;
let lastDrainAt = 0;

function admin() {
  return getSupabaseAdmin();
}

async function closeSession(sessionId: string | null | undefined) {
  if (!sessionId) return;
  await admin()
    .from('browser_sessions')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      health_status: 'expired',
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('status', 'running');
}

/**
 * Requeue stale in-flight jobs (no lease heartbeat / frozen at Opening Website),
 * free ghost sessions, and drain Queued work for every workspace that needs it.
 */
export async function resumeInterruptedSubmissions(workspaceId?: string): Promise<{
  requeuedStale: number;
  ghostSessionsClosed: number;
  queuedFound: number;
  workspacesDrained: number;
  started: number;
}> {
  const now = Date.now();
  const staleBefore = new Date(now - STALE_IN_FLIGHT_MS).toISOString();
  let requeuedStale = 0;
  let ghostSessionsClosed = 0;
  let queuedFound = 0;
  let started = 0;
  const workspaces = new Set<string>();

  // 1) Stale in-flight without a live lease (never leased, or lease already cleared)
  let staleQ = admin()
    .from('execution_jobs')
    .select('id, workspace_id, opportunity_id, status, session_id, lease_holder, lease_expires_at, updated_at')
    .in('status', [...IN_FLIGHT_STATUSES])
    .is('deleted_at', null)
    .lt('updated_at', staleBefore)
    .limit(500);
  if (workspaceId) staleQ = staleQ.eq('workspace_id', workspaceId);
  const { data: stale } = await staleQ;

  for (const row of stale ?? []) {
    const leaseExp = row.lease_expires_at
      ? new Date(String(row.lease_expires_at)).getTime()
      : 0;
    const hasLiveLease =
      row.lease_holder != null && leaseExp > now + 5_000;
    // Live leased jobs are owned by an active worker — leave them
    if (hasLiveLease) continue;

    const ws = String(row.workspace_id);
    const jobId = String(row.id);
    await closeSession(row.session_id != null ? String(row.session_id) : null);
    await admin()
      .from('execution_jobs')
      .update({
        status: 'queued',
        session_id: null,
        lease_holder: null,
        lease_expires_at: null,
        error_message: 'recovered — stale in-flight (supervision)',
        failure_classification: 'WORKER_OFFLINE',
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    try {
      const { stampRequeueTrace } = await import('./bee-record-failure.service.js');
      await stampRequeueTrace({
        workspaceId: ws,
        jobId,
        reason: `recovered — stale in-flight (prior ${row.status})`,
        source: 'resumeInterruptedSubmissions',
      });
    } catch {
      /* best-effort */
    }
    workspaces.add(ws);
    requeuedStale++;
  }

  // 2) Ghost running sessions with no in-flight job pointing at them
  let sessQ = admin()
    .from('browser_sessions')
    .select('id, workspace_id')
    .eq('status', 'running')
    .is('deleted_at', null)
    .limit(500);
  if (workspaceId) sessQ = sessQ.eq('workspace_id', workspaceId);
  const { data: sessions } = await sessQ;
  for (const s of sessions ?? []) {
    const sid = String(s.id);
    const { data: owner } = await admin()
      .from('execution_jobs')
      .select('id')
      .eq('session_id', sid)
      .is('deleted_at', null)
      .not('status', 'in', '(completed,failed,cancelled,skipped,deleted,ignored,submitted,verified)')
      .maybeSingle();
    if (owner) continue;
    await closeSession(sid);
    workspaces.add(String(s.workspace_id));
    ghostSessionsClosed++;
  }

  // 3) Workspaces with Queued jobs
  let queuedQ = admin()
    .from('execution_jobs')
    .select('workspace_id')
    .eq('status', 'queued')
    .is('deleted_at', null)
    .limit(2000);
  if (workspaceId) queuedQ = queuedQ.eq('workspace_id', workspaceId);
  const { data: queuedRows } = await queuedQ;
  for (const r of queuedRows ?? []) {
    workspaces.add(String(r.workspace_id));
    queuedFound++;
  }

  // 4) Drain each workspace (startJob → bee_execute)
  const { continueQueuedJobs } = await import('./bee.service.js');
  for (const ws of workspaces) {
    try {
      const ids = await continueQueuedJobs(ws);
      started += ids.length;
      await enqueueJob(
        QUEUES.LOW,
        'bee_queue',
        { type: 'bee_queue', workspaceId: ws },
        { singletonKey: `bee-queue-drain-${ws}`, startAfter: 1 }
      );
    } catch (err) {
      logger.warn({ err, workspaceId: ws }, 'submission supervision drain failed');
    }
  }

  lastDrainAt = Date.now();
  if (requeuedStale > 0 || ghostSessionsClosed > 0 || started > 0) {
    logger.info(
      {
        requeuedStale,
        ghostSessionsClosed,
        queuedFound,
        workspacesDrained: workspaces.size,
        started,
        staleMs: STALE_IN_FLIGHT_MS,
      },
      'submission supervision recovery finished'
    );
  }

  return {
    requeuedStale,
    ghostSessionsClosed,
    queuedFound,
    workspacesDrained: workspaces.size,
    started,
  };
}

/**
 * Idempotent kick: ensure Ready automatable items have jobs, then drain the queue.
 * Safe to call on auto-publish ON / Start Submission / supervision tick.
 */
export async function kickSubmissionDrain(
  workspaceId: string,
  opts?: { userId?: string; ensureJobs?: boolean }
): Promise<{
  ensured: boolean;
  drain: Awaited<ReturnType<typeof resumeInterruptedSubmissions>>;
}> {
  let ensured = false;
  if (opts?.ensureJobs !== false) {
    try {
      const { ensureExecutionJobsForReady } = await import('./execution-pipeline.service.js');
      await ensureExecutionJobsForReady({
        workspaceId,
        userId: opts?.userId,
        startImmediately: true,
      });
      ensured = true;
    } catch (err) {
      logger.warn({ err, workspaceId }, 'kickSubmissionDrain ensure failed');
    }
  }
  const drain = await resumeInterruptedSubmissions(workspaceId);
  return { ensured, drain };
}

async function superviseSubmissionConsumer(): Promise<void> {
  // Always scan — unlike content-gen, BEE can stall with "alive" workers and ghost slots
  const result = await resumeInterruptedSubmissions();
  if (result.queuedFound > 0 && result.started === 0 && result.workspacesDrained > 0) {
    logger.warn(
      result,
      'submission: Queued jobs present but nothing started — will retry next tick'
    );
  }
}

export function startSubmissionSupervisionLoop(): void {
  if (supervisionTimer) return;
  supervisionTimer = setInterval(() => {
    void superviseSubmissionConsumer().catch((err) =>
      logger.warn({ err }, 'submission supervision tick failed')
    );
  }, SUPERVISION_INTERVAL_MS);
  supervisionTimer.unref?.();
  void superviseSubmissionConsumer().catch((err) =>
    logger.warn({ err }, 'submission supervision initial tick failed')
  );
  logger.info(
    {
      intervalMs: SUPERVISION_INTERVAL_MS,
      staleMs: STALE_IN_FLIGHT_MS,
      leaseSweepMs: BEE_RELIABILITY.LEASE_SWEEP_MS,
    },
    'Submission consumer supervision started'
  );
}

export function getSubmissionSupervisionMeta() {
  return {
    intervalMs: SUPERVISION_INTERVAL_MS,
    staleMs: STALE_IN_FLIGHT_MS,
    lastDrainAt,
  };
}
