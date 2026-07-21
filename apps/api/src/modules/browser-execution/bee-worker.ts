import { randomUUID } from 'node:crypto';
import {
  analyzeFailureAi,
  classifyExecutionError,
  detectFormIntelligence,
  gateStatusFromBlocker,
  isAutoRetryable,
  isWatchableGate,
  retryBackoffSeconds,
  type ExecutionGate,
} from '@seo-os/backlink-builder';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import {
  disposeSessionRuntime,
  getSessionRuntime,
} from '../browser-execution/browser-runtime.service.js';
import {
  appendLog,
  getOrCreatePolicy,
  recordHistory,
  mergeJobMetrics,
  retryJob,
} from '../browser-execution/bee.service.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';
import { DEFAULT_FEATURE_FLAGS } from '@seo-os/shared';
import {
  loadStorageStateFromSession,
  persistSessionStorageState,
} from './bee-session.js';
import { enqueueGateWatch } from './bee-watchers.js';
import { classifyNavigationFailure, withStageTimeout } from './bee-timeouts.js';

async function updateJob(jobId: string, patch: Record<string, unknown>) {
  await getSupabaseAdmin()
    .from('execution_jobs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', jobId);
}

async function updateStep(jobId: string, stepIndex: number, patch: Record<string, unknown>) {
  await getSupabaseAdmin()
    .from('execution_steps')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('job_id', jobId)
    .eq('step_index', stepIndex);
}

async function storeScreenshot(
  workspaceId: string,
  jobId: string,
  stepId: string | null,
  label: string,
  base64?: string
) {
  if (!base64) return;
  const path = `browser-execution/${workspaceId}/${jobId}/${label}-${Date.now()}.jpg`;
  try {
    const buf = Buffer.from(base64, 'base64');
    const { error } = await getSupabaseAdmin().storage
      .from('browser-execution')
      .upload(path, buf, { contentType: 'image/jpeg', upsert: true });
    if (error) {
      logger.debug({ error }, 'Screenshot upload skipped (bucket may be missing)');
    }
  } catch {
    // storage optional
  }
  await getSupabaseAdmin().from('execution_assets').insert({
    id: randomUUID(),
    workspace_id: workspaceId,
    job_id: jobId,
    step_id: stepId,
    kind: 'screenshot',
    label,
    storage_path: path,
    mime_type: 'image/jpeg',
    meta: { inlinePreview: base64.slice(0, 64) },
  });
}

async function learnSelectors(
  workspaceId: string,
  domain: string,
  fieldKey: string,
  selector: string,
  ok: boolean
) {
  if (!DEFAULT_FEATURE_FLAGS.bee_learning) return;
  const { data: existing } = await getSupabaseAdmin()
    .from('selector_memory')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('site_domain', domain)
    .eq('field_key', fieldKey)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing) {
    await getSupabaseAdmin()
      .from('selector_memory')
      .update({
        selector_css: selector,
        success_count: Number(existing.success_count ?? 0) + (ok ? 1 : 0),
        failure_count: Number(existing.failure_count ?? 0) + (ok ? 0 : 1),
        confidence: Math.min(
          99,
          Math.max(5, Number(existing.confidence ?? 50) + (ok ? 5 : -8))
        ),
        last_verified_at: new Date().toISOString(),
        source: 'learned',
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    await getSupabaseAdmin().from('selector_memory').insert({
      id: randomUUID(),
      workspace_id: workspaceId,
      site_domain: domain,
      field_key: fieldKey,
      selector_css: selector,
      success_count: ok ? 1 : 0,
      failure_count: ok ? 0 : 1,
      confidence: ok ? 55 : 30,
      source: 'learned',
      last_verified_at: new Date().toISOString(),
    });
  }
}

function speedDelayMs(speed: string): number {
  // Minimal pacing only — parallel workers + pool carry throughput
  if (speed === 'slow') return 400;
  if (speed === 'fast') return 0;
  return 50;
}

async function pauseForGate(params: {
  workspaceId: string;
  jobId: string;
  sessionId: string;
  stepIndex: number;
  stepId: string | null;
  gate: NonNullable<ExecutionGate>;
  screenshotBase64?: string;
  htmlSnippet?: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  const { workspaceId, jobId, sessionId, stepIndex, stepId, gate } = params;

  // Preferences: auto-skip optional human gates so the campaign keeps moving
  try {
    const { getOrCreatePolicy } = await import('./bee.service.js');
    const { skipInterventionJob } = await import('./bee-intervention-actions.service.js');
    const policy = await getOrCreatePolicy(workspaceId);
    const shouldSkipLogin =
      gate === 'login' &&
      (policy.auto_skip_login === true ||
        policy.never_ask_login === true ||
        policy.pause_for_login === false);
    const shouldSkipCaptcha =
      gate === 'captcha' &&
      (policy.auto_skip_captcha === true || policy.pause_for_captcha === false);
    const shouldSkipEmail =
      gate === 'email_verify' && policy.pause_for_email_verify === false;
    if (shouldSkipLogin || shouldSkipCaptcha || shouldSkipEmail) {
      await updateStep(jobId, stepIndex, {
        status: 'paused',
        finished_at: new Date().toISOString(),
      });
      await updateJob(jobId, {
        status: 'needs_approval',
        pause_reason: gate,
        current_step_index: stepIndex,
      });
      await skipInterventionJob(workspaceId, jobId, {
        reason: `auto_skip_${gate}`,
      });
      return;
    }
  } catch {
    /* fall through to normal pause */
  }

  const gateStatus = gateStatusFromBlocker(gate) ?? 'needs_approval';
  const stepAction = params.context?.stepAction != null ? String(params.context.stepAction) : null;

  await updateStep(jobId, stepIndex, {
    status: 'paused',
    finished_at: new Date().toISOString(),
  });
  await updateJob(jobId, {
    status: gateStatus,
    pause_reason: gate,
    current_step_index: stepIndex,
  });
  let pageUrl: string | undefined;
  let pageTitle: string | undefined;
  let liveHtml: string | undefined = params.htmlSnippet;
  let shot = params.screenshotBase64;
  let evidence: string[] = Array.isArray(params.context?.evidence)
    ? (params.context!.evidence as string[])
    : [];
  let explanation =
    params.context?.explanation != null ? String(params.context.explanation) : undefined;
  let reasonLabel = params.context?.reason != null ? String(params.context.reason) : undefined;
  try {
    if (sessionId) {
      const runtime = getSessionRuntime(sessionId);
      if (runtime.hasLivePage()) {
        const cap = await runtime.capture(`pause_${gate}`);
        pageUrl = cap.url;
        pageTitle = cap.title;
        liveHtml = liveHtml || cap.htmlSnippet;
        shot = shot || cap.screenshotBase64;
        if (cap.interventionEvidence?.length) evidence = cap.interventionEvidence;
        if (cap.interventionExplanation) explanation = explanation || cap.interventionExplanation;
        if (cap.interventionReason) reasonLabel = reasonLabel || cap.interventionReason;
      }
    }
  } catch {
    /* optional */
  }
  const pausedUrl = String(pageUrl ?? params.context?.url ?? '') || null;
  const { workflowStepLabel } = await import('@seo-os/backlink-builder');
  const currentStepLabel = workflowStepLabel(stepAction, stepIndex);
  const domEvidence = liveHtml
    ? liveHtml
        .replace(/\s+/g, ' ')
        .slice(0, 2_500)
    : null;

  await mergeJobMetrics(workspaceId, jobId, {
    pauseReason: gate,
    pausedAt: new Date().toISOString(),
    lastUrl: pausedUrl,
    pausedUrl,
    pageTitle: pageTitle ?? null,
    currentStepLabel,
    pauseExplanation: explanation ?? reasonLabel ?? null,
    pauseReasonLabel: reasonLabel ?? null,
    loginFormDetected: gate === 'login',
    domEvidence,
    pauseEvidence: evidence,
    pauseContext: {
      ...(params.context ?? {}),
      url: pausedUrl,
      pausedUrl,
      stepAction,
      currentStepLabel,
      explanation,
      reason: reasonLabel,
      evidence,
      pageTitle,
    },
  });
  await appendLog(workspaceId, jobId, 'warn', `Waiting for User — ${reasonLabel || gate}`, {
    nonNegotiable: true,
    displayStatus: 'Waiting for User',
    note: 'Open the exact paused URL to finish this step. AI auto-resumes — never bypassed.',
    pausedUrl,
    currentStepLabel,
    ...params.context,
  });

  if (shot) {
    await storeScreenshot(workspaceId, jobId, stepId, `gate_${gate}`, shot);
  }

  if (sessionId) {
    await persistSessionStorageState(sessionId);
    await getSupabaseAdmin()
      .from('browser_sessions')
      .update({ status: 'paused' })
      .eq('id', sessionId);
  }

  const { data: policyRow } = await getSupabaseAdmin()
    .from('execution_policies')
    .select('auto_resume, watch_interval_ms')
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (isWatchableGate(gate) && policyRow?.auto_resume !== false) {
    await enqueueGateWatch({
      jobId,
      workspaceId,
      sessionId,
      gate,
      intervalMs: Number(policyRow?.watch_interval_ms ?? 2000),
    });
  }

  // Immediately fill free workers with next queued websites
  await enqueueJob(
    QUEUES.LOW,
    'bee_queue',
    { type: 'bee_queue', workspaceId },
    { singletonKey: `bee-queue-drain-${workspaceId}`, startAfter: 0 }
  );
}

export async function runBeeExecutionJob(data: {
  jobId: string;
  workspaceId: string;
  sessionId?: string;
  action?: string;
  restoreStorage?: boolean;
}): Promise<void> {
  const { jobId, workspaceId } = data;
  if (data.action === 'pause') {
    if (data.sessionId) {
      await persistSessionStorageState(data.sessionId);
      await disposeSessionRuntime(data.sessionId);
    }
    return;
  }

  // Delayed smart-retry — startAfter elapsed, now start a fresh session
  if (data.action === 'retry_start') {
    const { startJob } = await import('./bee.service.js');
    await startJob(workspaceId, jobId);
    return;
  }

  const { data: job } = await getSupabaseAdmin()
    .from('execution_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!job) return;
  if (['cancelled', 'completed', 'verified'].includes(String(job.status))) return;

  const sessionId = String(data.sessionId ?? job.session_id ?? '');
  const runtime = getSessionRuntime(sessionId || jobId);
  const plan = (job.plan_snapshot ?? {}) as {
    mapping?: Record<string, unknown>;
    form?: ReturnType<typeof detectFormIntelligence>;
  };
  const policy = (job.policy_snapshot ?? {}) as {
    submission_speed?: string;
    auto_resume?: boolean;
  };
  const delay = speedDelayMs(String(policy.submission_speed ?? 'normal'));

  const { data: steps } = await getSupabaseAdmin()
    .from('execution_steps')
    .select('*')
    .eq('job_id', jobId)
    .order('step_index');

  try {
    await updateJob(jobId, { status: 'launching_browser' });
    const health = await runtime.health();
    await getSupabaseAdmin()
      .from('browser_sessions')
      .update({
        health_status: health.playwrightAvailable ? 'healthy' : 'down',
        last_health_at: new Date().toISOString(),
        last_error: health.playwrightAvailable ? null : health.message,
      })
      .eq('id', sessionId);

    if (!health.playwrightAvailable) {
      await appendLog(
        workspaceId,
        jobId,
        'warn',
        'Playwright unavailable — preparing plan and pausing for user-controlled execution',
        { health }
      );
    } else {
      let alreadyOpen = false;
      try {
        await runtime.capture('resume_ping');
        alreadyOpen = true;
      } catch {
        alreadyOpen = false;
      }

      if (!alreadyOpen) {
        let storageState: unknown | null = null;
        if (data.restoreStorage !== false && sessionId) {
          const { data: sess } = await getSupabaseAdmin()
            .from('browser_sessions')
            .select('storage_state_enc')
            .eq('id', sessionId)
            .maybeSingle();
          if (sess) storageState = await loadStorageStateFromSession(sess);
        }
        await withStageTimeout('launch', () =>
          runtime.launch({
            mode: DEFAULT_FEATURE_FLAGS.bee_headed_debug ? 'headed' : 'headless',
            storageState: storageState ?? undefined,
            timeoutMs: 20_000,
          })
        );
        await appendLog(
          workspaceId,
          jobId,
          'info',
          storageState
            ? 'Launching Browser — restored authenticated session'
            : 'Launching Browser',
          { sessionReuse: Boolean(storageState), pooled: true }
        );
      }

      if (sessionId) {
        await getSupabaseAdmin()
          .from('browser_sessions')
          .update({ status: 'running' })
          .eq('id', sessionId);
      }
    }

    for (const step of steps ?? []) {
      if (['done', 'skipped'].includes(String(step.status))) continue;

      const { data: live } = await getSupabaseAdmin()
        .from('execution_jobs')
        .select('status, approved_at')
        .eq('id', jobId)
        .single();
      if (!live || ['cancelled', 'paused'].includes(String(live.status))) {
        await appendLog(workspaceId, jobId, 'info', 'Execution halted', { status: live?.status });
        return;
      }
      // Do not continue if still blocked/watching (another tick owns resume)
      if (
        String(live.status).startsWith('watching') ||
        String(live.status).startsWith('blocked_')
      ) {
        return;
      }

      const action = String(step.action);
      const blocker = (step.blocker as ExecutionGate) ?? null;
      await updateStep(jobId, step.step_index, {
        status: 'running',
        started_at: new Date().toISOString(),
      });
      await updateJob(jobId, {
        status: statusForAction(action),
        current_step_index: step.step_index,
      });

      // Gate: pause for user — never bypass; start watcher for auto-resume
      if (blocker && blocker !== null) {
        if (blocker === 'human_approval' && live.approved_at) {
          await updateStep(jobId, step.step_index, {
            status: 'done',
            finished_at: new Date().toISOString(),
          });
          continue;
        }
        let shot: string | undefined;
        let htmlSnippet: string | undefined;
        let pauseCtx: Record<string, unknown> = { stepAction: action };
        if (health.playwrightAvailable) {
          try {
            const cap = await runtime.capture(`gate_${blocker}`);
            shot = cap.screenshotBase64;
            htmlSnippet = cap.htmlSnippet;
            pauseCtx = {
              stepAction: action,
              url: cap.url,
              reason: cap.interventionReason,
              explanation: cap.interventionExplanation,
              evidence: cap.interventionEvidence,
            };
            // Never label as login unless a login form was actually detected
            if (blocker === 'login' && !cap.detectedGates.includes('login')) {
              const fallback =
                (cap.detectedGates[0] as NonNullable<ExecutionGate> | undefined) ?? 'manual_input';
              await pauseForGate({
                workspaceId,
                jobId,
                sessionId,
                stepIndex: step.step_index,
                stepId: step.id,
                gate: fallback,
                screenshotBase64: shot,
                htmlSnippet,
                context: {
                  ...pauseCtx,
                  plannedGate: 'login',
                  explanation:
                    cap.interventionExplanation ||
                    'Automation paused — login form was not detected on this page.',
                },
              });
              return;
            }
          } catch {
            // ignore
          }
        }
        await pauseForGate({
          workspaceId,
          jobId,
          sessionId,
          stepIndex: step.step_index,
          stepId: step.id,
          gate: blocker,
          screenshotBase64: shot,
          htmlSnippet,
          context: pauseCtx,
        });
        return;
      }

      const detail = (step.detail ?? {}) as Record<string, unknown>;

      if (health.playwrightAvailable) {
        if (action === 'open' || action === 'navigate') {
          const url = String(detail.url ?? '');
          if (url) {
            await appendLog(workspaceId, jobId, 'info', 'Opening Website', { url });
            const cap = await withStageTimeout(action === 'open' ? 'open' : 'navigate', () =>
              runtime.navigate(url, 20_000)
            );
            await storeScreenshot(
              workspaceId,
              jobId,
              step.id,
              String(detail.label ?? action),
              cap.screenshotBase64
            );
            for (const g of cap.detectedGates) {
              if (
                g === 'captcha' ||
                g === 'mfa' ||
                g === 'email_verify' ||
                g === 'phone_verify' ||
                g === 'login' ||
                g === 'signup' ||
                g === 'category'
              ) {
                await pauseForGate({
                  workspaceId,
                  jobId,
                  sessionId,
                  stepIndex: step.step_index,
                  stepId: step.id,
                  gate: g as NonNullable<ExecutionGate>,
                  screenshotBase64: cap.screenshotBase64,
                  htmlSnippet: cap.htmlSnippet,
                  context: {
                    url: cap.url,
                    during: action,
                    stepAction: action,
                    reason: cap.interventionReason,
                    explanation: cap.interventionExplanation,
                    evidence: cap.interventionEvidence,
                  },
                });
                return;
              }
            }
            if (cap.htmlSnippet) {
              await appendLog(workspaceId, jobId, 'info', 'Finding Form', {});
              const form = await withStageTimeout('find_form', async () =>
                detectFormIntelligence(cap.htmlSnippet!)
              );
              await appendLog(workspaceId, jobId, 'info', 'Detecting Fields', {
                controls: form.controls.length,
                required: form.requiredFields,
              });
              await getSupabaseAdmin()
                .from('execution_profiles')
                .update({
                  form_schema: form,
                  metrics_source: form.metricsSource,
                  updated_at: new Date().toISOString(),
                })
                .eq('workspace_id', workspaceId)
                .eq('site_domain', String(job.site_domain));
            }
          }
        } else if (action === 'screenshot') {
          const cap = await runtime.capture(String(detail.label ?? 'shot'));
          await storeScreenshot(
            workspaceId,
            jobId,
            step.id,
            String(detail.label ?? 'screenshot'),
            cap.screenshotBase64
          );
        } else if (action === 'analyze_form') {
          await appendLog(workspaceId, jobId, 'info', 'Finding Form', {});
          const cap = await withStageTimeout('find_form', () => runtime.capture('analyze'));
          if (cap.htmlSnippet) {
            const form = detectFormIntelligence(cap.htmlSnippet);
            await appendLog(workspaceId, jobId, 'info', 'Detecting Fields', {
              controls: form.controls.length,
              required: form.requiredFields,
            });
          }
        } else if (action === 'fill' || action === 'select') {
          await appendLog(workspaceId, jobId, 'info', 'Filling Company Info', {});
          const result = await withStageTimeout('fill', () =>
            runtime.fillFields(plan.mapping ?? {})
          );
          await appendLog(workspaceId, jobId, 'info', 'Fields mapped', result);
          for (const f of result.filled) {
            await learnSelectors(workspaceId, String(job.site_domain), f, `input[name="${f}"]`, true);
          }
        } else if (
          action === 'upload_logo' ||
          action === 'upload_images' ||
          action === 'upload_videos'
        ) {
          await appendLog(workspaceId, jobId, 'info', 'Uploading Assets', {
            action,
            note: 'File paths resolved from asset library when available',
          });
        } else if (action === 'preview') {
          const cap = await runtime.capture('preview');
          await storeScreenshot(workspaceId, jobId, step.id, 'preview', cap.screenshotBase64);
          await updateJob(jobId, { status: 'ready_for_review' });
        } else if (action === 'submit') {
          if (!job.approved_at && job.mode !== 'automatic_eligible') {
            await updateJob(jobId, { status: 'needs_approval', pause_reason: 'human_approval' });
            await updateStep(jobId, step.step_index, { status: 'paused' });
            await appendLog(workspaceId, jobId, 'warn', 'Submit blocked — approval required');
            return;
          }

          // After gate clearance: revalidate then submit
          const validation = await runtime.revalidateBeforeSubmit(plan.mapping ?? {});
          await appendLog(workspaceId, jobId, 'info', 'Pre-submit revalidation', validation);
          if (!validation.ok) {
            await updateJob(jobId, {
              status: 'needs_approval',
              pause_reason: 'validation_failed',
            });
            await updateStep(jobId, step.step_index, { status: 'paused' });
            await appendLog(
              workspaceId,
              jobId,
              'warn',
              'Validation failed after gate — paused for user correction',
              validation
            );
            return;
          }

          await appendLog(workspaceId, jobId, 'info', 'Submitting', {});
          const result = await withStageTimeout('submit', () => runtime.attemptSubmit());
          await storeScreenshot(
            workspaceId,
            jobId,
            step.id,
            result.submitted ? 'after_submit' : 'submit_blocked',
            result.capture.screenshotBase64
          );
          if (result.submitted) {
            await appendLog(workspaceId, jobId, 'info', 'Submitted', {});
          }
          if (result.gate) {
            await pauseForGate({
              workspaceId,
              jobId,
              sessionId,
              stepIndex: step.step_index,
              stepId: step.id,
              gate: result.gate as NonNullable<ExecutionGate>,
              screenshotBase64: result.capture.screenshotBase64,
              htmlSnippet: result.capture.htmlSnippet,
              context: {
                during: 'submit',
                stepAction: 'submit',
                url: result.capture.url,
                reason: result.capture.interventionReason,
                explanation: result.capture.interventionExplanation,
                evidence: result.capture.interventionEvidence,
              },
            });
            return;
          }
          if (result.validationFailed || !result.submitted) {
            await updateJob(jobId, {
              status: 'failed',
              error_code: 'SUBMIT_FAILED',
              error_message: 'Submit control not completed',
              finished_at: new Date().toISOString(),
            });
            if (job.opportunity_id) {
              await getSupabaseAdmin()
                .from('opportunities')
                .update({ automation_status: 'failed' })
                .eq('id', job.opportunity_id);
            }
            await recordHistory(workspaceId, jobId, 'failed');
            // Failed Queue — never stop the campaign
            await enqueueJob(
              QUEUES.LOW,
              'bee_queue',
              { type: 'bee_queue', workspaceId },
              { singletonKey: `bee-queue-drain-${workspaceId}`, startAfter: 0 }
            );
            return;
          }
          await updateJob(jobId, { status: 'submitted' });
          if (job.opportunity_id) {
            await getSupabaseAdmin()
              .from('opportunities')
              .update({ automation_status: 'submitted' })
              .eq('id', job.opportunity_id);
          }
        } else if (action === 'verify') {
          await appendLog(workspaceId, jobId, 'info', 'Verification Scheduled', {});
          await updateJob(jobId, { status: 'waiting_verification' });
          await enqueueJob(QUEUES.CRAWL, 'backlink_verify', {
            type: 'backlink_reverify_hint',
            workspaceId,
            opportunityId: job.opportunity_id,
            executionJobId: jobId,
          });
          await updateJob(jobId, { status: 'verified' });
        } else if (action === 'login') {
          let gate: NonNullable<ExecutionGate> = 'login';
          let ctx: Record<string, unknown> = {
            message: 'Authenticate in session — never auto-filled',
            stepAction: 'login',
          };
          let shot: string | undefined;
          let htmlSnippet: string | undefined;
          try {
            const cap = await runtime.capture('login_step');
            shot = cap.screenshotBase64;
            htmlSnippet = cap.htmlSnippet;
            ctx = {
              ...ctx,
              url: cap.url,
              reason: cap.interventionReason,
              explanation: cap.interventionExplanation,
              evidence: cap.interventionEvidence,
            };
            if (cap.detectedGates.includes('login')) {
              gate = 'login';
            } else if (cap.detectedGates.includes('signup')) {
              gate = 'signup';
            } else if (cap.detectedGates[0]) {
              gate = cap.detectedGates[0] as NonNullable<ExecutionGate>;
            } else {
              gate = 'manual_input';
              ctx.explanation =
                'Login step reached but no login form was detected on this page.';
              ctx.reason = 'Action Required';
            }
          } catch {
            /* optional */
          }
          await pauseForGate({
            workspaceId,
            jobId,
            sessionId,
            stepIndex: step.step_index,
            stepId: step.id,
            gate,
            screenshotBase64: shot,
            htmlSnippet,
            context: ctx,
          });
          return;
        }
      } else {
        if (
          [
            'open',
            'navigate',
            'analyze_form',
            'fill',
            'select',
            'screenshot',
            'upload_logo',
            'upload_images',
            'upload_videos',
            'preview',
          ].includes(action)
        ) {
          await appendLog(
            workspaceId,
            jobId,
            'info',
            `Prepared step ${action} (runtime deferred)`,
            detail
          );
        } else if (action === 'submit' || action === 'verify') {
          await updateJob(jobId, { status: 'needs_approval' });
          await updateStep(jobId, step.step_index, { status: 'paused' });
          await appendLog(
            workspaceId,
            jobId,
            'warn',
            'Runtime required for submit/verify — install Playwright and Resume after approval'
          );
          return;
        } else if (action === 'login' || action === 'wait_approval') {
          const gate = (blocker as ExecutionGate) ?? 'login';
          if (gate && isWatchableGate(gate)) {
            await pauseForGate({
              workspaceId,
              jobId,
              sessionId,
              stepIndex: step.step_index,
              stepId: step.id,
              gate,
            });
            return;
          }
        }
      }

      await updateStep(jobId, step.step_index, {
        status: 'done',
        finished_at: new Date().toISOString(),
        duration_ms: delay,
      });
      await new Promise((r) => setTimeout(r, delay));
    }

    if (sessionId) {
      await persistSessionStorageState(sessionId);
      await getSupabaseAdmin()
        .from('browser_sessions')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          // keep storage for reuse — do not wipe
        })
        .eq('id', sessionId);
      // Keep runtime disposed but storage in DB for next job on same domain
      await disposeSessionRuntime(sessionId);
    }

    await updateJob(jobId, {
      status: 'completed',
      finished_at: new Date().toISOString(),
    });
    await recordHistory(workspaceId, jobId, 'completed', {
      timing: {
        watchDurationMs: job.watch_duration_ms,
        pauseReason: job.pause_reason,
        resumeReason: job.resume_reason,
        autoResumed: job.auto_resumed,
      },
    });
    await appendLog(workspaceId, jobId, 'info', 'Execution completed');

    if (DEFAULT_FEATURE_FLAGS.bee_learning) {
      await enqueueJob(QUEUES.LOW, 'bee_learning', {
        type: 'bee_learning',
        jobId,
        workspaceId,
      });
    }

    // Queue continuation — fill all free parallel slots
    await enqueueJob(QUEUES.LOW, 'bee_queue', {
      type: 'bee_queue',
      workspaceId,
      afterJobId: jobId,
      batchId: job.queue_batch_id ?? null,
    });

    await enqueueJob(QUEUES.LOW, 'bee_session_health', {
      type: 'bee_session_health',
      workspaceId,
      sessionId,
    });
  } catch (err) {
    logger.error({ err, jobId }, 'BEE execution failed');

    const { data: liveJob } = await getSupabaseAdmin()
      .from('execution_jobs')
      .select('current_step_index, retry_count, metrics, status')
      .eq('id', jobId)
      .maybeSingle();

    const stepAction = String(liveJob?.current_step_index ?? 'unknown');
    const nav = classifyNavigationFailure(err);
    const errCode =
      (err as { failureCode?: string; code?: string } | null)?.failureCode ||
      (err as { code?: string } | null)?.code ||
      nav.code;
    const classified = classifyExecutionError(err, { step: stepAction });
    const failureCode = errCode || classified.failureCode;
    const failLabel =
      nav.message && failureCode !== classified.failureCode
        ? `Temporary Failure — ${nav.message}`
        : classified.label.startsWith('Temporary')
          ? classified.label
          : `Temporary Failure — ${classified.label}`;
    const analysis = analyzeFailureAi({
      failureCode,
      failureMessage: nav.message || classified.failureMessage,
      status: 'failed',
    });

    // Best-effort error screenshot
    try {
      if (sessionId) {
        const runtime = getSessionRuntime(sessionId);
        const cap = await runtime.capture('on_error');
        await storeScreenshot(
          workspaceId,
          jobId,
          null,
          `error_${String(failureCode).toLowerCase()}`,
          cap.screenshotBase64
        );
      }
    } catch {
      /* optional */
    }

    const metricsPatch = {
      failure: {
        failureCode,
        failureMessage: nav.message || classified.failureMessage,
        failureStep: classified.failureStep,
        failureTimestamp: classified.failureTimestamp,
        retryClass: nav.retryable || isAutoRetryable(failureCode) ? 'temporary' : 'unsupported',
        label: failLabel,
        suggestedFix: classified.suggestedFix,
        stack: err instanceof Error ? err.stack?.slice(0, 4000) : null,
        analysis,
      },
    };
    await mergeJobMetrics(workspaceId, jobId, metricsPatch);

    // Browser-missing must park as Waiting Infrastructure — never Failed
    {
      const {
        parkJobWaitingInfrastructure,
        ensureBrowserRuntimeReady,
        friendlyRuntimeError,
        resumeWaitingInfrastructureJobs,
      } = await import('./browser-runtime-manager.service.js');
      const friendly = friendlyRuntimeError(err);
      const rawBlob = `${friendly} ${classified.failureMessage} ${err instanceof Error ? err.message : ''}`;
      const isRuntimeMissing =
        failureCode === 'BROWSER_RUNTIME_MISSING' ||
        /Browser Runtime Missing|executable doesn't exist|could not find browser|playwright.*install chromium/i.test(
          rawBlob
        );
      if (isRuntimeMissing) {
        await parkJobWaitingInfrastructure(workspaceId, jobId, friendly);
        await appendLog(workspaceId, jobId, 'warn', 'Browser Runtime Missing — Waiting Infrastructure', {
          failureCode: 'BROWSER_RUNTIME_MISSING',
          suggestedFix: 'Install Chromium',
        });
        if (sessionId) {
          await disposeSessionRuntime(sessionId).catch(() => undefined);
        }
        const healed = await ensureBrowserRuntimeReady();
        if (healed.ready) {
          await resumeWaitingInfrastructureJobs().catch(() => undefined);
        }
        await enqueueJob(QUEUES.LOW, 'bee_queue', { type: 'bee_queue', workspaceId });
        return;
      }
    }

    await updateJob(jobId, {
      status: 'failed',
      error_code: failureCode,
      error_message: failLabel,
      finished_at: new Date().toISOString(),
    });
    await appendLog(workspaceId, jobId, 'error', failLabel, {
      failureCode,
      failureMessage: nav.message || classified.failureMessage,
      failureStep: classified.failureStep,
      failureTimestamp: classified.failureTimestamp,
      suggestedFix: classified.suggestedFix,
      retryable: nav.retryable,
      analysis,
      stack: err instanceof Error ? err.stack?.slice(0, 2000) : null,
    });
    await recordHistory(workspaceId, jobId, 'failed', {
      errorCode: failureCode,
      timing: { failureTimestamp: classified.failureTimestamp },
    });

    if (sessionId) {
      await persistSessionStorageState(sessionId).catch(() => undefined);
      await disposeSessionRuntime(sessionId);
    }

    // Never stall the queue — fill free workers immediately
    await enqueueJob(QUEUES.LOW, 'bee_queue', {
      type: 'bee_queue',
      workspaceId,
      afterJobId: jobId,
    });

    // Smart auto-retry for temporary / retryable failures (async — does not block queue)
    const retryable = nav.retryable || isAutoRetryable(failureCode);
    if (retryable) {
      const policy = await getOrCreatePolicy(workspaceId);
      const attempt = Number(liveJob?.retry_count ?? 0) + 1;
      const max = Number(policy.retry_count ?? 2);
      const delaySec = retryBackoffSeconds(attempt);
      if (delaySec != null && attempt <= max) {
        await appendLog(
          workspaceId,
          jobId,
          'warn',
          `Auto-retry ${attempt}/${max} in ${delaySec}s — ${failLabel}`,
          { delaySeconds: delaySec, failureCode }
        );
        await retryJob(workspaceId, jobId, { delaySeconds: delaySec }).catch((retryErr) => {
          logger.warn({ retryErr, jobId }, 'Auto-retry schedule failed');
        });
        return;
      }
    }

    // Fail-fast: mark done and continue — do not rethrow (avoids worker stall)
  }
}

function statusForAction(action: string): string {
  const map: Record<string, string> = {
    open: 'navigating',
    navigate: 'navigating',
    login: 'authenticating',
    analyze_form: 'analyzing_form',
    fill: 'filling_fields',
    select: 'filling_fields',
    upload: 'uploading_assets',
    upload_logo: 'uploading_assets',
    upload_images: 'uploading_assets',
    upload_videos: 'uploading_assets',
    preview: 'ready_for_review',
    wait_approval: 'awaiting_user',
    submit: 'submitting',
    verify: 'waiting_verification',
    screenshot: 'navigating',
  };
  return map[action] ?? 'preparing';
}

/** Human-readable pipeline labels for UI (never expose worker jargon). */
export function pipelineLabelForStatus(status: string, pauseReason?: string | null): string {
  if (status.startsWith('watching_captcha') || pauseReason === 'captcha') return 'Waiting CAPTCHA';
  if (status.startsWith('watching_login') || pauseReason === 'login') return 'Waiting Login';
  if (status.includes('mfa') || pauseReason === 'mfa') return 'Waiting MFA';
  if (status.includes('email') || pauseReason === 'email_verify') return 'Waiting Email Verification';
  if (status.includes('phone') || pauseReason === 'phone_verify') return 'Waiting Phone Verification';
  const map: Record<string, string> = {
    queued: 'Queued',
    preparing: 'Preparing',
    launching_browser: 'Launching Browser',
    navigating: 'Opening Website',
    authenticating: 'Authenticating',
    analyzing_form: 'Finding Form',
    filling_fields: 'Filling Company Info',
    uploading_assets: 'Uploading Assets',
    validating: 'Detecting Fields',
    ready_for_review: 'Ready for Review',
    awaiting_user: 'Waiting for User',
    submitting: 'Submitting',
    submitted: 'Submitted',
    waiting_verification: 'Verification Scheduled',
    completed: 'Submitted',
    verified: 'Verified',
    failed: 'Temporary Failure',
    retry_scheduled: 'Retrying',
  };
  return map[status] ?? status.replace(/_/g, ' ');
}
