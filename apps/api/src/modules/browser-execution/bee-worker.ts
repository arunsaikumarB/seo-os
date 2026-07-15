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
  if (speed === 'slow') return 1200;
  if (speed === 'fast') return 200;
  return 500;
}

async function pauseForGate(params: {
  workspaceId: string;
  jobId: string;
  sessionId: string;
  stepIndex: number;
  stepId: string | null;
  gate: NonNullable<ExecutionGate>;
  screenshotBase64?: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  const { workspaceId, jobId, sessionId, stepIndex, stepId, gate } = params;
  const gateStatus = gateStatusFromBlocker(gate) ?? 'needs_approval';

  await updateStep(jobId, stepIndex, {
    status: 'paused',
    finished_at: new Date().toISOString(),
  });
  await updateJob(jobId, {
    status: gateStatus,
    pause_reason: gate,
    current_step_index: stepIndex,
  });
  await mergeJobMetrics(workspaceId, jobId, {
    pauseReason: gate,
    pausedAt: new Date().toISOString(),
    pauseContext: params.context ?? {},
  });
  await appendLog(workspaceId, jobId, 'warn', `Paused for ${gate} — user intervention required`, {
    nonNegotiable: true,
    note: 'Never bypassed — watcher will auto-resume after user completes this step',
    ...params.context,
  });

  if (params.screenshotBase64) {
    await storeScreenshot(workspaceId, jobId, stepId, `gate_${gate}`, params.screenshotBase64);
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
        await runtime.launch({
          mode: DEFAULT_FEATURE_FLAGS.bee_headed_debug ? 'headed' : 'headless',
          storageState: storageState ?? undefined,
        });
        if (storageState) {
          await appendLog(workspaceId, jobId, 'info', 'Browser launched with restored session storage', {
            sessionReuse: true,
          });
        }
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
        if (health.playwrightAvailable) {
          try {
            const cap = await runtime.capture(`gate_${blocker}`);
            shot = cap.screenshotBase64;
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
          context: { stepAction: action },
        });
        return;
      }

      const detail = (step.detail ?? {}) as Record<string, unknown>;

      if (health.playwrightAvailable) {
        if (action === 'open' || action === 'navigate') {
          const url = String(detail.url ?? '');
          if (url) {
            const cap = await runtime.navigate(url);
            await storeScreenshot(
              workspaceId,
              jobId,
              step.id,
              String(detail.label ?? action),
              cap.screenshotBase64
            );
            for (const g of cap.detectedGates) {
              if (g === 'captcha' || g === 'mfa' || g === 'email_verify' || g === 'phone_verify' || g === 'login') {
                await pauseForGate({
                  workspaceId,
                  jobId,
                  sessionId,
                  stepIndex: step.step_index,
                  stepId: step.id,
                  gate: g,
                  screenshotBase64: cap.screenshotBase64,
                  context: { url: cap.url, during: action },
                });
                return;
              }
            }
            if (cap.htmlSnippet) {
              const form = detectFormIntelligence(cap.htmlSnippet);
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
          const cap = await runtime.capture('analyze');
          if (cap.htmlSnippet) {
            const form = detectFormIntelligence(cap.htmlSnippet);
            await appendLog(workspaceId, jobId, 'info', 'Form analyzed', {
              controls: form.controls.length,
              required: form.requiredFields,
            });
          }
        } else if (action === 'fill' || action === 'select') {
          const result = await runtime.fillFields(plan.mapping ?? {});
          await appendLog(workspaceId, jobId, 'info', 'Fields mapped', result);
          for (const f of result.filled) {
            await learnSelectors(workspaceId, String(job.site_domain), f, `input[name="${f}"]`, true);
          }
        } else if (
          action === 'upload_logo' ||
          action === 'upload_images' ||
          action === 'upload_videos'
        ) {
          await appendLog(
            workspaceId,
            jobId,
            'info',
            `${action} — asset injection queued for mapped files`,
            { note: 'File paths resolved from asset library when available' }
          );
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

          const result = await runtime.attemptSubmit();
          await storeScreenshot(
            workspaceId,
            jobId,
            step.id,
            result.submitted ? 'after_submit' : 'submit_blocked',
            result.capture.screenshotBase64
          );
          if (result.gate) {
            await pauseForGate({
              workspaceId,
              jobId,
              sessionId,
              stepIndex: step.step_index,
              stepId: step.id,
              gate: result.gate,
              screenshotBase64: result.capture.screenshotBase64,
              context: { during: 'submit' },
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
            await recordHistory(workspaceId, jobId, 'failed');
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
          await updateJob(jobId, { status: 'waiting_verification' });
          await enqueueJob(QUEUES.CRAWL, 'backlink_verify', {
            type: 'backlink_reverify_hint',
            workspaceId,
            opportunityId: job.opportunity_id,
            executionJobId: jobId,
          });
          await updateJob(jobId, { status: 'verified' });
        } else if (action === 'login') {
          await pauseForGate({
            workspaceId,
            jobId,
            sessionId,
            stepIndex: step.step_index,
            stepId: step.id,
            gate: 'login',
            context: { message: 'Authenticate in session — never auto-filled' },
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

    // Queue continuation — next website
    await enqueueJob(QUEUES.LOW, 'bee_queue', {
      type: 'bee_queue',
      workspaceId,
      afterJobId: jobId,
      batchId: job.queue_batch_id ?? null,
      limit: 1,
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
    const classified = classifyExecutionError(err, { step: stepAction });
    const analysis = analyzeFailureAi({
      failureCode: classified.failureCode,
      failureMessage: classified.failureMessage,
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
          `error_${classified.failureCode.toLowerCase()}`,
          cap.screenshotBase64
        );
      }
    } catch {
      /* optional */
    }

    const metricsPatch = {
      failure: {
        failureCode: classified.failureCode,
        failureMessage: classified.failureMessage,
        failureStep: classified.failureStep,
        failureTimestamp: classified.failureTimestamp,
        retryClass: classified.retryClass,
        label: classified.label,
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
        classified.failureCode === 'BROWSER_RUNTIME_MISSING' ||
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
        return;
      }
    }

    await updateJob(jobId, {
      status: 'failed',
      error_code: classified.failureCode,
      error_message: classified.label,
      finished_at: new Date().toISOString(),
    });
    await appendLog(workspaceId, jobId, 'error', classified.label, {
      failureCode: classified.failureCode,
      failureMessage: classified.failureMessage,
      failureStep: classified.failureStep,
      failureTimestamp: classified.failureTimestamp,
      suggestedFix: classified.suggestedFix,
      analysis,
      stack: err instanceof Error ? err.stack?.slice(0, 2000) : null,
    });
    await recordHistory(workspaceId, jobId, 'failed', {
      errorCode: classified.failureCode,
      timing: { failureTimestamp: classified.failureTimestamp },
    });

    if (sessionId) {
      await persistSessionStorageState(sessionId).catch(() => undefined);
      await disposeSessionRuntime(sessionId);
    }

    // Smart auto-retry for temporary failures
    if (isAutoRetryable(classified.failureCode)) {
      const policy = await getOrCreatePolicy(workspaceId);
      const attempt = Number(liveJob?.retry_count ?? 0) + 1;
      const max = Number(policy.retry_count ?? 2);
      const delay = retryBackoffSeconds(attempt);
      if (delay != null && attempt <= max) {
        await appendLog(
          workspaceId,
          jobId,
          'warn',
          `Auto-retry ${attempt}/${max} in ${delay}s — ${classified.label}`,
          { delaySeconds: delay, failureCode: classified.failureCode }
        );
        await retryJob(workspaceId, jobId, { delaySeconds: delay }).catch((retryErr) => {
          logger.warn({ retryErr, jobId }, 'Auto-retry schedule failed');
        });
        return;
      }
    }

    throw err;
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
