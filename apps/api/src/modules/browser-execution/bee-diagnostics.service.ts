/**
 * BEE diagnostics — health, readiness, assets, bulk retry, reports, AI failure analysis.
 * Extends existing Bee Engine services.
 */

import {
  analyzeFailureAi,
  failureLabel,
  isAutoRetryable,
  suggestedFixForCode,
} from '@seo-os/backlink-builder';
import { DEFAULT_FEATURE_FLAGS } from '@seo-os/shared';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getQueueOpsSnapshot, QUEUES } from '../../jobs/boss.js';
import { getProviderHealthSnapshot } from '../providers/pif.service.js';
import {
  getJob,
  getStatistics,
  listJobs,
  listLogs,
  listSessions,
  retryJob,
} from './bee.service.js';
import { isPlaywrightAvailable } from './browser-runtime.service.js';
import {
  getBrowserRuntimeStatus,
  verifyBrowserRuntime,
} from './browser-runtime-manager.service.js';

export type HealthIndicator = {
  key: string;
  label: string;
  status: 'green' | 'red' | 'yellow';
  detail?: string;
};

export async function getBeeWorkerHealth(workspaceId: string): Promise<{
  indicators: HealthIndicator[];
  healthy: boolean;
  overall: 'green' | 'yellow' | 'red';
  browserRuntime?: Awaited<ReturnType<typeof getBrowserRuntimeStatus>>;
}> {
  const indicators: HealthIndicator[] = [];

  let runtime = await getBrowserRuntimeStatus().catch(() => null);
  if (!runtime?.last_verification_at) {
    runtime = await verifyBrowserRuntime({ autoInstall: false, probeLaunch: false }).catch(
      () => null
    );
  }
  const runtimeHealthy = runtime?.health === 'healthy' && runtime.launch_ok;

  const playwrightOk =
    (await isPlaywrightAvailable().catch(() => false)) && Boolean(runtime?.playwright_installed);
  indicators.push({
    key: 'playwright',
    label: 'Playwright',
    status: playwrightOk ? 'green' : 'red',
    detail: playwrightOk
      ? `Installed${runtime?.playwright_version ? ` · v${runtime.playwright_version}` : ''}`
      : 'Not available on this worker',
  });

  indicators.push({
    key: 'browser_runtime',
    label: 'Browser Runtime',
    status: runtimeHealthy ? 'green' : runtime?.health === 'installing' ? 'yellow' : 'red',
    detail: runtimeHealthy
      ? `Healthy${runtime?.browser_version ? ` · Chromium ${runtime.browser_version}` : ''}`
      : runtime?.last_error || 'Browser Runtime Missing',
  });

  let queueOk = false;
  try {
    const snap = await getQueueOpsSnapshot();
    const pw = snap.queues.find((q) => q.name === QUEUES.PLAYWRIGHT);
    queueOk = Boolean(snap.queuesInitialized && pw?.exists);
    indicators.push({
      key: 'queue',
      label: 'Queue',
      status: queueOk ? 'green' : 'red',
      detail: pw
        ? `PLAYWRIGHT pending ${pw.pendingJobs} · active ${pw.activeJobs}`
        : 'PLAYWRIGHT queue missing',
    });
    indicators.push({
      key: 'redis',
      label: 'Redis / pg-boss',
      status: snap.workersEnabled && snap.queuesInitialized ? 'green' : 'red',
      detail: snap.workersEnabled ? 'workers enabled' : 'workers disabled',
    });
  } catch (err) {
    indicators.push({
      key: 'queue',
      label: 'Queue',
      status: 'red',
      detail: err instanceof Error ? err.message : 'offline',
    });
    indicators.push({ key: 'redis', label: 'Redis / pg-boss', status: 'red' });
  }

  indicators.push({
    key: 'worker',
    label: 'Worker',
    status: playwrightOk && queueOk && runtimeHealthy ? 'green' : 'red',
    detail: DEFAULT_FEATURE_FLAGS.bee_enabled ? 'BEE enabled' : 'BEE disabled',
  });

  try {
    const { error } = await getSupabaseAdmin()
      .from('workspaces')
      .select('id')
      .eq('id', workspaceId)
      .limit(1)
      .maybeSingle();
    indicators.push({
      key: 'database',
      label: 'Database',
      status: error ? 'red' : 'green',
      detail: error?.message,
    });
  } catch {
    indicators.push({ key: 'database', label: 'Database', status: 'red' });
  }

  try {
    const { data: buckets } = await getSupabaseAdmin().storage.listBuckets();
    const hasBucket = (buckets ?? []).some((b) => b.name === 'browser-execution');
    indicators.push({
      key: 'storage',
      label: 'Storage',
      status: hasBucket ? 'green' : 'yellow',
      detail: hasBucket ? 'browser-execution bucket ready' : 'bucket missing — screenshots may skip',
    });
  } catch {
    indicators.push({ key: 'storage', label: 'Storage', status: 'yellow', detail: 'unreachable' });
  }

  const sessions = await listSessions(workspaceId);
  const unhealthySessions = sessions.filter(
    (s) => String(s.health_status ?? '') === 'unhealthy' || String(s.status) === 'error'
  );
  indicators.push({
    key: 'browser_sessions',
    label: 'Browser Sessions',
    status: unhealthySessions.length ? 'yellow' : 'green',
    detail: `${sessions.length} sessions · ${unhealthySessions.length} unhealthy`,
  });

  try {
    const providers = await getProviderHealthSnapshot(workspaceId);
    const imageOk = (providers?.healthy ?? 0) > 0 || (providers?.connected ?? 0) > 0;
    indicators.push({
      key: 'image_provider',
      label: 'Image Provider',
      status: imageOk ? 'green' : 'yellow',
      detail: `${providers?.healthy ?? 0} healthy / ${providers?.connected ?? 0} connected`,
    });
    indicators.push({
      key: 'keyword_provider',
      label: 'Keyword Provider',
      status: imageOk || (providers?.connected ?? 0) >= 0 ? 'green' : 'yellow',
    });
    indicators.push({
      key: 'authority_provider',
      label: 'Authority Provider',
      status: (providers?.offline ?? 0) > (providers?.healthy ?? 0) ? 'yellow' : 'green',
    });
    indicators.push({
      key: 'cms',
      label: 'CMS / Integrations',
      status: (providers?.offline ?? 0) === 0 ? 'green' : 'yellow',
    });
  } catch {
    indicators.push({ key: 'image_provider', label: 'Image Provider', status: 'yellow' });
    indicators.push({ key: 'keyword_provider', label: 'Keyword Provider', status: 'yellow' });
    indicators.push({ key: 'authority_provider', label: 'Authority Provider', status: 'yellow' });
    indicators.push({ key: 'cms', label: 'CMS / Integrations', status: 'yellow' });
  }

  const reds = indicators.filter((i) => i.status === 'red').length;
  const yellows = indicators.filter((i) => i.status === 'yellow').length;
  const overall = reds > 0 ? 'red' : yellows > 0 ? 'yellow' : 'green';

  return {
    indicators,
    healthy: reds === 0,
    overall,
    browserRuntime: runtime ?? undefined,
  };
}

export async function validateExecutionReadiness(
  workspaceId: string,
  opportunityId?: string
): Promise<{
  ready: boolean;
  checks: Array<{ key: string; ok: boolean; message: string }>;
}> {
  const checks: Array<{ key: string; ok: boolean; message: string }> = [];
  const health = await getBeeWorkerHealth(workspaceId);

  const playwright = health.indicators.find((i) => i.key === 'playwright');
  const browserRuntime = health.indicators.find((i) => i.key === 'browser_runtime');
  checks.push({
    key: 'playwright',
    ok: playwright?.status === 'green',
    message: playwright?.detail ?? 'Playwright check',
  });
  checks.push({
    key: 'browser_runtime',
    ok: browserRuntime?.status === 'green',
    message:
      browserRuntime?.status === 'green'
        ? 'Browser Runtime Healthy'
        : 'Browser Runtime Missing — Install Required',
  });
  checks.push({
    key: 'worker',
    ok: health.indicators.find((i) => i.key === 'worker')?.status === 'green',
    message: 'Worker online',
  });
  checks.push({
    key: 'queue',
    ok: health.indicators.find((i) => i.key === 'queue')?.status === 'green',
    message: health.indicators.find((i) => i.key === 'queue')?.detail ?? 'Queue online',
  });
  checks.push({
    key: 'browser',
    ok: browserRuntime?.status === 'green' && playwright?.status === 'green',
    message:
      browserRuntime?.status === 'green' ? 'Browser launches successfully' : 'Browser unavailable',
  });
  checks.push({
    key: 'storage',
    ok: health.indicators.find((i) => i.key === 'storage')?.status !== 'red',
    message: health.indicators.find((i) => i.key === 'storage')?.detail ?? 'Storage',
  });
  checks.push({
    key: 'provider',
    ok: health.indicators.find((i) => i.key === 'image_provider')?.status !== 'red',
    message: 'Provider healthy',
  });

  if (opportunityId) {
    const { data: opp } = await getSupabaseAdmin()
      .from('opportunities')
      .select('id, domain, url, website_name')
      .eq('id', opportunityId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    checks.push({
      key: 'opportunity',
      ok: Boolean(opp),
      message: opp ? `Opportunity ${opp.website_name ?? opp.domain}` : 'Opportunity missing',
    });
    checks.push({
      key: 'domain',
      ok: Boolean(opp?.domain || opp?.url),
      message: opp?.domain || opp?.url ? 'Domain present' : 'Domain / URL missing',
    });

    const { data: pack } = await getSupabaseAdmin()
      .from('content_packs')
      .select('id, status')
      .eq('workspace_id', workspaceId)
      .eq('opportunity_id', opportunityId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    checks.push({
      key: 'content',
      ok: Boolean(pack),
      message: pack ? `Content pack ${pack.status}` : 'Content pack missing — generate in Content Studio',
    });

    const { count: imageCount } = await getSupabaseAdmin()
      .from('image_assets')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId);
    checks.push({
      key: 'images',
      ok: true,
      message:
        (imageCount ?? 0) > 0
          ? `${imageCount} image asset(s) available`
          : 'No image assets (optional for some types)',
    });
  }

  const ready = checks.every((c) => c.ok || c.key === 'images');
  return { ready, checks };
}

export async function getFailedJobDetails(workspaceId: string, jobId: string) {
  const job = await getJob(workspaceId, jobId);
  if (!job) return null;
  const logs = await listLogs(workspaceId, jobId);
  const { data: steps } = await getSupabaseAdmin()
    .from('execution_steps')
    .select('*')
    .eq('job_id', jobId)
    .order('step_index', { ascending: true });
  const { data: assets } = await getSupabaseAdmin()
    .from('execution_assets')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(40);

  const signed = [];
  for (const a of assets ?? []) {
    if (!a.storage_path) continue;
    const { data } = await getSupabaseAdmin()
      .storage.from('browser-execution')
      .createSignedUrl(String(a.storage_path), 3600);
    signed.push({
      id: a.id,
      label: a.label,
      stepId: a.step_id,
      kind: a.kind,
      createdAt: a.created_at,
      url: data?.signedUrl ?? null,
    });
  }

  const metrics = (job.metrics as Record<string, unknown>) ?? {};
  const failure = (metrics.failure as Record<string, unknown>) ?? {};
  const analysis = analyzeFailureAi({
    failureCode: String(job.error_code ?? failure.failureCode ?? ''),
    failureMessage: String(job.error_message ?? failure.failureMessage ?? ''),
    pauseReason: String(job.pause_reason ?? ''),
    status: String(job.status),
  });

  const consoleEvents = logs
    .flatMap((l) => {
      const d = (l.data as Record<string, unknown>) ?? {};
      if (Array.isArray(d.console_events)) return d.console_events;
      if (Array.isArray(d.consoleEvents)) return d.consoleEvents;
      return [];
    })
    .slice(-50);
  const network = logs
    .flatMap((l) => {
      const d = (l.data as Record<string, unknown>) ?? {};
      if (Array.isArray(d.networkRequests)) return d.networkRequests;
      return [];
    })
    .slice(-50);

  return {
    job,
    steps: steps ?? [],
    logs,
    screenshots: signed,
    failure: {
      code: job.error_code ?? failure.failureCode ?? null,
      message: job.error_message ?? failure.failureMessage ?? null,
      label: failureLabel(String(job.error_code ?? failure.failureCode ?? '')),
      step: failure.failureStep ?? job.current_step_index ?? null,
      timestamp: failure.failureTimestamp ?? job.finished_at ?? null,
      stack: failure.stack ?? null,
      retryHistory: (metrics.retryHistory as unknown[]) ?? [],
      analysis,
      suggestedFix: suggestedFixForCode(String(job.error_code ?? failure.failureCode ?? '')),
    },
    consoleEvents,
    networkRequests: network,
    timeline: (steps ?? []).map((s) => ({
      stepIndex: s.step_index,
      action: s.action,
      status: s.status,
      startedAt: s.started_at,
      finishedAt: s.finished_at,
      durationMs: s.duration_ms,
      error: s.error_message,
      blocker: s.blocker,
    })),
  };
}

export async function bulkRetryJobs(
  workspaceId: string,
  opts: {
    mode: 'all_failed' | 'selected' | 'by_reason' | 'temporary_only';
    jobIds?: string[];
    reasonCode?: string;
  }
) {
  const jobs = await listJobs(workspaceId);
  let candidates = jobs.filter((j) => String(j.status) === 'failed');

  if (opts.mode === 'selected') {
    const set = new Set(opts.jobIds ?? []);
    candidates = candidates.filter((j) => set.has(String(j.id)));
  } else if (opts.mode === 'by_reason' && opts.reasonCode) {
    candidates = candidates.filter((j) => String(j.error_code) === opts.reasonCode);
  } else if (opts.mode === 'temporary_only') {
    candidates = candidates.filter((j) => isAutoRetryable(String(j.error_code ?? '')));
  }

  const results: Array<{ jobId: string; ok: boolean; error?: string }> = [];
  for (const j of candidates) {
    try {
      await retryJob(workspaceId, String(j.id), { force: true });
      results.push({ jobId: String(j.id), ok: true });
    } catch (err) {
      results.push({
        jobId: String(j.id),
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { attempted: results.length, results };
}

export async function getWorkspaceExecutionReport(workspaceId: string, format: 'json' | 'csv' = 'json') {
  const stats = await getStatistics(workspaceId);
  const jobs = await listJobs(workspaceId);
  const failed = jobs.filter((j) => String(j.status) === 'failed');
  const reasonCounts: Record<string, number> = {};
  for (const j of failed) {
    const code = String(j.error_code ?? 'UNKNOWN_EXCEPTION');
    reasonCounts[code] = (reasonCounts[code] ?? 0) + 1;
  }
  const topReasons = Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([code, count]) => ({ code, label: failureLabel(code), count }));

  const waitingUser = jobs.filter(
    (j) =>
      String(j.status).startsWith('watching') ||
      String(j.status).startsWith('blocked_') ||
      ['awaiting_user', 'needs_approval', 'paused'].includes(String(j.status))
  ).length;
  const captcha = jobs.filter(
    (j) =>
      String(j.pause_reason) === 'captcha' ||
      String(j.status).includes('captcha') ||
      String(j.error_code) === 'CAPTCHA_DETECTED'
  ).length;
  const loginRequired = jobs.filter(
    (j) =>
      String(j.pause_reason) === 'login' ||
      String(j.status).includes('login') ||
      String(j.error_code) === 'LOGIN_REQUIRED'
  ).length;

  const report = {
    generatedAt: new Date().toISOString(),
    workspaceId,
    totalJobs: jobs.length,
    completed: stats.completed,
    failed: stats.failed,
    waitingUser,
    captcha,
    loginRequired,
    queued: stats.queued,
    running: stats.running,
    retrying: jobs.filter((j) => String(j.status) === 'retry_scheduled').length,
    cancelled: stats.cancelled,
    averageRuntimeMs: stats.avgRuntimeMs,
    successRate: stats.successRate,
    topFailureReasons: topReasons,
    jobs: jobs.map((j) => ({
      id: j.id,
      domain: j.site_domain,
      status: j.status,
      errorCode: j.error_code,
      errorMessage: j.error_message,
      pauseReason: j.pause_reason,
      retryCount: j.retry_count,
      startedAt: j.started_at,
      finishedAt: j.finished_at,
    })),
  };

  if (format === 'csv') {
    const header = [
      'id',
      'domain',
      'status',
      'error_code',
      'error_message',
      'pause_reason',
      'retry_count',
      'started_at',
      'finished_at',
    ];
    const rows = report.jobs.map((j) =>
      [
        j.id,
        j.domain,
        j.status,
        j.errorCode,
        String(j.errorMessage ?? '').replace(/"/g, '""'),
        j.pauseReason,
        j.retryCount,
        j.startedAt,
        j.finishedAt,
      ]
        .map((v) => `"${v ?? ''}"`)
        .join(',')
    );
    const summary = [
      `# total=${report.totalJobs}`,
      `# completed=${report.completed}`,
      `# failed=${report.failed}`,
      `# waiting_user=${report.waitingUser}`,
      `# captcha=${report.captcha}`,
      `# login_required=${report.loginRequired}`,
      `# success_rate=${report.successRate ?? ''}`,
      `# avg_runtime_ms=${report.averageRuntimeMs ?? ''}`,
    ].join('\n');
    return {
      format: 'csv' as const,
      filename: `bee-report-${workspaceId.slice(0, 8)}.csv`,
      body: `${summary}\n${header.join(',')}\n${rows.join('\n')}`,
      report,
    };
  }

  return { format: 'json' as const, report };
}

/** Excel-ish TSV for spreadsheet import when true XLSX is unavailable */
export async function getWorkspaceExecutionReportExcel(workspaceId: string) {
  const { report } = await getWorkspaceExecutionReport(workspaceId, 'json');
  const header = [
    'Job ID',
    'Domain',
    'Status',
    'Failure Code',
    'Failure Message',
    'Pause Reason',
    'Retries',
    'Started',
    'Finished',
  ];
  const lines = [
    ['Total Jobs', report.totalJobs],
    ['Completed', report.completed],
    ['Failed', report.failed],
    ['Waiting User', report.waitingUser],
    ['CAPTCHA', report.captcha],
    ['Login Required', report.loginRequired],
    ['Success %', report.successRate ?? ''],
    ['Avg Runtime ms', report.averageRuntimeMs ?? ''],
    [],
    header,
    ...report.jobs.map((j) => [
      j.id,
      j.domain,
      j.status,
      j.errorCode,
      j.errorMessage,
      j.pauseReason,
      j.retryCount,
      j.startedAt,
      j.finishedAt,
    ]),
  ];
  const body = lines.map((r) => (Array.isArray(r) ? r.join('\t') : '')).join('\n');
  return {
    format: 'tsv' as const,
    filename: `bee-report-${workspaceId.slice(0, 8)}.xls`,
    mimeType: 'application/vnd.ms-excel',
    body,
    report,
  };
}

export async function getQueueMonitor(workspaceId: string) {
  const stats = await getStatistics(workspaceId);
  const jobs = await listJobs(workspaceId);
  const retrying = jobs.filter((j) => String(j.status) === 'retry_scheduled').length;
  const waitingUser = jobs.filter(
    (j) =>
      String(j.status).startsWith('watching') ||
      String(j.status).startsWith('blocked_') ||
      ['awaiting_user', 'needs_approval', 'paused', 'ready_for_review'].includes(String(j.status))
  ).length;

  return {
    queued: stats.queued,
    running: stats.running,
    paused: stats.paused,
    waitingUser,
    retrying,
    completed: stats.completed,
    failed: stats.failed,
    cancelled: stats.cancelled,
    watching: stats.watching ?? 0,
    blocked: stats.blocked,
    averageRuntimeMs: stats.avgRuntimeMs,
    averageSubmissionMs: stats.avgSubmissionMs ?? null,
    successRate: stats.successRate,
    etaSeconds: stats.etaSeconds,
    estimatedFinishAt: stats.estimatedFinishAt ?? null,
    workerUsage: stats.workerUsage ?? null,
    maxParallelSessions: stats.maxParallelSessions ?? null,
    workers: stats.workers ?? [],
    browserPool: stats.browserPool ?? null,
    current: stats.current,
  };
}
