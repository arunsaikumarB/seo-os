/**
 * BEE Watcher / Resume / Queue / Session Health workers.
 * Auto-resumes ONLY after detecting the user completed a protected gate.
 * Never solves or bypasses CAPTCHA, MFA, email/phone verification, or login.
 */
import {
  isWatchableGate,
  watchingStatusFromBlocker,
  type ExecutionGate,
} from '@seo-os/backlink-builder';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';
import { getSessionRuntime } from './browser-runtime.service.js';
import { PageWatcher } from './page-watcher.js';
import {
  markSessionAuth,
  persistSessionStorageState,
} from './bee-session.js';
import {
  appendLog,
  autoResumeJob,
  continueQueuedJobs,
  getOrCreatePolicy,
  markGateStepDone,
  mergeJobMetrics,
} from './bee.service.js';

function asGate(value: unknown): ExecutionGate {
  const g = String(value ?? '');
  if (
    g === 'captcha' ||
    g === 'login' ||
    g === 'mfa' ||
    g === 'email_verify' ||
    g === 'phone_verify'
  ) {
    return g;
  }
  return null;
}

export async function handleBeeWatchJobs(
  jobs: Array<{ id: string; data: Record<string, unknown> }>
): Promise<void> {
  for (const job of jobs) {
    if (String(job.data.type ?? '') !== 'bee_watch') continue;
    const jobId = String(job.data.jobId ?? '');
    const workspaceId = String(job.data.workspaceId ?? '');
    const sessionId = String(job.data.sessionId ?? '');
    const gate = asGate(job.data.gate);
    const tick = Number(job.data.tick ?? 0);
    if (!jobId || !workspaceId || !gate || !isWatchableGate(gate)) continue;

    try {
      await runWatchTick({ jobId, workspaceId, sessionId, gate, tick });
    } catch (err) {
      logger.error({ err, jobId, gate }, 'bee_watch tick failed');
      throw err;
    }
  }
}

async function runWatchTick(params: {
  jobId: string;
  workspaceId: string;
  sessionId: string;
  gate: NonNullable<ExecutionGate>;
  tick: number;
}): Promise<void> {
  const { jobId, workspaceId, sessionId, gate, tick } = params;
  const { data: execJob } = await getSupabaseAdmin()
    .from('execution_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!execJob) return;

  const status = String(execJob.status);
  if (['completed', 'failed', 'cancelled'].includes(status)) return;
  if (!status.startsWith('watching') && !status.startsWith('blocked_') && status !== 'needs_approval') {
    return;
  }

  const policy = await getOrCreatePolicy(workspaceId);
  const autoResume = policy.auto_resume !== false;
  const intervalMs = Math.max(1000, Number(policy.watch_interval_ms ?? 2000));
  const maxWatchMs = Math.max(intervalMs, Number(policy.max_watch_ms ?? 1_800_000));
  const watchStarted = execJob.watch_started_at
    ? new Date(String(execJob.watch_started_at)).getTime()
    : Date.now();
  const elapsed = Date.now() - watchStarted;

  if (elapsed > maxWatchMs) {
    const blocked =
      gate === 'login'
        ? 'needs_approval'
        : gate === 'captcha'
          ? 'blocked_captcha'
          : gate === 'mfa'
            ? 'blocked_mfa'
            : gate === 'email_verify'
              ? 'blocked_email_verify'
              : 'blocked_phone_verify';
    await getSupabaseAdmin()
      .from('execution_jobs')
      .update({
        status: blocked,
        pause_reason: gate,
        watch_finished_at: new Date().toISOString(),
        watch_duration_ms: elapsed,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    await appendLog(workspaceId, jobId, 'warn', 'Watch timed out — still waiting for user to complete gate', {
      gate,
      elapsedMs: elapsed,
      maxWatchMs,
      note: 'Never bypassed — manual Resume available after user completes step',
    });
    return;
  }

  const watchingStatus = watchingStatusFromBlocker(gate) ?? 'watching';
  if (status !== watchingStatus) {
    await getSupabaseAdmin()
      .from('execution_jobs')
      .update({ status: watchingStatus, updated_at: new Date().toISOString() })
      .eq('id', jobId);
  }

  const runtime = getSessionRuntime(sessionId || String(execJob.session_id ?? jobId));
  const health = await runtime.health();

  if (!health.playwrightAvailable || !(await runtimeHasPage(runtime))) {
    // No live page — keep watching lightly; user may complete in another tab then press Resume,
    // or session may be restored on resume. Re-enqueue next tick.
    if (tick % 15 === 0) {
      await appendLog(workspaceId, jobId, 'info', 'Watcher waiting — browser page not attached in this worker', {
        gate,
        tick,
        note: 'Complete the protected step in the headed browser; auto-resume requires live session affinity',
      });
    }
    await enqueueNextWatch({ ...params, intervalMs, tick: tick + 1 });
    return;
  }

  const watcher = new PageWatcher(runtime);
  const result = await watcher.evaluate(gate);

  await mergeJobMetrics(workspaceId, jobId, {
    lastWatchTick: tick,
    lastWatchAt: new Date().toISOString(),
    lastWatchReasons: result.reasons,
    lastWatchUrl: result.snapshot.url,
  });

  if (result.cleared) {
    const watchDurationMs = Date.now() - watchStarted;
    await persistSessionStorageState(sessionId || String(execJob.session_id ?? ''));
    if (gate === 'login') {
      await markSessionAuth(sessionId || String(execJob.session_id ?? ''), true);
    }

    await getSupabaseAdmin()
      .from('execution_jobs')
      .update({
        status: 'ready_to_continue',
        resume_reason: `gate_cleared:${gate}:${result.reasons.join(',')}`,
        watch_finished_at: new Date().toISOString(),
        watch_duration_ms: watchDurationMs,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    await markGateStepDone(workspaceId, jobId, gate);
    await appendLog(workspaceId, jobId, 'info', `Gate cleared by user — ${gate}`, {
      reasons: result.reasons,
      watchDurationMs,
      autoResume,
      nonNegotiable: true,
      note: 'User completed protected step; automation did not bypass',
    });

    if (autoResume) {
      await autoResumeJob(workspaceId, jobId, {
        resumeReason: `auto_after_${gate}`,
        gate,
      });
    }
    return;
  }

  if (tick === 0 || tick % 10 === 0) {
    await appendLog(workspaceId, jobId, 'debug', `Watching for ${gate} clearance`, {
      tick,
      stillPresent: result.stillPresent,
      url: result.snapshot.url,
    });
  }

  await enqueueNextWatch({ ...params, intervalMs, tick: tick + 1 });
}

async function runtimeHasPage(runtime: {
  capture: (label: string) => Promise<unknown>;
}): Promise<boolean> {
  try {
    await runtime.capture('watch_ping');
    return true;
  } catch {
    return false;
  }
}

async function enqueueNextWatch(params: {
  jobId: string;
  workspaceId: string;
  sessionId: string;
  gate: NonNullable<ExecutionGate>;
  intervalMs: number;
  tick: number;
}): Promise<void> {
  await enqueueJob(
    QUEUES.PLAYWRIGHT,
    'bee_watch',
    {
      type: 'bee_watch',
      jobId: params.jobId,
      workspaceId: params.workspaceId,
      sessionId: params.sessionId,
      gate: params.gate,
      tick: params.tick,
    },
    {
      singletonKey: `bee-watch-${params.jobId}`,
      startAfter: Math.ceil(params.intervalMs / 1000) || 2,
    }
  );
}

export async function handleBeeResumeJobs(
  jobs: Array<{ id: string; data: Record<string, unknown> }>
): Promise<void> {
  for (const job of jobs) {
    if (String(job.data.type ?? '') !== 'bee_resume') continue;
    const jobId = String(job.data.jobId ?? '');
    const workspaceId = String(job.data.workspaceId ?? '');
    if (!jobId || !workspaceId) continue;
    await autoResumeJob(workspaceId, jobId, {
      resumeReason: String(job.data.resumeReason ?? 'bee_resume_worker'),
      gate: asGate(job.data.gate) ?? undefined,
    });
  }
}

export async function handleBeeQueueJobs(
  jobs: Array<{ id: string; data: Record<string, unknown> }>
): Promise<void> {
  for (const job of jobs) {
    if (String(job.data.type ?? '') !== 'bee_queue') continue;
    const workspaceId = String(job.data.workspaceId ?? '');
    if (!workspaceId) continue;
    const started = await continueQueuedJobs(workspaceId, {
      afterJobId: job.data.afterJobId ? String(job.data.afterJobId) : undefined,
      batchId: job.data.batchId ? String(job.data.batchId) : undefined,
      limit: Number(job.data.limit ?? 1),
    });
    logger.info({ workspaceId, started: started.length }, 'BEE queue continuation');
  }
}

export async function handleBeeSessionHealthJobs(
  jobs: Array<{ id: string; data: Record<string, unknown> }>
): Promise<void> {
  for (const job of jobs) {
    if (String(job.data.type ?? '') !== 'bee_session_health') continue;
    const workspaceId = String(job.data.workspaceId ?? '');
    const sessionId = job.data.sessionId ? String(job.data.sessionId) : undefined;

    let q = getSupabaseAdmin()
      .from('browser_sessions')
      .select('id, status, site_domain, session_expires_at')
      .is('deleted_at', null)
      .in('status', ['running', 'paused', 'idle']);
    if (workspaceId) q = q.eq('workspace_id', workspaceId);
    if (sessionId) q = q.eq('id', sessionId);
    const { data: sessions } = await q.limit(50);

    for (const s of sessions ?? []) {
      const expires = s.session_expires_at ? new Date(String(s.session_expires_at)).getTime() : null;
      if (expires && expires < Date.now()) {
        await getSupabaseAdmin()
          .from('browser_sessions')
          .update({
            status: 'idle',
            auth_detected: false,
            health_status: 'expired',
            last_error: 'Session expired — login required on next use',
            updated_at: new Date().toISOString(),
          })
          .eq('id', s.id);
        continue;
      }
      const runtime = getSessionRuntime(String(s.id));
      const health = await runtime.health();
      await getSupabaseAdmin()
        .from('browser_sessions')
        .update({
          health_status: health.playwrightAvailable ? health.status : 'unavailable',
          last_health_at: new Date().toISOString(),
          last_error: health.playwrightAvailable ? null : health.message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', s.id);
    }
  }
}

/** Enqueue watch after a gate pause (called from bee-worker). */
export async function enqueueGateWatch(params: {
  jobId: string;
  workspaceId: string;
  sessionId: string;
  gate: NonNullable<ExecutionGate>;
  intervalMs?: number;
}): Promise<void> {
  const watching = watchingStatusFromBlocker(params.gate) ?? 'watching';
  await getSupabaseAdmin()
    .from('execution_jobs')
    .update({
      status: watching,
      pause_reason: params.gate,
      watch_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.jobId);

  await enqueueJob(
    QUEUES.PLAYWRIGHT,
    'bee_watch',
    {
      type: 'bee_watch',
      jobId: params.jobId,
      workspaceId: params.workspaceId,
      sessionId: params.sessionId,
      gate: params.gate,
      tick: 0,
    },
    {
      singletonKey: `bee-watch-${params.jobId}`,
      startAfter: Math.ceil((params.intervalMs ?? 2000) / 1000) || 2,
    }
  );
}
