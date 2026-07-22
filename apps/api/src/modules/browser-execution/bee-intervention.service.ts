/**
 * Human Intervention Center — pause gates surface here (login/CAPTCHA/MFA/verify).
 * Jobs stay Waiting for User; sessions + storage preserved for auto-resume.
 */
import { randomUUID } from 'node:crypto';
import {
  isWatchableGate,
  interventionCopyForPauseReason,
  toPublicExecutionStatus,
  workflowStepLabel,
  type ExecutionGate,
} from '@seo-os/backlink-builder';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import { DEFAULT_FEATURE_FLAGS } from '@seo-os/shared';
import { getSessionRuntime } from './browser-runtime.service.js';
import { autoResumeJob, getJob, listJobs, resumeJob } from './bee.service.js';
import { PageWatcher } from './page-watcher.js';
import {
  loadStorageStateFromSession,
  persistSessionStorageState,
} from './bee-session.js';

export type InterventionGate =
  | 'login'
  | 'signup'
  | 'captcha'
  | 'recaptcha'
  | 'cloudflare'
  | 'otp'
  | 'mfa'
  | 'email_verify'
  | 'phone_verify'
  | 'security_question'
  | 'category'
  | 'manual_input'
  | 'human_approval'
  | 'unclassified'
  | 'needs_ai_review'
  | 'unknown';

const INTERVENTION_STATUSES = [
  'paused',
  'needs_approval',
  'ready_for_review',
  'awaiting_user',
  'watching_captcha',
  'watching_login',
  'watching_mfa',
  'watching_email',
  'watching_phone',
  'blocked_captcha',
  'blocked_mfa',
  'blocked_email_verify',
  'blocked_phone_verify',
  'ready_to_continue',
] as const;

export function isInterventionStatus(status: string): boolean {
  if (
    INTERVENTION_STATUSES.includes(status as (typeof INTERVENTION_STATUSES)[number]) ||
    status.startsWith('watching_') ||
    status.startsWith('blocked_')
  ) {
    return true;
  }
  // Any job CSM counts as Waiting Human must be actionable in the queue
  return toPublicExecutionStatus(status) === 'Waiting Human';
}

type PauseMetrics = {
  pauseContext?: {
    url?: string;
    pausedUrl?: string;
    stepAction?: string;
    currentStepLabel?: string;
    explanation?: string;
    reason?: string;
    evidence?: string[];
    pageTitle?: string;
  };
  lastUrl?: string;
  pausedUrl?: string;
  pageTitle?: string;
  currentStepLabel?: string;
  pauseExplanation?: string;
  pauseReasonLabel?: string;
  loginFormDetected?: boolean;
  domEvidence?: string;
  pauseEvidence?: string[];
};

function metricsOf(job: Record<string, unknown>): PauseMetrics {
  return (job.metrics as PauseMetrics | null) ?? {};
}

function pausedUrlFromJob(job: Record<string, unknown>): string | null {
  const m = metricsOf(job);
  const raw =
    m.pausedUrl ||
    m.pauseContext?.pausedUrl ||
    m.pauseContext?.url ||
    m.lastUrl ||
    null;
  const s = raw != null ? String(raw).trim() : '';
  return s || null;
}

/**
 * Resolve gate from stored pause_reason first.
 * Never infer "login" from vague statuses like awaiting_user / authenticating alone.
 */
export function resolveInterventionGate(job: {
  status?: unknown;
  pause_reason?: unknown;
  metrics?: unknown;
}): InterventionGate {
  const pause = String(job.pause_reason ?? '');
  const status = String(job.status ?? '');
  const m = (job.metrics as PauseMetrics | null) ?? {};

  if (pause === 'login') {
    // Only report login when we recorded login-form evidence (or legacy jobs without the flag)
    if (m.loginFormDetected === false) return 'unknown';
    return 'login';
  }
  if (pause === 'signup' || pause === 'registration') return 'signup';
  if (pause === 'category' || pause === 'category_selection') return 'category';
  if (pause === 'manual_input' || pause === 'validation_failed') return 'manual_input';
  if (pause === 'captcha' || status.includes('captcha')) return 'captcha';
  if (pause === 'mfa' || status.includes('mfa')) return 'mfa';
  if (pause === 'email_verify' || (status.includes('email') && status.includes('watch'))) {
    return 'email_verify';
  }
  if (pause === 'phone_verify' || status.includes('phone')) return 'phone_verify';
  if (pause === 'human_approval') return 'human_approval';
  if (pause === 'unclassified' || pause === 'needs_ai_review') return 'unclassified';
  if (!pause && (status === 'needs_approval' || status === 'ready_for_review')) {
    return 'human_approval';
  }
  if (/cloudflare|turnstile/i.test(pause)) return 'cloudflare';
  if (/otp|2fa/i.test(pause)) return 'otp';
  if (/signup|sign_up|registration/i.test(pause)) return 'signup';
  if (/categor/i.test(pause)) return 'category';
  if (/security/i.test(pause)) return 'security_question';
  // watching_login is explicit — still login
  if (status === 'watching_login' || status === 'blocked_login') return 'login';
  if (status === 'needs_approval' || status === 'ready_for_review') return 'human_approval';
  return 'unknown';
}

export function humanInterventionCopy(gate: InterventionGate, job?: {
  pause_reason?: unknown;
  metrics?: unknown;
}): {
  reason: string;
  title: string;
  instruction: string;
  cta: string;
  successToast: string;
} {
  const pause = job?.pause_reason != null ? String(job.pause_reason) : gate;
  const m = (job?.metrics as PauseMetrics | null) ?? {};
  const copy = interventionCopyForPauseReason(pause, {
    loginFormDetected: m.loginFormDetected,
    explanation: m.pauseExplanation || m.pauseContext?.explanation || m.pauseReasonLabel || null,
  });
  // Prefer stored human labels when present
  if (m.pauseReasonLabel && gate !== 'login') {
    return {
      ...copy,
      reason: String(m.pauseReasonLabel),
      instruction: String(m.pauseExplanation || m.pauseContext?.explanation || copy.instruction),
    };
  }
  if (gate === 'login' && m.loginFormDetected !== false) {
    return {
      ...copy,
      reason: m.pauseReasonLabel || copy.reason,
      instruction: String(m.pauseExplanation || m.pauseContext?.explanation || copy.instruction),
    };
  }
  return {
    reason: copy.reason,
    title: copy.title,
    instruction: copy.instruction,
    cta: copy.cta,
    successToast: copy.successToast,
  };
}

async function signLatestScreenshot(workspaceId: string, jobId: string) {
  const { data: assets } = await getSupabaseAdmin()
    .from('execution_assets')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('job_id', jobId)
    .eq('kind', 'screenshot')
    .order('created_at', { ascending: false })
    .limit(1);
  const a = assets?.[0];
  if (!a?.storage_path) return null;
  const { data } = await getSupabaseAdmin()
    .storage.from('browser-execution')
    .createSignedUrl(String(a.storage_path), 3600);
  return {
    id: a.id as string,
    label: String(a.label ?? 'live'),
    url: data?.signedUrl ?? null,
    createdAt: String(a.created_at ?? ''),
  };
}

async function uploadLiveScreenshot(
  workspaceId: string,
  jobId: string,
  base64: string
): Promise<{ url: string | null; path: string }> {
  const path = `browser-execution/${workspaceId}/${jobId}/live-${Date.now()}.jpg`;
  try {
    const buf = Buffer.from(base64, 'base64');
    await getSupabaseAdmin().storage
      .from('browser-execution')
      .upload(path, buf, { contentType: 'image/jpeg', upsert: true });
  } catch (err) {
    logger.debug({ err }, 'Intervention live screenshot upload skipped');
  }
  await getSupabaseAdmin().from('execution_assets').insert({
    id: randomUUID(),
    workspace_id: workspaceId,
    job_id: jobId,
    step_id: null,
    kind: 'screenshot',
    label: 'live_intervention',
    storage_path: path,
    mime_type: 'image/jpeg',
  });
  const { data } = await getSupabaseAdmin()
    .storage.from('browser-execution')
    .createSignedUrl(path, 3600);
  return { url: data?.signedUrl ?? null, path };
}

const HUMAN_QUEUE_GATES = new Set([
  'login',
  'signup',
  'captcha',
  'recaptcha',
  'cloudflare',
  'otp',
  'mfa',
  'email_verify',
  'phone_verify',
  'human_approval',
]);

export async function listInterventions(workspaceId: string) {
  const jobs = await listJobs(workspaceId);
  const verified: Array<Record<string, unknown>> = [];
  const unclassifiedGroup: Array<Record<string, unknown>> = [];
  for (const j of jobs) {
    const status = String(j.status);
    if (!isInterventionStatus(status)) continue;
    const jobRec = j as Record<string, unknown>;
    const disposition =
      jobRec.disposition != null
        ? String(jobRec.disposition)
        : ((jobRec.metrics as { disposition?: string } | null)?.disposition ?? null);
    // Deleted / Ignored never appear in Human Intervention Queue
    if (status === 'deleted' || status === 'ignored' || disposition === 'deleted_forever') {
      continue;
    }
    // Phase 4.7 trust: every Waiting Human job must be actionable.
    // Evidence-backed rows are preferred; missing evidence still surfaces (legacy / heal path).
    const evidenceId =
      jobRec.evidence_id != null
        ? String(jobRec.evidence_id)
        : ((jobRec.metrics as { evidenceId?: string } | null)?.evidenceId ?? null);

    const gate = resolveInterventionGate(jobRec);
    // Dedicated Human Intervention Queue — only protected human gates
    if (
      !HUMAN_QUEUE_GATES.has(gate) &&
      gate !== 'unknown' &&
      gate !== 'category' &&
      gate !== 'manual_input' &&
      gate !== 'security_question' &&
      gate !== 'unclassified' &&
      gate !== 'needs_ai_review'
    ) {
      continue;
    }
    const missingEvidence = !evidenceId;
    const copy = humanInterventionCopy(gate, jobRec);
    const started = j.watch_started_at || j.started_at || j.created_at;
    const elapsedMs = started ? Date.now() - new Date(String(started)).getTime() : 0;
    const m = metricsOf(jobRec);
    const steps = (j.steps as Array<{ action?: string }> | undefined) ?? [];
    const idx = Number(j.current_step_index ?? 0);
    const stepAction = m.pauseContext?.stepAction || steps[idx]?.action || null;
    const pausedUrl = pausedUrlFromJob(jobRec);
    const isUnclassified =
      jobRec.unclassified === true ||
      gate === 'unclassified' ||
      gate === 'needs_ai_review' ||
      String(jobRec.truth_claim ?? '') === 'Unclassified' ||
      String(j.pause_reason ?? '') === 'unclassified';
    const evidenceBlob =
      (jobRec.evidence as Record<string, unknown> | null) ??
      (m as { evidence?: Record<string, unknown> }).evidence ??
      null;
    const row = {
      jobId: String(j.id),
      website: String(j.site_domain ?? 'Website'),
      pausedUrl,
      currentUrl: pausedUrl,
      currentStep: m.currentStepLabel || workflowStepLabel(stepAction, idx),
      detectedStep: m.currentStepLabel || workflowStepLabel(stepAction, idx),
      opportunityId: j.opportunity_id ? String(j.opportunity_id) : null,
      sessionId: j.session_id ? String(j.session_id) : null,
      status,
      displayStatus: isUnclassified
        ? 'Unclassified — needs diagnosis'
        : missingEvidence
          ? 'Needs You — open browser'
          : 'Needs You',
      gate: isUnclassified ? 'unclassified' : gate,
      reason: isUnclassified
        ? 'Unclassified — needs diagnosis'
        : missingEvidence
          ? copy.reason || 'This site is waiting for you. Open the browser to continue.'
          : (jobRec.truth_claim != null ? String(jobRec.truth_claim) : copy.reason),
      title: (() => {
        const expected = Boolean(
          (m as { expectedIntervention?: boolean }).expectedIntervention ||
            ((m as { expectedInterventions?: string[] }).expectedInterventions ?? []).length
        );
        if (isUnclassified) return 'Unclassified — needs diagnosis';
        if (missingEvidence) return copy.title || 'Action required';
        if (expected && (gate === 'login' || gate === 'signup')) {
          return `${copy.title} (expected)`;
        }
        return copy.title;
      })(),
      instruction: isUnclassified
        ? 'The system could not determine what is blocking this. Review the evidence and diagnose.'
        : missingEvidence
          ? copy.instruction ||
            'Open the live browser, complete the required step, then continue.'
          : copy.instruction,
      explanation: m.pauseExplanation || m.pauseContext?.explanation || copy.instruction,
      cta: copy.cta,
      pauseReason: j.pause_reason ? String(j.pause_reason) : null,
      currentStepIndex: idx,
      elapsedMs,
      timeWaitingMs: elapsedMs,
      createdAt: String(j.created_at),
      autoResumePending: status === 'ready_to_continue',
      evidenceId,
      matchedSignals: m.pauseEvidence || m.pauseContext?.evidence || [],
      screenshotPath:
        evidenceBlob && typeof evidenceBlob.screenshotPath === 'string'
          ? evidenceBlob.screenshotPath
          : null,
      domSnapshotPath:
        evidenceBlob && typeof evidenceBlob.domSnapshotPath === 'string'
          ? evidenceBlob.domSnapshotPath
          : null,
      stage: stepAction || m.currentStepLabel || null,
      unclassified: isUnclassified,
      verified: Boolean(evidenceId) && !isUnclassified,
      missingEvidence,
    };
    if (isUnclassified) unclassifiedGroup.push(row);
    else verified.push(row);
  }
  verified.sort(
    (a, b) => new Date(String(a.createdAt)).getTime() - new Date(String(b.createdAt)).getTime()
  );
  unclassifiedGroup.sort(
    (a, b) => new Date(String(a.createdAt)).getTime() - new Date(String(b.createdAt)).getTime()
  );

  // Phase 6 — one Waiting Human card per Campaign Item (opportunity).
  const dedupeByOpp = (rows: Array<Record<string, unknown>>) => {
    const seen = new Set<string>();
    const out: Array<Record<string, unknown>> = [];
    for (const row of rows) {
      const oid = row.opportunityId != null ? String(row.opportunityId) : `job:${row.jobId}`;
      if (seen.has(oid)) continue;
      seen.add(oid);
      out.push(row);
    }
    return out;
  };
  const verifiedDeduped = dedupeByOpp(verified);
  const unclassifiedDeduped = dedupeByOpp(unclassifiedGroup);
  const items = [...verifiedDeduped, ...unclassifiedDeduped];
  return {
    count: items.length,
    verifiedCount: verifiedDeduped.length,
    unclassifiedCount: unclassifiedDeduped.length,
    items,
    verified: verifiedDeduped,
    unclassified: unclassifiedDeduped,
  };
}

export async function getIntervention(workspaceId: string, jobId: string) {
  const job = await getJob(workspaceId, jobId);
  if (!job) return null;
  const jobRec = job as Record<string, unknown>;
  const status = String(job.status);
  const gate = resolveInterventionGate(jobRec);
  const copy = humanInterventionCopy(gate, jobRec);
  const m = metricsOf(jobRec);
  const steps = (job.steps as Array<{ step_index: number; action: string; status: string }> | undefined) ?? [];
  const doneSteps = steps.filter((s) => s.status === 'done').length;
  const totalSteps = Math.max(steps.length, 8);
  const idx = Number(job.current_step_index ?? 0);
  const stepAction = m.pauseContext?.stepAction || steps[idx]?.action || null;
  const currentStepLabel =
    m.currentStepLabel || workflowStepLabel(stepAction, idx);
  const screenshot = await signLatestScreenshot(workspaceId, jobId);
  const pausedUrl = pausedUrlFromJob(jobRec);

  const sessionId = String(job.session_id ?? '');
  let sessionConnected = false;
  let liveUrl: string | null = null;
  let pageTitle: string | null = m.pageTitle || m.pauseContext?.pageTitle || null;
  if (sessionId) {
    try {
      const runtime = getSessionRuntime(sessionId);
      const health = await runtime.health();
      const cap = await runtime.capture('intervention_ping');
      sessionConnected = health.playwrightAvailable && Boolean(cap.url);
      liveUrl = cap.url || null;
      pageTitle = cap.title || pageTitle;
    } catch {
      sessionConnected = false;
    }
  }

  // Prefer exact paused URL; live session URL only if it is not a bare homepage substitute
  const openUrl = pausedUrl || liveUrl || null;

  const started = job.watch_started_at || job.started_at || job.created_at;
  const elapsedMs = started ? Date.now() - new Date(String(started)).getTime() : 0;
  const explanation =
    m.pauseExplanation || m.pauseContext?.explanation || copy.instruction;

  return {
    jobId,
    website: String(job.site_domain ?? 'Website'),
    pausedUrl,
    openUrl,
    opportunityId: job.opportunity_id ? String(job.opportunity_id) : null,
    sessionId: sessionId || null,
    status,
    displayStatus: isInterventionStatus(status) ? 'Waiting for User' : status,
    gate,
    reason: copy.reason,
    title: copy.title,
    instruction: copy.instruction,
    explanation,
    cta: copy.cta,
    successToast: copy.successToast,
    pauseReason: job.pause_reason ? String(job.pause_reason) : null,
    currentStep: doneSteps || idx,
    totalSteps,
    stepLabel: currentStepLabel,
    currentStepLabel,
    browser: sessionConnected ? 'Live' : 'Session saved',
    session: sessionConnected ? 'Connected' : 'Restorable',
    elapsedMs,
    screenshot,
    liveUrl: openUrl,
    pageTitle,
    domEvidence: m.domEvidence || null,
    pauseEvidence: m.pauseEvidence || m.pauseContext?.evidence || [],
    loginFormDetected: m.loginFormDetected ?? (gate === 'login' ? true : null),
    needsAction: isInterventionStatus(status),
    autoResume: true,
    completedByAi: [
      'Navigated to the website',
      'Detected form fields',
      'Filled company information',
      'Prepared uploads & content',
    ],
    userOnly: copy.reason,
  };
}

/** Reattach / relaunch Playwright so the user can interact with the same session. */
async function ensureLiveInterventionSession(
  workspaceId: string,
  job: Record<string, unknown>
): Promise<{ ok: boolean; sessionId: string; restored: boolean; message?: string }> {
  const sessionId = String(job.session_id ?? '');
  if (!sessionId) {
    return { ok: false, sessionId: '', restored: false, message: 'No browser session on this job' };
  }
  const runtime = getSessionRuntime(sessionId);
  if (runtime.hasLivePage()) {
    return { ok: true, sessionId, restored: false };
  }

  const { data: sess } = await getSupabaseAdmin()
    .from('browser_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  const storageState = sess ? await loadStorageStateFromSession(sess) : null;
  const metrics = (job.metrics as {
    pauseContext?: { url?: string; pausedUrl?: string };
    lastUrl?: string;
    pausedUrl?: string;
  } | null) ?? null;
  const site = String(job.site_domain ?? '');
  // Always restore the exact paused URL — never invent a homepage when we have a pause URL
  const targetUrl =
    metrics?.pausedUrl ||
    metrics?.pauseContext?.pausedUrl ||
    metrics?.pauseContext?.url ||
    metrics?.lastUrl ||
    (site ? (site.startsWith('http') ? site : `https://${site}`) : '');

  try {
    await runtime.launch({
      mode: DEFAULT_FEATURE_FLAGS.bee_headed_debug ? 'headed' : 'headless',
      storageState: storageState ?? undefined,
    });
    if (targetUrl) {
      await runtime.navigate(targetUrl, 25_000).catch((err) => {
        logger.warn({ err, sessionId, targetUrl }, 'Intervention restore navigate soft-failed');
      });
    }
    await getSupabaseAdmin()
      .from('browser_sessions')
      .update({ status: 'paused', updated_at: new Date().toISOString() })
      .eq('id', sessionId);
    logger.info({ workspaceId, sessionId, targetUrl }, 'Restored live browser for intervention');
    return { ok: true, sessionId, restored: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not restore browser session';
    logger.warn({ err, sessionId }, 'Failed to restore intervention browser');
    return { ok: false, sessionId, restored: false, message };
  }
}

export async function getInterventionFrame(workspaceId: string, jobId: string) {
  const job = await getJob(workspaceId, jobId);
  if (!job) return null;
  const ensured = await ensureLiveInterventionSession(workspaceId, job as Record<string, unknown>);
  if (!ensured.ok) {
    return {
      ok: false,
      live: false,
      interactive: false,
      restored: ensured.restored,
      message: ensured.message ?? 'Browser session unavailable',
      dataUrl: null as string | null,
      pageUrl: null as string | null,
      title: null as string | null,
      viewport: null as { width: number; height: number } | null,
    };
  }
  try {
    const runtime = getSessionRuntime(ensured.sessionId);
    const frame = await runtime.captureFrame(52);
    return {
      ok: true,
      live: true,
      interactive: true,
      restored: ensured.restored,
      message: ensured.restored ? 'Session restored — you can interact now' : 'Connected',
      dataUrl: `data:image/jpeg;base64,${frame.screenshotBase64}`,
      pageUrl: frame.url,
      title: frame.title,
      viewport: frame.viewport,
    };
  } catch (err) {
    return {
      ok: false,
      live: false,
      interactive: false,
      restored: ensured.restored,
      message: err instanceof Error ? err.message : 'Frame capture failed',
      dataUrl: null,
      pageUrl: null,
      title: null,
      viewport: null,
    };
  }
}

export async function dispatchInterventionInput(
  workspaceId: string,
  jobId: string,
  event: {
    type:
      | 'click'
      | 'dblclick'
      | 'mousemove'
      | 'mousedown'
      | 'mouseup'
      | 'scroll'
      | 'keydown'
      | 'keyup'
      | 'type';
    x?: number;
    y?: number;
    button?: 'left' | 'right' | 'middle';
    deltaX?: number;
    deltaY?: number;
    key?: string;
    text?: string;
    modifiers?: Array<'Alt' | 'Control' | 'Meta' | 'Shift'>;
  }
) {
  const job = await getJob(workspaceId, jobId);
  if (!job) return { ok: false, message: 'Job not found' };
  if (!isInterventionStatus(String(job.status))) {
    return { ok: false, message: 'Job is no longer waiting for user action' };
  }
  const ensured = await ensureLiveInterventionSession(workspaceId, job as Record<string, unknown>);
  if (!ensured.ok) {
    return { ok: false, message: ensured.message ?? 'No live session' };
  }
  try {
    const runtime = getSessionRuntime(ensured.sessionId);
    await runtime.dispatchRemoteInput(event);
    // Soft persist cookies after auth-critical interactions so refresh never loses login progress
    if (event.type === 'click' || event.type === 'type' || event.type === 'keydown') {
      void persistSessionStorageState(ensured.sessionId).catch(() => undefined);
    }
    return { ok: true, message: 'ok', restored: ensured.restored };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Input failed',
    };
  }
}

export async function captureInterventionView(workspaceId: string, jobId: string) {
  const job = await getJob(workspaceId, jobId);
  if (!job) return null;
  const ensured = await ensureLiveInterventionSession(workspaceId, job as Record<string, unknown>);
  const sessionId = ensured.sessionId;
  if (sessionId && ensured.ok) {
    try {
      const runtime = getSessionRuntime(sessionId);
      const cap = await runtime.capture('intervention_live');
      if (cap.screenshotBase64) {
        const uploaded = await uploadLiveScreenshot(workspaceId, jobId, cap.screenshotBase64);
        return {
          ok: true,
          live: true,
          interactive: true,
          restored: ensured.restored,
          url: uploaded.url,
          pageUrl: cap.url,
          title: cap.title,
          detectedGates: cap.detectedGates,
        };
      }
    } catch (err) {
      logger.debug({ err, jobId }, 'Live capture unavailable — falling back to stored screenshot');
    }
  }
  const shot = await signLatestScreenshot(workspaceId, jobId);
  return {
    ok: Boolean(shot?.url),
    live: false,
    url: shot?.url ?? null,
    pageUrl: null,
    title: null,
    detectedGates: [] as string[],
  };
}

/** User finished the manual step — detect clearance and auto-resume (no Resume button required). */
export async function checkInterventionCleared(workspaceId: string, jobId: string) {
  const job = await getJob(workspaceId, jobId);
  if (!job) return { cleared: false, resumed: false, message: 'Job not found' };

  const gate = resolveInterventionGate(job as Record<string, unknown>);
  const copy = humanInterventionCopy(gate, job as Record<string, unknown>);
  const sessionId = String(job.session_id ?? '');
  const watchable = isWatchableGate(gate as ExecutionGate) ? (gate as NonNullable<ExecutionGate>) : null;

  if (sessionId && watchable) {
    try {
      const runtime = getSessionRuntime(sessionId);
      const watcher = new PageWatcher(runtime);
      const result = await watcher.evaluate(watchable);
      if (result.cleared) {
        await persistSessionStorageState(sessionId).catch(() => undefined);
        await autoResumeJob(workspaceId, jobId, {
          resumeReason: `user_cleared_${watchable}`,
          gate: watchable,
        });
        return {
          cleared: true,
          resumed: true,
          message: copy.successToast,
          gate: watchable,
        };
      }
      return {
        cleared: false,
        resumed: false,
        message: 'Still waiting — finish the step on the live page. AI will keep watching.',
        reasons: result.reasons,
      };
    } catch (err) {
      logger.warn({ err, jobId }, 'Live gate check failed — attempting storage restore resume');
    }
  }

  // Approval gate
  if (resolveInterventionGate(job) === 'human_approval') {
    return {
      cleared: false,
      resumed: false,
      message: 'Approve the submission from Browser Assistant when ready.',
      needsApprove: true,
    };
  }

  // No live page (affinity lost): still try resume with restored storage so queue never stalls
  if (String(job.status) === 'ready_to_continue' || String(job.status).startsWith('watching')) {
    try {
      await resumeJob(workspaceId, jobId, {
        resumeReason: 'user_finished_intervention',
        auto: true,
      });
      return { cleared: true, resumed: true, message: copy.successToast };
    } catch (err) {
      return {
        cleared: false,
        resumed: false,
        message: err instanceof Error ? err.message : 'Could not resume yet',
      };
    }
  }

  return {
    cleared: false,
    resumed: false,
    message: 'Complete the required step — AI is watching and will continue automatically.',
  };
}
