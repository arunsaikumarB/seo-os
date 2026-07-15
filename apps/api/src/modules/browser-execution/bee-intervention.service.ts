/**
 * Human Intervention Center — pause gates surface here (login/CAPTCHA/MFA/verify).
 * Jobs stay Waiting for User; sessions + storage preserved for auto-resume.
 */
import { randomUUID } from 'node:crypto';
import { isWatchableGate, type ExecutionGate } from '@seo-os/backlink-builder';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import { getSessionRuntime } from './browser-runtime.service.js';
import { autoResumeJob, getJob, listJobs, resumeJob } from './bee.service.js';
import { PageWatcher } from './page-watcher.js';
import { persistSessionStorageState } from './bee-session.js';

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
  | 'human_approval'
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
  return (
    INTERVENTION_STATUSES.includes(status as (typeof INTERVENTION_STATUSES)[number]) ||
    status.startsWith('watching_') ||
    status.startsWith('blocked_')
  );
}

export function resolveInterventionGate(job: {
  status?: unknown;
  pause_reason?: unknown;
}): InterventionGate {
  const pause = String(job.pause_reason ?? '');
  const status = String(job.status ?? '');
  if (pause === 'login' || status.includes('login') || status === 'authenticating') return 'login';
  if (pause === 'captcha' || status.includes('captcha')) return 'captcha';
  if (pause === 'mfa' || status.includes('mfa')) return 'mfa';
  if (pause === 'email_verify' || status.includes('email')) return 'email_verify';
  if (pause === 'phone_verify' || status.includes('phone')) return 'phone_verify';
  if (pause === 'human_approval' || status === 'needs_approval' || status === 'ready_for_review') {
    return 'human_approval';
  }
  if (/cloudflare|turnstile/i.test(pause)) return 'cloudflare';
  if (/otp|2fa/i.test(pause)) return 'otp';
  if (/signup|sign_up/i.test(pause)) return 'signup';
  if (/security/i.test(pause)) return 'security_question';
  return 'unknown';
}

export function humanInterventionCopy(gate: InterventionGate): {
  reason: string;
  title: string;
  instruction: string;
  cta: string;
  successToast: string;
} {
  switch (gate) {
    case 'login':
      return {
        reason: 'Login Required',
        title: 'AI needs your help — Login',
        instruction:
          'AI has completed everything possible. Please sign in on this website to continue.',
        cta: 'Open Browser Assistant',
        successToast: 'Login successful — resuming automation…',
      };
    case 'signup':
      return {
        reason: 'Signup Required',
        title: 'AI needs your help — Signup',
        instruction: 'Create or finish the account on this website, then wait — AI continues automatically.',
        cta: 'Open Browser Assistant',
        successToast: 'Signup complete — resuming automation…',
      };
    case 'captcha':
    case 'recaptcha':
      return {
        reason: 'Solve CAPTCHA',
        title: 'CAPTCHA detected',
        instruction: 'Solve the CAPTCHA on the live page. AI will continue automatically when cleared.',
        cta: 'Solve CAPTCHA',
        successToast: 'CAPTCHA solved — AI is continuing…',
      };
    case 'cloudflare':
      return {
        reason: 'Cloudflare Challenge',
        title: 'Security check required',
        instruction: 'Complete the Cloudflare / bot check. AI resumes when the site unlocks.',
        cta: 'Open Browser Assistant',
        successToast: 'Challenge cleared — resuming automation…',
      };
    case 'mfa':
    case 'otp':
      return {
        reason: 'Enter Verification Code',
        title: 'MFA / OTP required',
        instruction: 'Enter the one-time code from your authenticator or SMS. AI continues after success.',
        cta: 'Open Browser Assistant',
        successToast: 'Verification successful — resuming automation…',
      };
    case 'email_verify':
      return {
        reason: 'Verify Email',
        title: 'Email verification required',
        instruction: 'Open the verification email and confirm. Return here — AI detects completion automatically.',
        cta: 'Open Browser Assistant',
        successToast: 'Email verified — resuming automation…',
      };
    case 'phone_verify':
      return {
        reason: 'Verify Phone',
        title: 'Phone verification required',
        instruction: 'Enter the SMS code on the live page. AI continues automatically.',
        cta: 'Open Browser Assistant',
        successToast: 'Phone verified — resuming automation…',
      };
    case 'security_question':
      return {
        reason: 'Security Question',
        title: 'Security question required',
        instruction: 'Answer the security question on the live page. AI resumes when done.',
        cta: 'Open Browser Assistant',
        successToast: 'Security check passed — resuming automation…',
      };
    case 'human_approval':
      return {
        reason: 'Manual Approval',
        title: 'Approval needed',
        instruction: 'Review the prepared submission, then approve so AI can submit.',
        cta: 'Open Browser Assistant',
        successToast: 'Approved — resuming automation…',
      };
    default:
      return {
        reason: 'Action Required',
        title: 'AI needs your help',
        instruction: 'Complete the step on the live page. AI continues automatically when finished.',
        cta: 'Open Browser Assistant',
        successToast: 'Step complete — resuming automation…',
      };
  }
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

export async function listInterventions(workspaceId: string) {
  const jobs = await listJobs(workspaceId);
  const items = [];
  for (const j of jobs) {
    const status = String(j.status);
    if (!isInterventionStatus(status)) continue;
    // ready_to_continue is transient — still show briefly as resuming
    const gate = resolveInterventionGate(j);
    const copy = humanInterventionCopy(gate);
    const started = j.watch_started_at || j.started_at || j.created_at;
    const elapsedMs = started ? Date.now() - new Date(String(started)).getTime() : 0;
    items.push({
      jobId: String(j.id),
      website: String(j.site_domain ?? 'Website'),
      opportunityId: j.opportunity_id ? String(j.opportunity_id) : null,
      sessionId: j.session_id ? String(j.session_id) : null,
      status,
      displayStatus: 'Waiting for User',
      gate,
      reason: copy.reason,
      title: copy.title,
      instruction: copy.instruction,
      cta: copy.cta,
      pauseReason: j.pause_reason ? String(j.pause_reason) : null,
      currentStepIndex: Number(j.current_step_index ?? 0),
      elapsedMs,
      createdAt: String(j.created_at),
      autoResumePending: status === 'ready_to_continue',
    });
  }
  items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return { count: items.length, items };
}

export async function getIntervention(workspaceId: string, jobId: string) {
  const job = await getJob(workspaceId, jobId);
  if (!job) return null;
  const status = String(job.status);
  const gate = resolveInterventionGate(job);
  const copy = humanInterventionCopy(gate);
  const steps = (job.steps as Array<{ step_index: number; action: string; status: string }> | undefined) ?? [];
  const doneSteps = steps.filter((s) => s.status === 'done').length;
  const totalSteps = Math.max(steps.length, 8);
  const screenshot = await signLatestScreenshot(workspaceId, jobId);

  const sessionId = String(job.session_id ?? '');
  let sessionConnected = false;
  let liveUrl: string | null = null;
  let pageTitle: string | null = null;
  if (sessionId) {
    try {
      const runtime = getSessionRuntime(sessionId);
      const health = await runtime.health();
      const cap = await runtime.capture('intervention_ping');
      sessionConnected = health.playwrightAvailable && Boolean(cap.url);
      liveUrl = cap.url || null;
      pageTitle = cap.title || null;
    } catch {
      sessionConnected = false;
    }
  }

  const started = job.watch_started_at || job.started_at || job.created_at;
  const elapsedMs = started ? Date.now() - new Date(String(started)).getTime() : 0;

  return {
    jobId,
    website: String(job.site_domain ?? 'Website'),
    opportunityId: job.opportunity_id ? String(job.opportunity_id) : null,
    sessionId: sessionId || null,
    status,
    displayStatus: isInterventionStatus(status) ? 'Waiting for User' : status,
    gate,
    reason: copy.reason,
    title: copy.title,
    instruction: copy.instruction,
    cta: copy.cta,
    successToast: copy.successToast,
    pauseReason: job.pause_reason ? String(job.pause_reason) : null,
    currentStep: doneSteps || Number(job.current_step_index ?? 0),
    totalSteps,
    stepLabel: `${Math.max(1, doneSteps || Number(job.current_step_index ?? 0) || 1)} / ${totalSteps}`,
    browser: sessionConnected ? 'Live' : 'Session saved',
    session: sessionConnected ? 'Connected' : 'Restorable',
    elapsedMs,
    screenshot,
    liveUrl,
    pageTitle,
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

export async function captureInterventionView(workspaceId: string, jobId: string) {
  const job = await getJob(workspaceId, jobId);
  if (!job) return null;
  const sessionId = String(job.session_id ?? '');
  if (sessionId) {
    try {
      const runtime = getSessionRuntime(sessionId);
      const cap = await runtime.capture('intervention_live');
      if (cap.screenshotBase64) {
        const uploaded = await uploadLiveScreenshot(workspaceId, jobId, cap.screenshotBase64);
        return {
          ok: true,
          live: true,
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

  const gate = resolveInterventionGate(job) as ExecutionGate | InterventionGate;
  const copy = humanInterventionCopy(resolveInterventionGate(job));
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
