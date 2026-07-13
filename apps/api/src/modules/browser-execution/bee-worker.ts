import { randomUUID } from 'node:crypto';
import {
  detectFormIntelligence,
  gateStatusFromBlocker,
  type ExecutionGate,
} from '@seo-os/backlink-builder';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import {
  disposeSessionRuntime,
  getSessionRuntime,
} from '../browser-execution/browser-runtime.service.js';
import { appendLog, recordHistory } from '../browser-execution/bee.service.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';
import { DEFAULT_FEATURE_FLAGS } from '@seo-os/shared';

async function updateJob(
  jobId: string,
  patch: Record<string, unknown>
) {
  await getSupabaseAdmin()
    .from('execution_jobs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', jobId);
}

async function updateStep(
  jobId: string,
  stepIndex: number,
  patch: Record<string, unknown>
) {
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
  // Prefer Storage when bucket exists; always persist meta row with inline ref fallback
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
          Math.max(
            5,
            Number(existing.confidence ?? 50) + (ok ? 5 : -8)
          )
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

export async function runBeeExecutionJob(data: {
  jobId: string;
  workspaceId: string;
  sessionId?: string;
  action?: string;
}): Promise<void> {
  const { jobId, workspaceId } = data;
  if (data.action === 'pause') {
    if (data.sessionId) await disposeSessionRuntime(data.sessionId);
    return;
  }

  const { data: job } = await getSupabaseAdmin()
    .from('execution_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!job) return;
  if (['cancelled', 'completed'].includes(String(job.status))) return;

  const sessionId = String(data.sessionId ?? job.session_id ?? '');
  const runtime = getSessionRuntime(sessionId || jobId);
  const plan = (job.plan_snapshot ?? {}) as {
    mapping?: Record<string, unknown>;
    form?: ReturnType<typeof detectFormIntelligence>;
  };
  const policy = (job.policy_snapshot ?? {}) as { submission_speed?: string };
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
      // Controlled prepare/preview path without live browser: advance until first user gate
      await appendLog(
        workspaceId,
        jobId,
        'warn',
        'Playwright unavailable — preparing plan and pausing for user-controlled execution',
        { health }
      );
    } else {
      await runtime.launch({
        mode: DEFAULT_FEATURE_FLAGS.bee_headed_debug ? 'headed' : 'headless',
      });
    }

    for (const step of steps ?? []) {
      if (['done', 'skipped'].includes(String(step.status))) continue;

      // Reload job status for pause/cancel
      const { data: live } = await getSupabaseAdmin()
        .from('execution_jobs')
        .select('status, approved_at')
        .eq('id', jobId)
        .single();
      if (!live || ['cancelled', 'paused'].includes(String(live.status))) {
        await appendLog(workspaceId, jobId, 'info', 'Execution halted', { status: live?.status });
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

      // Gate: pause for user — never bypass
      if (blocker && blocker !== null) {
        if (blocker === 'human_approval' && live.approved_at) {
          await updateStep(jobId, step.step_index, {
            status: 'done',
            finished_at: new Date().toISOString(),
          });
          continue;
        }
        const gateStatus = gateStatusFromBlocker(blocker) ?? 'needs_approval';
        await updateStep(jobId, step.step_index, {
          status: 'paused',
          finished_at: new Date().toISOString(),
        });
        await updateJob(jobId, { status: gateStatus });
        await appendLog(workspaceId, jobId, 'warn', `Paused for ${blocker} — user intervention required`, {
          nonNegotiable: true,
        });
        if (sessionId) {
          await getSupabaseAdmin()
            .from('browser_sessions')
            .update({ status: 'paused' })
            .eq('id', sessionId);
        }
        return;
      }

      const detail = (step.detail ?? {}) as Record<string, unknown>;

      if (health.playwrightAvailable) {
        if (action === 'open' || action === 'navigate') {
          const url = String(detail.url ?? '');
          if (url) {
            const cap = await runtime.navigate(url);
            await storeScreenshot(workspaceId, jobId, step.id, String(detail.label ?? action), cap.screenshotBase64);
            // If unexpected gates appear, pause
            for (const g of cap.detectedGates) {
              if (g === 'captcha' || g === 'mfa' || g === 'email_verify' || g === 'phone_verify') {
                await updateJob(jobId, { status: gateStatusFromBlocker(g) ?? 'paused' });
                await updateStep(jobId, step.step_index, { status: 'paused' });
                await appendLog(workspaceId, jobId, 'warn', `Detected ${g} during navigation — paused`, {
                  url: cap.url,
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
        } else if (action === 'upload_logo' || action === 'upload_images' || action === 'upload_videos') {
          await appendLog(workspaceId, jobId, 'info', `${action} — asset injection queued for mapped files`, {
            note: 'File paths resolved from asset library when available',
          });
        } else if (action === 'preview') {
          const cap = await runtime.capture('preview');
          await storeScreenshot(workspaceId, jobId, step.id, 'preview', cap.screenshotBase64);
          await updateJob(jobId, { status: 'ready_for_review' });
        } else if (action === 'submit') {
          if (!job.approved_at && job.mode !== 'automatic_eligible') {
            await updateJob(jobId, { status: 'needs_approval' });
            await updateStep(jobId, step.step_index, { status: 'paused' });
            await appendLog(workspaceId, jobId, 'warn', 'Submit blocked — approval required');
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
            await updateJob(jobId, { status: gateStatusFromBlocker(result.gate) ?? 'paused' });
            await updateStep(jobId, step.step_index, { status: 'paused' });
            await appendLog(workspaceId, jobId, 'warn', `Submit paused — ${result.gate}`, {
              nonNegotiable: true,
            });
            return;
          }
          if (!result.submitted) {
            await updateJob(jobId, {
              status: 'failed',
              error_code: 'SUBMIT_FAILED',
              error_message: 'Submit control not completed',
              finished_at: new Date().toISOString(),
            });
            await recordHistory(workspaceId, jobId, 'failed');
            return;
          }
          // Dual-write tracking
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
        } else if (action === 'login') {
          // Login never auto-fills passwords from logs — pause for user/session
          await updateJob(jobId, { status: 'needs_approval' });
          await updateStep(jobId, step.step_index, { status: 'paused' });
          await appendLog(workspaceId, jobId, 'warn', 'Login required — authenticate in session then Resume', {
            nonNegotiable: true,
          });
          return;
        }
      } else {
        // No playwright: mark analytical steps done until a gate
        if (['open', 'navigate', 'analyze_form', 'fill', 'select', 'screenshot', 'upload_logo', 'upload_images', 'upload_videos', 'preview'].includes(action)) {
          await appendLog(workspaceId, jobId, 'info', `Prepared step ${action} (runtime deferred)`, detail);
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
        }
      }

      await updateStep(jobId, step.step_index, {
        status: 'done',
        finished_at: new Date().toISOString(),
        duration_ms: delay,
      });
      await new Promise((r) => setTimeout(r, delay));
    }

    await updateJob(jobId, {
      status: 'completed',
      finished_at: new Date().toISOString(),
    });
    if (sessionId) {
      await getSupabaseAdmin()
        .from('browser_sessions')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', sessionId);
      await disposeSessionRuntime(sessionId);
    }
    await recordHistory(workspaceId, jobId, 'completed');
    await appendLog(workspaceId, jobId, 'info', 'Execution completed');

    // Learning worker enqueue
    if (DEFAULT_FEATURE_FLAGS.bee_learning) {
      await enqueueJob(QUEUES.LOW, 'bee_learning', {
        type: 'bee_learning',
        jobId,
        workspaceId,
      });
    }
  } catch (err) {
    logger.error({ err, jobId }, 'BEE execution failed');
    await updateJob(jobId, {
      status: 'failed',
      error_code: 'EXECUTION_ERROR',
      error_message: err instanceof Error ? err.message : 'Unknown error',
      finished_at: new Date().toISOString(),
    });
    await appendLog(workspaceId, jobId, 'error', 'Execution failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    await recordHistory(workspaceId, jobId, 'failed');
    if (sessionId) await disposeSessionRuntime(sessionId);
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
