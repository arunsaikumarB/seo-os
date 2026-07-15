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
import { getBrandContextForBee } from './bee-assets.js';

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
    max_parallel_sessions: 1,
    daily_goal: 20,
    auto_resume: true,
    watch_interval_ms: 2000,
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

const ACTIVE_JOB_STATUSES = new Set([
  'queued',
  'preparing',
  'running',
  'paused',
  'needs_approval',
  'ready_for_review',
  'ready_to_continue',
  'watching_captcha',
  'watching_login',
  'watching_mfa',
  'watching_email',
  'watching_phone',
  'blocked_captcha',
  'blocked_mfa',
]);

export type ExecutionReadiness =
  | 'ready'
  | 'in_progress'
  | 'needs_approval'
  | 'completed'
  | 'failed'
  | 'needs_domain'
  | 'not_ready';

/**
 * Approved / campaign-ready opportunities for the Execution Center picker.
 * Internal UUIDs stay in API responses for selection; UI must not surface them as inputs.
 */
export async function listExecutionReadyOpportunities(workspaceId: string) {
  const { data: opps, error } = await getSupabaseAdmin()
    .from('opportunities')
    .select(
      'id, title, domain, website_name, url, opportunity_type, score, status, queue_status, pipeline_stage, automation_status, metadata, created_at, updated_at'
    )
    .eq('workspace_id', workspaceId)
    .or(
      'queue_status.eq.approved,status.eq.approved,pipeline_stage.eq.campaign_ready,pipeline_stage.eq.outreach'
    )
    .order('score', { ascending: false })
    .limit(200);
  if (error) throw error;

  const ids = (opps ?? []).map((o) => o.id);
  const jobsByOpp = new Map<
    string,
    { id: string; status: string; created_at: string; site_domain?: string | null }
  >();

  if (ids.length) {
    const { data: jobs } = await getSupabaseAdmin()
      .from('execution_jobs')
      .select('id, opportunity_id, status, created_at, site_domain')
      .eq('workspace_id', workspaceId)
      .in('opportunity_id', ids)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    for (const job of jobs ?? []) {
      const oppId = String(job.opportunity_id);
      if (!jobsByOpp.has(oppId)) {
        jobsByOpp.set(oppId, {
          id: String(job.id),
          status: String(job.status),
          created_at: String(job.created_at),
          site_domain: job.site_domain as string | null,
        });
      }
    }
  }

  return (opps ?? []).map((opp) => {
    const meta = (opp.metadata as Record<string, unknown>) ?? {};
    const workflow =
      typeof meta.workflow === 'object' && meta.workflow
        ? (meta.workflow as Record<string, unknown>)
        : {};
    const latestJob = jobsByOpp.get(String(opp.id)) ?? null;
    const website = String(opp.website_name || opp.domain || opp.title || 'Unknown site');
    const hasDomain = Boolean(opp.domain || opp.url);
    const campaignEligible =
      workflow.campaign_eligible === true ||
      workflow.execution_ready === true ||
      opp.pipeline_stage === 'campaign_ready' ||
      opp.pipeline_stage === 'outreach' ||
      opp.queue_status === 'approved';

    let readiness: ExecutionReadiness = 'not_ready';
    if (latestJob) {
      const st = latestJob.status;
      if (st === 'completed') readiness = 'completed';
      else if (st === 'failed' || st === 'cancelled') readiness = 'failed';
      else if (st === 'needs_approval' || st === 'ready_for_review') readiness = 'needs_approval';
      else if (ACTIVE_JOB_STATUSES.has(st)) readiness = 'in_progress';
      else readiness = 'ready';
    } else if (!hasDomain) {
      readiness = 'needs_domain';
    } else if (campaignEligible) {
      readiness = 'ready';
    }

    const selectable =
      readiness === 'ready' || readiness === 'failed' || readiness === 'completed';

    return {
      id: opp.id,
      website,
      domain: opp.domain ?? null,
      title: opp.title,
      score: Number(opp.score ?? 0),
      opportunity_type: opp.opportunity_type,
      status: opp.queue_status || opp.status,
      pipeline_stage: opp.pipeline_stage,
      readiness,
      selectable,
      has_submission: Boolean(meta.submission_id || workflow.submission_id),
      has_content_draft: Boolean(
        meta.content_studio_draft_id || workflow.content_studio_draft_id
      ),
      latest_job: latestJob
        ? {
            id: latestJob.id,
            status: latestJob.status,
            created_at: latestJob.created_at,
          }
        : null,
    };
  });
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

  const policy = await getOrCreatePolicy(workspaceId);
  const { count } = await getSupabaseAdmin()
    .from('browser_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'running')
    .is('deleted_at', null);
  if ((count ?? 0) >= Number(policy.max_parallel_sessions ?? 1)) {
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

async function setJobStatus(
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
  const slots = Math.max(0, Number(policy.max_parallel_sessions ?? 1) - (running ?? 0));
  if (slots <= 0) return [];

  const take = Math.min(slots, Math.max(1, opts.limit ?? 1));
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
  for (const row of data ?? []) {
    try {
      await startJob(workspaceId, String(row.id));
      started.push(String(row.id));
    } catch {
      break;
    }
  }
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

export async function cancelJob(workspaceId: string, jobId: string) {
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
  await appendLog(workspaceId, jobId, 'warn', 'Execution cancelled');
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

export async function retryJob(workspaceId: string, jobId: string) {
  const job = await getJob(workspaceId, jobId);
  if (!job) throw Object.assign(new Error('Job not found'), { status: 404 });
  await getSupabaseAdmin()
    .from('execution_jobs')
    .update({
      status: 'retry_scheduled',
      retry_count: Number(job.retry_count ?? 0) + 1,
      error_code: null,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
  return startJob(workspaceId, jobId);
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
  const jobs = await listJobs(workspaceId);
  const counts = {
    running: 0,
    queued: 0,
    paused: 0,
    needs_approval: 0,
    completed: 0,
    failed: 0,
    blocked: 0,
    cancelled: 0,
    watching: 0,
    ready_to_continue: 0,
    auto_resumed: 0,
    completed_after_captcha: 0,
    completed_after_login: 0,
  };
  let runtimeSum = 0;
  let runtimeN = 0;
  let current: {
    website?: string;
    step?: string;
    browser?: string;
    queueProgress?: string;
  } = {};

  for (const j of jobs) {
    const s = String(j.status);
    if (
      [
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
        'submitted',
      ].includes(s)
    ) {
      counts.running++;
      if (!current.website) {
        current = {
          website: String(j.site_domain ?? ''),
          step: s,
          browser: String(j.session_id ?? ''),
        };
      }
    } else if (s === 'queued' || s === 'retry_scheduled') counts.queued++;
    else if (s === 'paused' || s === 'awaiting_user' || s === 'ready_for_review') counts.paused++;
    else if (s === 'needs_approval') counts.needs_approval++;
    else if (s === 'completed' || s === 'verified') {
      counts.completed++;
      const resume = String(j.resume_reason ?? '');
      const pause = String(j.pause_reason ?? '');
      if (pause === 'captcha' || resume.includes('captcha')) counts.completed_after_captcha++;
      if (pause === 'login' || resume.includes('login')) counts.completed_after_login++;
    } else if (s === 'failed') counts.failed++;
    else if (s.startsWith('blocked_')) counts.blocked++;
    else if (s.startsWith('watching')) {
      counts.watching++;
      if (!current.website) {
        current = {
          website: String(j.site_domain ?? ''),
          step: s,
          browser: String(j.session_id ?? ''),
        };
      }
    } else if (s === 'ready_to_continue') counts.ready_to_continue++;
    else if (s === 'cancelled') counts.cancelled++;

    if (j.auto_resumed) counts.auto_resumed++;

    if (j.started_at && j.finished_at) {
      runtimeSum += new Date(String(j.finished_at)).getTime() - new Date(String(j.started_at)).getTime();
      runtimeN++;
    }
  }

  const done = counts.completed + counts.failed;
  const successRate = done > 0 ? Math.round((counts.completed / done) * 1000) / 10 : null;
  const avgMs = runtimeN ? Math.round(runtimeSum / runtimeN) : 120_000;
  current.queueProgress = `${counts.completed}/${counts.completed + counts.queued + counts.running + counts.watching}`;

  const day = new Date().toISOString().slice(0, 10);
  await getSupabaseAdmin().from('execution_statistics').upsert(
    {
      workspace_id: workspaceId,
      day,
      running: counts.running,
      queued: counts.queued,
      paused: counts.paused,
      needs_approval: counts.needs_approval,
      completed: counts.completed,
      failed: counts.failed,
      blocked: counts.blocked,
      cancelled: counts.cancelled,
      watching: counts.watching,
      auto_resumed: counts.auto_resumed,
      completed_after_captcha: counts.completed_after_captcha,
      completed_after_login: counts.completed_after_login,
      avg_runtime_ms: runtimeN ? Math.round(runtimeSum / runtimeN) : null,
      success_rate: successRate,
      meta: {
        ready_to_continue: counts.ready_to_continue,
        current,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'workspace_id,day' }
  );

  return {
    ...counts,
    successRate,
    avgRuntimeMs: runtimeN ? Math.round(runtimeSum / runtimeN) : null,
    etaSeconds: Math.round((counts.queued + counts.watching) * (avgMs / 1000)),
    estimatedFinishAt:
      counts.queued + counts.watching > 0
        ? new Date(Date.now() + (counts.queued + counts.watching) * avgMs).toISOString()
        : null,
    current,
    metricsSource: 'live' as const,
  };
}

export { gateStatusFromBlocker, appendLog };
