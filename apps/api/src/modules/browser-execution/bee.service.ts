import { randomUUID } from 'node:crypto';
import {
  buildExecutionPlan,
  detectFormIntelligence,
  mapAssetsToFields,
  redactFormValues,
  gateStatusFromBlocker,
  type AssetMapping,
  type ExecutionGate,
  type ExecutionPlanStep,
} from '@seo-os/backlink-builder';
import { DEFAULT_FEATURE_FLAGS } from '@seo-os/shared';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';
import {
  listApprovedOpportunities,
  type OpportunityReadiness,
} from '../campaigns/approved-opportunities.service.js';
import { getBrandContextForBee } from './bee-assets.js';

export type ExecutionReadiness = OpportunityReadiness;

function beeEnabled(): boolean {
  return DEFAULT_FEATURE_FLAGS.bee_enabled !== false;
}

async function appendLog(
  workspaceId: string,
  jobId: string,
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  data: Record<string, unknown> = {},
  stepId?: string
) {
  await getSupabaseAdmin().from('execution_logs').insert({
    id: randomUUID(),
    workspace_id: workspaceId,
    job_id: jobId,
    step_id: stepId ?? null,
    level,
    message,
    data: redactFormValues(data),
  });
}

export async function getOrCreatePolicy(workspaceId: string) {
  const { data: existing } = await getSupabaseAdmin()
    .from('execution_policies')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) return existing;

  const row = {
    id: randomUUID(),
    workspace_id: workspaceId,
    submission_policy: 'always_ask',
    require_approval_before_submit: true,
    max_parallel_sessions: 4,
    submission_speed: 'fast',
    daily_goal: 20,
    auto_resume: true,
    watch_interval_ms: 1000,
    max_watch_ms: 1_800_000,
    session_reuse: true,
    queue_auto_continue: true,
  };
  const { data, error } = await getSupabaseAdmin()
    .from('execution_policies')
    .insert(row)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updatePolicy(workspaceId: string, patch: Record<string, unknown>) {
  await getOrCreatePolicy(workspaceId);
  const allowed = [
    'submission_policy',
    'trusted_domains',
    'daily_goal',
    'max_submissions_per_day',
    'max_parallel_sessions',
    'submission_speed',
    'working_hours',
    'retry_count',
    'cooldown_seconds',
    'require_approval_before_submit',
    'compliance_level',
    'approval_rules',
    'compliance_rules',
    'auto_resume',
    'watch_interval_ms',
    'max_watch_ms',
    'session_reuse',
    'queue_auto_continue',
    'pause_for_login',
    'pause_for_captcha',
    'pause_for_email_verify',
    'auto_skip_login',
    'auto_skip_captcha',
    'never_ask_login',
  ];
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) {
    if (patch[k] !== undefined) update[k] = patch[k];
  }
  const { data, error } = await getSupabaseAdmin()
    .from('execution_policies')
    .update(update)
    .eq('workspace_id', workspaceId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function upsertExecutionProfile(
  workspaceId: string,
  domain: string,
  form: ReturnType<typeof detectFormIntelligence>,
  urls: { loginUrl?: string; submissionUrl?: string }
) {
  const { data: existing } = await getSupabaseAdmin()
    .from('execution_profiles')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('site_domain', domain)
    .is('deleted_at', null)
    .maybeSingle();

  const payload = {
    workspace_id: workspaceId,
    site_domain: domain,
    login_url: urls.loginUrl ?? null,
    submission_url: urls.submissionUrl ?? null,
    form_schema: form,
    rich_editor: form.hasRichEditor ? 'detected' : null,
    upload_strategy: {
      images: form.hasImageUpload,
      videos: form.hasVideoUpload,
      files: form.hasFileUpload,
    },
    metrics_source: form.metricsSource,
    updated_at: new Date().toISOString(),
    last_execution_at: new Date().toISOString(),
  };

  if (existing) {
    await getSupabaseAdmin().from('execution_profiles').update(payload).eq('id', existing.id);
    return existing.id as string;
  }
  const id = randomUUID();
  await getSupabaseAdmin()
    .from('execution_profiles')
    .insert({ id, ...payload });
  return id;
}

export async function createExecution(params: {
  workspaceId: string;
  opportunityId: string;
  mode?: 'prepare' | 'preview' | 'manual' | 'automatic_eligible';
  userId?: string;
  htmlSnippet?: string;
  mappingOverrides?: Record<string, unknown>;
}) {
  if (!beeEnabled()) {
    throw Object.assign(new Error('Browser Execution Engine is disabled'), { status: 403 });
  }

  const { data: opp } = await getSupabaseAdmin()
    .from('opportunities')
    .select('*')
    .eq('id', params.opportunityId)
    .eq('workspace_id', params.workspaceId)
    .single();
  if (!opp) throw Object.assign(new Error('Opportunity not found'), { status: 404 });

  const policy = await getOrCreatePolicy(params.workspaceId);
  const domain = String(opp.domain ?? 'unknown');
  const url = String(opp.url ?? `https://${domain}`);

  // Global Ignore List — never enqueue ignored domains
  const { isDomainGloballyIgnored } = await import('./bee-ignore.service.js');
  if (await isDomainGloballyIgnored(params.workspaceId, domain)) {
    throw Object.assign(
      new Error(`Domain ${domain} is on the Global Ignore List`),
      { status: 409, code: 'GLOBALLY_IGNORED' }
    );
  }

  let html = params.htmlSnippet;
  if (!html) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(12_000),
        headers: { 'User-Agent': 'SEO-OS-BEE/1.0' },
      });
      if (res.ok) html = (await res.text()).slice(0, 100_000);
    } catch {
      // estimated plan without live HTML
    }
  }

  const form = detectFormIntelligence(html);
  const profileId = await upsertExecutionProfile(params.workspaceId, domain, form, {
    loginUrl: form.gates.login ? url : undefined,
    submissionUrl: url,
  });

  // Merge into requirement library shape via submission_requirements if opportunity-linked
  await getSupabaseAdmin().from('submission_requirements').upsert(
    {
      workspace_id: params.workspaceId,
      opportunity_id: params.opportunityId,
      detected_fields: { controls: form.controls, profileId },
      required_fields: form.requiredFields,
      login_required: form.gates.login,
      captcha_required: form.gates.captcha,
      email_verify_required: form.gates.emailVerify,
      metrics_source: form.metricsSource,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'opportunity_id' }
  );

  const requireApproval =
    policy.require_approval_before_submit !== false ||
    policy.submission_policy === 'always_ask' ||
    params.mode !== 'automatic_eligible';

  if (params.mode === 'automatic_eligible') {
    if (!DEFAULT_FEATURE_FLAGS.bee_automatic_submit) {
      throw Object.assign(new Error('Automatic submit flag is off'), { status: 403 });
    }
    if (policy.submission_policy !== 'automatic_eligible') {
      throw Object.assign(new Error('Workspace policy does not allow automatic submit'), {
        status: 403,
      });
    }
    if (form.gates.captcha || form.gates.mfa || form.gates.emailVerify || form.gates.phoneVerify) {
      throw Object.assign(
        new Error('Automatic submit blocked — protected gate detected (CAPTCHA/MFA/verify)'),
        { status: 403 }
      );
    }
  }

  const planSteps = buildExecutionPlan({
    url,
    opportunityType: String(opp.opportunity_type ?? 'directory'),
    form,
    profile: { loginUrl: form.gates.login ? url : null, submissionUrl: url },
    requireApproval,
  });

  const brand = await getBrandContextForBee(params.workspaceId);
  const assets: AssetMapping = {
    businessName: brand.brandName,
    company: brand.brandName,
    description: `${brand.brandName} — ${brand.industry ?? 'services'}`,
    landingPage: brand.projectDomain ? `https://${brand.projectDomain}` : undefined,
    email: undefined,
    keywords: [],
  };
  const mapping = mapAssetsToFields(assets, form.controls, params.mappingOverrides ?? {});

  const jobId = randomUUID();
  const { data: job, error } = await getSupabaseAdmin()
    .from('execution_jobs')
    .insert({
      id: jobId,
      workspace_id: params.workspaceId,
      opportunity_id: params.opportunityId,
      mode: params.mode ?? 'prepare',
      status: 'queued',
      site_domain: domain,
      plan_snapshot: { steps: planSteps, form, profileId, mapping },
      policy_snapshot: policy,
      mapping_overrides: params.mappingOverrides ?? {},
      created_by: params.userId ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;

  const stepRows = planSteps.map((s: ExecutionPlanStep) => ({
    id: randomUUID(),
    job_id: jobId,
    workspace_id: params.workspaceId,
    step_index: s.stepIndex,
    action: s.action,
    detail: s.detail,
    selector_hint: s.selectorHint ?? null,
    status: 'pending',
    requires_user: s.requiresUser,
    blocker: s.blocker ?? null,
  }));
  await getSupabaseAdmin().from('execution_steps').insert(stepRows);

  await appendLog(params.workspaceId, jobId, 'info', 'Execution job created', {
    mode: params.mode ?? 'prepare',
    steps: planSteps.length,
    gates: form.gates,
  });

  // Compatibility: mirror lightweight plan for V1.1 Browser Assistant consumers
  const legacyPlanId = randomUUID();
  await getSupabaseAdmin().from('browser_action_plans').insert({
    id: legacyPlanId,
    workspace_id: params.workspaceId,
    opportunity_id: params.opportunityId,
    plan_steps: planSteps,
    blockers: Object.entries(form.gates)
      .filter(([, v]) => v)
      .map(([type]) => ({ type, message: `${type} requires user intervention` })),
    detected_form: form,
    status: 'ready',
    mode: 'action_plan',
    metrics_source: form.metricsSource,
  });
  await getSupabaseAdmin()
    .from('execution_jobs')
    .update({ legacy_plan_id: legacyPlanId })
    .eq('id', jobId);

  return { ...job, planSteps, form, mapping };
}

export async function listJobs(workspaceId: string, status?: string) {
  let q = getSupabaseAdmin()
    .from('execution_jobs')
    .select('*, opportunities:opportunity_id(id, title, domain, opportunity_type)')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (status) q = q.eq('status', status);
  const { data } = await q;
  return data ?? [];
}

/**
 * Approved / campaign-ready opportunities for the Execution Center picker.
 * Delegates to the shared loader used by Content Studio and other workflows.
 */
export async function listExecutionReadyOpportunities(workspaceId: string) {
  return listApprovedOpportunities(workspaceId);
}

export async function startExecutionsForOpportunities(params: {
  workspaceId: string;
  opportunityIds: string[];
  userId?: string;
  mode?: 'prepare' | 'preview' | 'manual' | 'automatic_eligible';
  startImmediately?: boolean;
}) {
  const results: Array<{
    opportunityId: string;
    jobId: string;
    status: string;
    siteDomain?: string | null;
  }> = [];
  const errors: Array<{ opportunityId: string; message: string }> = [];

  for (const opportunityId of params.opportunityIds) {
    try {
      const job = await createExecution({
        workspaceId: params.workspaceId,
        opportunityId,
        mode: params.mode ?? 'prepare',
        userId: params.userId,
      });
      let status = String(job.status);
      let jobId = String(job.id);
      if (params.startImmediately !== false) {
        const started = await startJob(params.workspaceId, jobId, params.userId);
        status = String(started?.status ?? 'preparing');
      }
      results.push({
        opportunityId,
        jobId,
        status,
        siteDomain: (job.site_domain as string | null) ?? null,
      });
    } catch (err) {
      errors.push({
        opportunityId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (errors.length && results.length === 0) {
    throw Object.assign(
      new Error(`All executions failed: ${errors.map((e) => e.message).join('; ')}`),
      { status: 500, errors }
    );
  }

  return { results, errors };
}

export async function getJob(workspaceId: string, jobId: string) {
  const { data: job } = await getSupabaseAdmin()
    .from('execution_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!job) return null;
  const { data: steps } = await getSupabaseAdmin()
    .from('execution_steps')
    .select('*')
    .eq('job_id', jobId)
    .order('step_index');
  return { ...job, steps: steps ?? [] };
}

export async function updateJobSteps(
  workspaceId: string,
  jobId: string,
  steps: Array<{ stepIndex: number; detail?: Record<string, unknown>; action?: string }>
) {
  const job = await getJob(workspaceId, jobId);
  if (!job) throw Object.assign(new Error('Job not found'), { status: 404 });
  if (!['queued', 'paused', 'needs_approval', 'ready_for_review'].includes(String(job.status))) {
    throw Object.assign(new Error('Plan editable only before active run or while paused'), {
      status: 400,
    });
  }
  for (const s of steps) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (s.detail) patch.detail = s.detail;
    if (s.action) patch.action = s.action;
    await getSupabaseAdmin()
      .from('execution_steps')
      .update(patch)
      .eq('job_id', jobId)
      .eq('step_index', s.stepIndex);
  }
  return getJob(workspaceId, jobId);
}

export async function startJob(workspaceId: string, jobId: string, userId?: string) {
  const job = await getJob(workspaceId, jobId);
  if (!job) throw Object.assign(new Error('Job not found'), { status: 404 });

  // Browser runtime guard — never start without healthy Chromium
  const {
    ensureBrowserRuntimeReady,
    parkJobWaitingInfrastructure,
  } = await import('./browser-runtime-manager.service.js');
  const runtime = await ensureBrowserRuntimeReady();
  if (!runtime.ready) {
    const msg =
      runtime.message ||
      'Browser Runtime Missing — Install Required. Administrator Action Required. Suggested Fix: Install Chromium.';
    await parkJobWaitingInfrastructure(workspaceId, jobId, msg);
    throw Object.assign(new Error(msg), {
      status: 503,
      code: 'BROWSER_RUNTIME_MISSING',
    });
  }

  // Readiness gate — prevent silent start failures
  const { validateExecutionReadiness } = await import('./bee-diagnostics.service.js');
  const readiness = await validateExecutionReadiness(
    workspaceId,
    job.opportunity_id ? String(job.opportunity_id) : undefined
  );
  const hardFails = readiness.checks.filter(
    (c) =>
      !c.ok &&
      ['playwright', 'worker', 'browser', 'browser_runtime', 'queue', 'opportunity', 'domain'].includes(
        c.key
      )
  );
  if (hardFails.length) {
    const runtimeFail = hardFails.some((c) =>
      ['playwright', 'browser', 'browser_runtime'].includes(c.key)
    );
    const msg = hardFails.map((c) => `${c.key}: ${c.message}`).join('; ');
    await appendLog(workspaceId, jobId, 'error', 'Readiness validation failed', {
      checks: readiness.checks,
    });
    if (runtimeFail) {
      await parkJobWaitingInfrastructure(
        workspaceId,
        jobId,
        'Browser Runtime Missing — Install Required'
      );
      throw Object.assign(
        new Error('Browser Runtime Missing — Install Required. Suggested Fix: Install Chromium.'),
        { status: 503, code: 'BROWSER_RUNTIME_MISSING' }
      );
    }
    throw Object.assign(new Error(`Cannot start execution — ${msg}`), { status: 400 });
  }

  const policy = await getOrCreatePolicy(workspaceId);
  const { count } = await getSupabaseAdmin()
    .from('browser_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'running')
    .is('deleted_at', null);
  if ((count ?? 0) >= Number(policy.max_parallel_sessions ?? 4)) {
    throw Object.assign(new Error('Max parallel browser sessions reached'), { status: 429 });
  }

  const headed = DEFAULT_FEATURE_FLAGS.bee_headed_debug === true;
  let sessionId = randomUUID();
  let reusedStorage: unknown | null = null;
  let reusedFrom: string | null = null;

  if (policy.session_reuse !== false && job.site_domain) {
    const { findReusableSession, loadStorageStateFromSession } = await import('./bee-session.js');
    const reusable = await findReusableSession(workspaceId, String(job.site_domain));
    if (reusable?.storage_state_enc) {
      reusedStorage = await loadStorageStateFromSession(reusable);
      if (reusedStorage) {
        reusedFrom = String(reusable.id);
        await appendLog(workspaceId, jobId, 'info', 'Reusing encrypted session storage for domain', {
          priorSessionId: reusedFrom,
          siteDomain: job.site_domain,
        });
      }
    }
  }

  await getSupabaseAdmin().from('browser_sessions').insert({
    id: sessionId,
    workspace_id: workspaceId,
    profile_key: 'default',
    mode: headed ? 'headed' : 'headless',
    status: 'running',
    site_domain: job.site_domain,
    health_status: 'unknown',
    storage_state_enc: reusedStorage
      ? (
          await import('@seo-os/integrations').then((m) =>
            m.encryptJson(reusedStorage as Record<string, unknown>)
          )
        )
      : null,
    created_by: userId ?? null,
    last_reuse_at: reusedFrom ? new Date().toISOString() : null,
  });

  // Stash storage on job metrics for worker launch
  const metrics = {
    ...((job.metrics as Record<string, unknown>) ?? {}),
    reuseStorage: Boolean(reusedStorage),
    reusedFromSessionId: reusedFrom,
  };

  await getSupabaseAdmin()
    .from('execution_jobs')
    .update({
      status: 'preparing',
      session_id: sessionId,
      started_at: job.started_at ?? new Date().toISOString(),
      metrics,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  await appendLog(workspaceId, jobId, 'info', 'Execution start queued', { sessionId, reusedFrom });

  await enqueueJob(
    QUEUES.PLAYWRIGHT,
    'bee_execute',
    {
      type: 'bee_execute',
      jobId,
      workspaceId,
      sessionId,
      action: 'run',
      restoreStorage: Boolean(reusedStorage),
    },
    { singletonKey: `bee-exec-${jobId}`, retryLimit: Number(policy.retry_count ?? 2) }
  );

  // Compatibility assist session
  if (job.legacy_plan_id) {
    await getSupabaseAdmin().from('browser_assist_sessions').insert({
      id: randomUUID(),
      workspace_id: workspaceId,
      opportunity_id: job.opportunity_id,
      plan_id: job.legacy_plan_id,
      status: 'running',
      execution_job_id: jobId,
    });
  }

  return getJob(workspaceId, jobId);
}

export async function setJobStatus(
  workspaceId: string,
  jobId: string,
  status: string,
  extra: Record<string, unknown> = {}
) {
  await getSupabaseAdmin()
    .from('execution_jobs')
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq('id', jobId)
    .eq('workspace_id', workspaceId);
}

export async function pauseJob(workspaceId: string, jobId: string) {
  await setJobStatus(workspaceId, jobId, 'paused');
  await appendLog(workspaceId, jobId, 'info', 'Execution paused by user');
  await enqueueJob(QUEUES.PLAYWRIGHT, 'bee_execute', {
    type: 'bee_execute',
    jobId,
    workspaceId,
    action: 'pause',
  });
  return getJob(workspaceId, jobId);
}

export async function resumeJob(
  workspaceId: string,
  jobId: string,
  opts: { resumeReason?: string; auto?: boolean } = {}
) {
  const job = await getJob(workspaceId, jobId);
  if (!job) throw Object.assign(new Error('Job not found'), { status: 404 });

  // Manual resume after user completed a gate: clear paused watchable gate steps
  // (human_approval still requires approveJob)
  if (!opts.auto) {
    await getSupabaseAdmin()
      .from('execution_steps')
      .update({ status: 'done', finished_at: new Date().toISOString() })
      .eq('job_id', jobId)
      .in('blocker', ['captcha', 'login', 'mfa', 'email_verify', 'phone_verify'])
      .in('status', ['paused', 'running']);
  }

  await setJobStatus(workspaceId, jobId, 'preparing', {
    resume_reason: opts.resumeReason ?? (opts.auto ? 'auto_resume' : 'manual_resume'),
    auto_resumed: opts.auto === true,
  });
  await appendLog(workspaceId, jobId, 'info', opts.auto ? 'Auto-resume queued' : 'Execution resume queued', {
    resumeReason: opts.resumeReason,
    auto: Boolean(opts.auto),
  });
  await enqueueJob(
    QUEUES.PLAYWRIGHT,
    'bee_execute',
    {
      type: 'bee_execute',
      jobId,
      workspaceId,
      sessionId: job.session_id,
      action: 'run',
      restoreStorage: true,
    },
    { singletonKey: `bee-exec-${jobId}` }
  );
  return getJob(workspaceId, jobId);
}

export async function autoResumeJob(
  workspaceId: string,
  jobId: string,
  opts: { resumeReason?: string; gate?: ExecutionGate | string | null } = {}
) {
  await markGateStepDone(workspaceId, jobId, opts.gate ?? null);
  return resumeJob(workspaceId, jobId, {
    resumeReason: opts.resumeReason ?? `auto_after_${opts.gate ?? 'gate'}`,
    auto: true,
  });
}

export async function markGateStepDone(
  workspaceId: string,
  jobId: string,
  gate: ExecutionGate | string | null | undefined
) {
  if (!gate) return;
  await getSupabaseAdmin()
    .from('execution_steps')
    .update({ status: 'done', finished_at: new Date().toISOString() })
    .eq('job_id', jobId)
    .eq('workspace_id', workspaceId)
    .eq('blocker', gate)
    .in('status', ['paused', 'pending', 'running']);
}

export async function mergeJobMetrics(
  workspaceId: string,
  jobId: string,
  patch: Record<string, unknown>
) {
  const job = await getJob(workspaceId, jobId);
  const metrics = { ...((job?.metrics as Record<string, unknown>) ?? {}), ...patch };
  await getSupabaseAdmin()
    .from('execution_jobs')
    .update({ metrics, updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('workspace_id', workspaceId);
  return metrics;
}

/**
 * After one website finishes, start the next queued job (supports 20/50/100/500 queues).
 */
export async function continueQueuedJobs(
  workspaceId: string,
  opts: { afterJobId?: string; batchId?: string; limit?: number } = {}
): Promise<string[]> {
  const policy = await getOrCreatePolicy(workspaceId);
  if (policy.queue_auto_continue === false) return [];

  const { count: running } = await getSupabaseAdmin()
    .from('browser_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'running')
    .is('deleted_at', null);
  const maxParallel = Number(policy.max_parallel_sessions ?? 4);
  const slots = Math.max(0, maxParallel - (running ?? 0));
  if (slots <= 0) return [];

  // Fill all free worker slots immediately (never wait for manual refresh)
  const take = Math.min(slots, Math.max(1, opts.limit ?? slots));
  let q = getSupabaseAdmin()
    .from('execution_jobs')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'queued')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(take);
  if (opts.batchId) q = q.eq('queue_batch_id', opts.batchId);
  if (opts.afterJobId) q = q.neq('id', opts.afterJobId);

  const { data } = await q;
  const started: string[] = [];
  await Promise.all(
    (data ?? []).map(async (row) => {
      try {
        await startJob(workspaceId, String(row.id));
        started.push(String(row.id));
      } catch {
        /* slot race / 429 — leave queued for next scheduler tick */
      }
    })
  );
  return started;
}

export async function getExecutionReport(workspaceId: string, jobId: string) {
  const job = await getJob(workspaceId, jobId);
  if (!job) return null;
  const logs = await listLogs(workspaceId, jobId);
  const metrics = (job.metrics as Record<string, unknown>) ?? {};
  const started = job.started_at ? new Date(String(job.started_at)).getTime() : null;
  const finished = job.finished_at ? new Date(String(job.finished_at)).getTime() : null;
  const watchMs = Number(job.watch_duration_ms ?? metrics.watchDurationMs ?? 0);
  const totalMs = started && finished ? finished - started : null;
  const manualMs = watchMs;
  const automationMs = totalMs != null ? Math.max(0, totalMs - manualMs) : null;
  return {
    jobId,
    status: job.status,
    siteDomain: job.site_domain,
    pauseReason: job.pause_reason ?? metrics.pauseReason ?? null,
    resumeReason: job.resume_reason ?? metrics.resumeReason ?? null,
    watchDurationMs: watchMs || null,
    manualTimeMs: manualMs || null,
    automationTimeMs: automationMs,
    autoResumed: Boolean(job.auto_resumed),
    success: job.status === 'completed' || job.status === 'submitted' || job.status === 'verified',
    failure: job.status === 'failed',
    timeline: logs.map((l) => ({
      at: l.created_at,
      level: l.level,
      message: l.message,
      data: l.data,
    })),
  };
}

export async function cancelJob(workspaceId: string, jobId: string, reason?: string) {
  await setJobStatus(workspaceId, jobId, 'cancelled', {
    finished_at: new Date().toISOString(),
  });
  const job = await getJob(workspaceId, jobId);
  if (job?.session_id) {
    await getSupabaseAdmin()
      .from('browser_sessions')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', job.session_id);
  }
  await appendLog(workspaceId, jobId, 'warn', reason === 'skipped_by_user' ? 'Website skipped by user' : 'Execution cancelled', {
    reason: reason ?? null,
  });
  await recordHistory(workspaceId, jobId, 'cancelled');
  return getJob(workspaceId, jobId);
}

export async function approveJob(workspaceId: string, jobId: string, userId?: string) {
  await setJobStatus(workspaceId, jobId, 'preparing', {
    approved_at: new Date().toISOString(),
    approved_by: userId ?? null,
  });
  // Clear wait_approval steps that are paused
  await getSupabaseAdmin()
    .from('execution_steps')
    .update({ status: 'done', finished_at: new Date().toISOString() })
    .eq('job_id', jobId)
    .eq('blocker', 'human_approval')
    .in('status', ['paused', 'pending', 'running']);

  await appendLog(workspaceId, jobId, 'info', 'User approved submission', { userId });
  return resumeJob(workspaceId, jobId);
}

export async function retryJob(
  workspaceId: string,
  jobId: string,
  opts: { force?: boolean; delaySeconds?: number } = {}
) {
  const { retryBackoffSeconds, isAutoRetryable } = await import('@seo-os/backlink-builder');
  const job = await getJob(workspaceId, jobId);
  if (!job) throw Object.assign(new Error('Job not found'), { status: 404 });

  const code = String(job.error_code ?? '');
  if (!opts.force && code && !isAutoRetryable(code) && String(job.status) === 'failed') {
    throw Object.assign(
      new Error(
        `Failure ${code} is not auto-retryable. Use force retry only after resolving the issue.`
      ),
      { status: 400 }
    );
  }

  const nextAttempt = Number(job.retry_count ?? 0) + 1;
  const policy = await getOrCreatePolicy(workspaceId);
  const maxRetries = Number(policy.retry_count ?? 2);
  if (nextAttempt > maxRetries && !opts.force) {
    throw Object.assign(new Error(`Max retries (${maxRetries}) exceeded`), { status: 400 });
  }

  const delay =
    opts.delaySeconds ??
    retryBackoffSeconds(nextAttempt) ??
    Number(policy.cooldown_seconds ?? 5);

  const metrics = (job.metrics as Record<string, unknown>) ?? {};
  const history = Array.isArray(metrics.retryHistory) ? [...(metrics.retryHistory as unknown[])] : [];
  history.push({
    attempt: nextAttempt,
    at: new Date().toISOString(),
    delaySeconds: delay,
    priorCode: job.error_code,
    priorMessage: job.error_message,
  });

  await getSupabaseAdmin()
    .from('execution_jobs')
    .update({
      status: 'retry_scheduled',
      retry_count: nextAttempt,
      error_code: null,
      error_message: null,
      metrics: { ...metrics, retryHistory: history, nextRetryAt: new Date(Date.now() + delay * 1000).toISOString() },
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  await appendLog(workspaceId, jobId, 'info', `Retry attempt ${nextAttempt} scheduled`, {
    delaySeconds: delay,
    maxRetries,
  });

  if (delay <= 0) {
    return startJob(workspaceId, jobId);
  }

  // Delayed start via queue — job stays retry_scheduled until worker picks up
  await enqueueJob(
    QUEUES.PLAYWRIGHT,
    'bee_execute',
    {
      type: 'bee_execute',
      jobId,
      workspaceId,
      action: 'retry_start',
    },
    {
      singletonKey: `bee-retry-${jobId}-${nextAttempt}`,
      startAfter: delay,
      retryLimit: 0,
    }
  );

  // Also arm a delayed status transition by calling start after wait in background style:
  // For immediate UX when delay is tiny, schedule setTimeout-less path using startAfter only —
  // the bee_execute handler will call startJob when action=retry_start.
  return getJob(workspaceId, jobId);
}

export async function restartJob(workspaceId: string, jobId: string, userId?: string) {
  const job = await getJob(workspaceId, jobId);
  if (!job?.opportunity_id) throw Object.assign(new Error('Job not found'), { status: 404 });
  await cancelJob(workspaceId, jobId);
  return createExecution({
    workspaceId,
    opportunityId: String(job.opportunity_id),
    mode: (job.mode as 'prepare') ?? 'prepare',
    userId,
    mappingOverrides: (job.mapping_overrides as Record<string, unknown>) ?? {},
  });
}

export async function replayJob(workspaceId: string, sourceJobId: string, userId?: string) {
  const source = await getJob(workspaceId, sourceJobId);
  if (!source?.opportunity_id) throw Object.assign(new Error('Source job not found'), { status: 404 });
  const created = await createExecution({
    workspaceId,
    opportunityId: String(source.opportunity_id),
    mode: 'manual',
    userId,
    mappingOverrides: (source.mapping_overrides as Record<string, unknown>) ?? {},
  });
  await getSupabaseAdmin()
    .from('execution_history')
    .insert({
      id: randomUUID(),
      workspace_id: workspaceId,
      job_id: created.id,
      domain: created.site_domain,
      result: 'completed',
      replay_of_job_id: sourceJobId,
      timing: { replay: true },
    });
  return created;
}

export async function recordHistory(
  workspaceId: string,
  jobId: string,
  result: string,
  extra: Record<string, unknown> = {}
) {
  const job = await getJob(workspaceId, jobId);
  await getSupabaseAdmin().from('execution_history').insert({
    id: randomUUID(),
    workspace_id: workspaceId,
    job_id: jobId,
    domain: job?.site_domain ?? null,
    result,
    form_values_redacted: redactFormValues(
      ((job?.plan_snapshot as { mapping?: Record<string, unknown> })?.mapping as Record<
        string,
        unknown
      >) ?? {}
    ),
    timing: (job?.metrics as Record<string, unknown>) ?? {},
    ...extra,
  });
}

export async function listHistory(workspaceId: string) {
  const { data } = await getSupabaseAdmin()
    .from('execution_history')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  return data ?? [];
}

export async function listLogs(workspaceId: string, jobId: string) {
  const { data } = await getSupabaseAdmin()
    .from('execution_logs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
    .limit(500);
  return data ?? [];
}

export async function listSessions(workspaceId: string) {
  const { data } = await getSupabaseAdmin()
    .from('browser_sessions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  return data ?? [];
}

export async function getStatistics(workspaceId: string) {
  // Single source of truth — Execution State Manager
  const { getStatisticsFromExecutionState } = await import('./execution-state.service.js');
  const base = await getStatisticsFromExecutionState(workspaceId);
  const jobs = await listJobs(workspaceId);
  const policy = await getOrCreatePolicy(workspaceId);
  const maxWorkers = Math.max(1, Number(policy.max_parallel_sessions ?? 4));
  let poolStats: {
    headlessConnected: boolean;
    headedConnected: boolean;
    activeSessions: number;
  } = { headlessConnected: false, headedConnected: false, activeSessions: 0 };
  try {
    const { getBrowserPoolStats } = await import('./browser-runtime.service.js');
    poolStats = getBrowserPoolStats();
  } catch {
    /* optional */
  }

  const { toPublicExecutionStatus } = await import('@seo-os/backlink-builder');
  const runningJobs: Array<{
    website: string;
    step: string;
    stepLabel: string;
    sessionId: string;
    startedAt: string | null;
    elapsedMs: number;
    etaMs: number | null;
  }> = [];
  let current: { website?: string; step?: string; browser?: string; queueProgress?: string } = {};
  for (const j of jobs) {
    const disposition =
      j.disposition != null
        ? String(j.disposition)
        : ((j.metrics as { disposition?: string } | null)?.disposition ?? null);
    const pub = toPublicExecutionStatus(String(j.status), { disposition });
    if (pub !== 'Running') continue;
    const startedAt = j.started_at ? String(j.started_at) : null;
    const elapsedMs = startedAt ? Date.now() - new Date(startedAt).getTime() : 0;
    runningJobs.push({
      website: String(j.site_domain ?? ''),
      step: String(j.status),
      stepLabel: String(j.status).replace(/_/g, ' '),
      sessionId: String(j.session_id ?? ''),
      startedAt,
      elapsedMs,
      etaMs: null,
    });
    if (!current.website) {
      current = {
        website: String(j.site_domain ?? ''),
        step: String(j.status).replace(/_/g, ' '),
        browser: String(j.session_id ?? ''),
      };
    }
  }
  current.queueProgress = `${base.completedJobs}/${base.totalJobs}`;
  const workers = Array.from({ length: maxWorkers }, (_, i) => {
    const job = runningJobs[i];
    if (!job) {
      return {
        workerId: i + 1,
        status: 'idle' as const,
        website: null as string | null,
        step: null as string | null,
        elapsedMs: 0,
        etaMs: null as number | null,
      };
    }
    return {
      workerId: i + 1,
      status: 'busy' as const,
      website: job.website,
      step: job.stepLabel,
      elapsedMs: job.elapsedMs,
      etaMs: job.etaMs,
    };
  });

  return {
    ...base,
    workers,
    browserPool: poolStats,
    current,
    maxParallelSessions: maxWorkers,
    activeWorkerCount: Math.min(maxWorkers, runningJobs.length),
    workerUsage: `${Math.min(maxWorkers, runningJobs.length)}/${maxWorkers}`,
    topFailureReasons: {} as Record<string, number>,
    avgRuntimeMs: null as number | null,
    avgSubmissionMs: null as number | null,
    estimatedFinishAt: null as string | null,
  };
}

export { gateStatusFromBlocker, appendLog };
