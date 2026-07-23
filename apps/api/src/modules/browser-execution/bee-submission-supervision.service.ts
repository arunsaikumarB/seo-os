/**
 * Phase 6.3.2 — Submission / BEE consumer supervision (mirror Phase 5.7 content-gen).
 * Idle workers + Queued/stale in-flight must self-heal: lease → run → terminal.
 * Phase 6.3.5 — Queued>0 && Idle>0 && Free>0 for two consecutive ticks is a bug → force drain.
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

/** workspaceId → consecutive ticks with Queued>0 && Idle>0 && Free>0 */
const capacityStallStreak = new Map<string, number>();

/** jobId → { fingerprint, ticks } — unchanged status+error while holding a worker */
const crashLoopWatch = new Map<string, { fp: string; ticks: number }>();

function admin() {
  return getSupabaseAdmin();
}

/**
 * Phase 6.3.6 / hung-stage — Crash-loop + static-progress watchdog.
 * Unchanged status+error+step+stage for > CRASH_LOOP_TICKS → force-fail.
 * Also: started_at older than JOB_CEILING_MS → force-fail wall clock (ignores heartbeat).
 */
async function forceFailCrashLoopedJobs(workspaceId?: string): Promise<{
  forced: number;
  workspaces: string[];
}> {
  const tickLimit = BEE_RELIABILITY.CRASH_LOOP_TICKS;
  const wallMs = BEE_RELIABILITY.JOB_CEILING_MS;
  const now = Date.now();
  let q = admin()
    .from('execution_jobs')
    .select(
      'id, workspace_id, status, error_message, session_id, retry_count, updated_at, started_at, current_step_index, metrics'
    )
    .in('status', [...IN_FLIGHT_STATUSES])
    .is('deleted_at', null)
    .limit(500);
  if (workspaceId) q = q.eq('workspace_id', workspaceId);
  const { data: rows } = await q;

  let forced = 0;
  const touched = new Set<string>();
  const seen = new Set<string>();

  async function forceFail(
    row: {
      id: unknown;
      workspace_id: unknown;
      session_id: unknown;
      status: unknown;
      error_message: unknown;
      current_step_index?: unknown;
      metrics?: unknown;
    },
    reason: string,
    code: string
  ) {
    const jobId = String(row.id);
    const ws = String(row.workspace_id);
    logger.error(
      { jobId, workspaceId: ws, status: row.status, reason },
      'HUNG-STAGE / CRASH-LOOP WATCHDOG — force-failing wedged in-flight job'
    );
    if (row.session_id) {
      await closeSession(String(row.session_id));
      try {
        const { disposeSessionRuntime } = await import('./browser-runtime.service.js');
        await disposeSessionRuntime(String(row.session_id)).catch(() => undefined);
      } catch {
        /* best-effort */
      }
    }
    const { recordFailure } = await import('./bee-record-failure.service.js');
    await recordFailure({
      workspaceId: ws,
      jobId,
      err: Object.assign(new Error(reason), {
        failureCode: code,
        code,
        stage: String(
          (row.metrics as { currentStage?: string } | null)?.currentStage ??
            row.status ??
            'unknown'
        ),
      }),
      source: 'crashLoopWatchdog',
      step: String(
        (row.metrics as { currentStage?: string } | null)?.currentStage ?? row.status ?? null
      ),
      allowRetry: false,
    });
    crashLoopWatch.delete(jobId);
    forced++;
    touched.add(ws);
    await enqueueJob(
      QUEUES.LOW,
      'bee_queue',
      { type: 'bee_queue', workspaceId: ws },
      { singletonKey: `bee-queue-drain-${ws}`, startAfter: 0 }
    );
  }

  for (const row of rows ?? []) {
    const jobId = String(row.id);
    seen.add(jobId);
    const metrics = (row.metrics as Record<string, unknown> | null) ?? {};
    const stage = String(metrics.currentStage ?? '');
    const progress = String(metrics.stageProgress ?? row.current_step_index ?? '');
    const stageStarted = String(metrics.stageStartedAt ?? '');

    // Assert: no job may be Running longer than the wall clock, ever
    const startedMs = row.started_at ? new Date(String(row.started_at)).getTime() : 0;
    if (startedMs > 0 && now - startedMs > wallMs) {
      const stageLabel = stage || String(row.status);
      await forceFail(
        row,
        `job exceeded wall clock at stage ${stageLabel} (${Math.round(wallMs / 1000)}s)`,
        'QUEUE_TIMEOUT'
      );
      continue;
    }

    // Fingerprint: status + error + step + stage + stage-start — heartbeat must not reset this
    const fp = `${row.status}|${row.error_message ?? ''}|${progress}|${stage}|${stageStarted}`;
    const prev = crashLoopWatch.get(jobId);
    if (prev && prev.fp === fp) {
      const ticks = prev.ticks + 1;
      crashLoopWatch.set(jobId, { fp, ticks });
      if (ticks >= tickLimit) {
        const frozen =
          String(row.error_message || '').trim() ||
          `Wedged in ${row.status}${stage ? ` / ${stage}` : ''} (static progress) — hung-stage watchdog`;
        await forceFail(
          row,
          frozen,
          /crash|oom/i.test(frozen) ? 'BROWSER_CLOSED' : 'QUEUE_TIMEOUT'
        );
      }
    } else {
      crashLoopWatch.set(jobId, { fp, ticks: 1 });
    }
  }
  for (const id of [...crashLoopWatch.keys()]) {
    if (!seen.has(id)) crashLoopWatch.delete(id);
  }
  return { forced, workspaces: [...touched] };
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
 * Assert: Queued > 0 && Idle > 0 && Free > 0 for two consecutive intervals is a bug.
 * Self-heal: close orphan sessions, force continueQueuedJobs, enqueue bee_queue.
 */
async function assertCapacityDrainOrHeal(workspaceId: string): Promise<{
  stalled: boolean;
  healed: boolean;
  started: number;
  queued: number;
  idle: number;
  free: number;
}> {
  const { getExecutionAudit } = await import('./bee-reconcile.service.js');
  const audit = await getExecutionAudit(workspaceId);
  const queued = Number(audit.queue?.queued ?? 0);
  const idle = Number(audit.workers?.idle ?? 0);
  const free = Number(audit.browsers?.free ?? 0);

  if (queued > 0 && idle > 0 && free > 0) {
    const streak = (capacityStallStreak.get(workspaceId) ?? 0) + 1;
    capacityStallStreak.set(workspaceId, streak);
    if (streak >= 2) {
      logger.error(
        { workspaceId, queued, idle, free, streak },
        'ASSERT BUG: Queued>0 && Idle>0 && Free>0 for 2 intervals — self-healing drain'
      );
      const { closeOrphanDbBrowserSessions } = await import(
        './browser-runtime-manager.service.js'
      );
      await closeOrphanDbBrowserSessions(
        'capacity stall self-heal (Queued+Idle+Free)',
        workspaceId
      );
      const { continueQueuedJobs } = await import('./bee.service.js');
      const startedIds = await continueQueuedJobs(workspaceId, { limit: Math.max(free, 1) });
      await enqueueJob(
        QUEUES.LOW,
        'bee_queue',
        { type: 'bee_queue', workspaceId },
        { singletonKey: `bee-queue-drain-${workspaceId}`, startAfter: 0 }
      );
      // Reset streak after heal attempt so we don't spam; re-arm if still stalled next ticks
      capacityStallStreak.set(workspaceId, 0);
      return {
        stalled: true,
        healed: true,
        started: startedIds.length,
        queued,
        idle,
        free,
      };
    }
    return { stalled: true, healed: false, started: 0, queued, idle, free };
  }

  capacityStallStreak.set(workspaceId, 0);
  return { stalled: false, healed: false, started: 0, queued, idle, free };
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
  capacityHeals: number;
  crashLoopsForced: number;
}> {
  const now = Date.now();
  const staleBefore = new Date(now - STALE_IN_FLIGHT_MS).toISOString();
  let requeuedStale = 0;
  let ghostSessionsClosed = 0;
  let queuedFound = 0;
  let started = 0;
  let capacityHeals = 0;
  let crashLoopsForced = 0;
  const workspaces = new Set<string>();

  // 0) Crash-loop watchdog — wedged launching_browser/etc. must not hold the lane forever
  try {
    const crash = await forceFailCrashLoopedJobs(workspaceId);
    crashLoopsForced = crash.forced;
    for (const ws of crash.workspaces) workspaces.add(ws);
  } catch (err) {
    logger.warn({ err }, 'crash-loop watchdog failed');
  }
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

    // When auto-publish is OFF, do not re-queue into the browser lane — skip instead.
    try {
      const { getOrCreatePolicy } = await import('./bee.service.js');
      const policy = await getOrCreatePolicy(ws);
      if (policy.auto_publish_automatable !== true) {
        const nowIso = new Date().toISOString();
        await admin()
          .from('execution_jobs')
          .update({
            status: 'skipped',
            disposition: 'skipped',
            session_id: null,
            lease_holder: null,
            lease_expires_at: null,
            error_code: 'AUTO_PUBLISH_OFF',
            error_message:
              'Browser auto-submit is off — use Assisted Manual. Opt in under Advanced → Browser Auto-Submit.',
            finished_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', jobId);
        workspaces.add(ws);
        continue;
      }
    } catch {
      /* fall through to requeue */
    }

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

  // 4) Drain each workspace (startJob → bee_execute) using live-capacity slots
  //    Skip when auto-publish is OFF — cancel stray queued instead of starting.
  const { continueQueuedJobs, getOrCreatePolicy } = await import('./bee.service.js');
  for (const ws of workspaces) {
    try {
      const policy = await getOrCreatePolicy(ws);
      if (policy.auto_publish_automatable !== true) {
        await cancelQueuedJobsWhenAutoPublishOff(ws);
        continue;
      }
      const ids = await continueQueuedJobs(ws);
      started += ids.length;
      await enqueueJob(
        QUEUES.LOW,
        'bee_queue',
        { type: 'bee_queue', workspaceId: ws },
        { singletonKey: `bee-queue-drain-${ws}`, startAfter: 1 }
      );

      // Phase 6.3.5 — capacity stall assert (two consecutive Idle+Free+Queued ticks)
      const heal = await assertCapacityDrainOrHeal(ws);
      if (heal.healed) {
        capacityHeals++;
        started += heal.started;
      } else if (heal.stalled && ids.length === 0) {
        logger.warn(
          { workspaceId: ws, ...heal },
          'submission: Queued+Idle+Free observed — arming stall streak'
        );
      }
    } catch (err) {
      logger.warn({ err, workspaceId: ws }, 'submission supervision drain failed');
    }
  }

  lastDrainAt = Date.now();
  if (
    requeuedStale > 0 ||
    ghostSessionsClosed > 0 ||
    started > 0 ||
    capacityHeals > 0 ||
    crashLoopsForced > 0
  ) {
    logger.info(
      {
        requeuedStale,
        ghostSessionsClosed,
        queuedFound,
        workspacesDrained: workspaces.size,
        started,
        capacityHeals,
        crashLoopsForced,
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
    capacityHeals,
    crashLoopsForced,
  };
}

/**
 * Idempotent kick: ensure Ready automatable items have jobs, then drain the queue.
 * Only when auto_publish_automatable is ON — otherwise Assisted Manual is the path.
 */
export async function kickSubmissionDrain(
  workspaceId: string,
  opts?: { userId?: string; ensureJobs?: boolean; force?: boolean }
): Promise<{
  ensured: boolean;
  drain: Awaited<ReturnType<typeof resumeInterruptedSubmissions>> | null;
  skippedAutoPublishOff?: boolean;
}> {
  const { getOrCreatePolicy } = await import('./bee.service.js');
  const policy = await getOrCreatePolicy(workspaceId);
  if (!opts?.force && policy.auto_publish_automatable !== true) {
    await cancelQueuedJobsWhenAutoPublishOff(workspaceId);
    logger.info(
      { workspaceId },
      'kickSubmissionDrain skipped — auto_publish_automatable is OFF (Assisted Manual path)'
    );
    return { ensured: false, drain: null, skippedAutoPublishOff: true };
  }

  let ensured = false;
  if (opts?.ensureJobs !== false) {
    try {
      const { ensureExecutionJobsForReady } = await import('./execution-pipeline.service.js');
      await ensureExecutionJobsForReady({
        workspaceId,
        userId: opts?.userId,
        startImmediately: true,
        force: opts?.force === true,
      });
      ensured = true;
    } catch (err) {
      logger.warn({ err, workspaceId }, 'kickSubmissionDrain ensure failed');
    }
  }
  const drain = await resumeInterruptedSubmissions(workspaceId);
  return { ensured, drain };
}

/** Drop Queued / retry_scheduled jobs so the UI does not imply browser submit is running. */
async function cancelQueuedJobsWhenAutoPublishOff(workspaceId: string): Promise<number> {
  const { data: rows } = await admin()
    .from('execution_jobs')
    .select('id')
    .eq('workspace_id', workspaceId)
    .in('status', ['queued', 'retry_scheduled', 'waiting_infrastructure'])
    .is('deleted_at', null)
    .limit(500);
  if (!rows?.length) return 0;
  const now = new Date().toISOString();
  const { error } = await admin()
    .from('execution_jobs')
    .update({
      status: 'skipped',
      disposition: 'skipped',
      error_code: 'AUTO_PUBLISH_OFF',
      error_message:
        'Browser auto-submit is off — use Assisted Manual. Opt in under Advanced → Browser Auto-Submit.',
      finished_at: now,
      updated_at: now,
    })
    .eq('workspace_id', workspaceId)
    .in('status', ['queued', 'retry_scheduled', 'waiting_infrastructure'])
    .is('deleted_at', null);
  if (error) {
    logger.warn({ err: error, workspaceId }, 'cancelQueuedJobsWhenAutoPublishOff failed');
    return 0;
  }
  logger.info(
    { workspaceId, cancelled: rows.length },
    'cancelled queued execution jobs — auto_publish off'
  );
  return rows.length;
}

async function superviseSubmissionConsumer(): Promise<void> {
  // Cancel stray queued jobs on workspaces with auto-publish OFF, then scan only when ON
  try {
    const { data: policies } = await admin()
      .from('execution_policies')
      .select('workspace_id, auto_publish_automatable')
      .is('deleted_at', null)
      .limit(500);
    for (const p of policies ?? []) {
      if (p.auto_publish_automatable === true) continue;
      await cancelQueuedJobsWhenAutoPublishOff(String(p.workspace_id));
    }
  } catch (err) {
    logger.warn({ err }, 'auto-publish-off queue cancel sweep failed');
  }

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
      maxSessions: BEE_RELIABILITY.MAX_BROWSER_SESSIONS,
    },
    'Submission consumer supervision started'
  );
}

export function getSubmissionSupervisionMeta() {
  return {
    intervalMs: SUPERVISION_INTERVAL_MS,
    staleMs: STALE_IN_FLIGHT_MS,
    lastDrainAt,
    capacityStallStreak: Object.fromEntries(capacityStallStreak),
  };
}
