import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { useAuth } from '@/providers/auth-provider';
import { useAppStore } from '@/stores/app-store';

type HealthIndicator = {
  key: string;
  label: string;
  status: 'green' | 'red' | 'yellow';
  detail?: string;
};

type QueueMonitor = {
  queued: number;
  running: number;
  paused: number;
  waitingUser: number;
  retrying: number;
  completed: number;
  failed: number;
  cancelled: number;
  averageRuntimeMs: number | null;
  successRate: number | null;
};

type JobDetails = {
  job: {
    id: string;
    status: string;
    site_domain?: string;
    error_code?: string | null;
    error_message?: string | null;
    pause_reason?: string | null;
    retry_count?: number;
  };
  failure: {
    code: string | null;
    message: string | null;
    label: string;
    step: unknown;
    timestamp: string | null;
    stack: string | null;
    retryHistory: unknown[];
    suggestedFix: string;
    analysis: { summary: string; suggestedAction: string; severity: string };
  };
  timeline: Array<{
    stepIndex: number;
    action: string;
    status: string;
    startedAt?: string;
    finishedAt?: string;
    durationMs?: number;
    error?: string;
  }>;
  screenshots: Array<{ id: string; label: string; url: string | null; createdAt: string }>;
  logs: Array<{ id: string; level: string; message: string; created_at: string; data?: unknown }>;
};

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  preparing: 'Preparing',
  launching_browser: 'Launching browser',
  navigating: 'Navigating',
  analyzing_form: 'Analyzing form',
  filling_fields: 'Filling fields',
  uploading_assets: 'Uploading assets',
  submitting: 'Submitting',
  retry_scheduled: 'Retrying',
  awaiting_user: 'Waiting User',
  needs_approval: 'Waiting User',
  paused: 'Paused',
  ready_for_review: 'Waiting User',
  watching_captcha: 'Waiting User — CAPTCHA',
  watching_login: 'Waiting User — Login',
  watching_email: 'Waiting User — Email',
  watching_phone: 'Waiting User — Phone',
  blocked_captcha: 'CAPTCHA Detected',
  blocked_mfa: 'MFA Required',
  waiting_infrastructure: 'Waiting Infrastructure',
  completed: 'Completed',
  verified: 'Completed',
  submitted: 'Submitted',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function statusDisplayLabel(status: string, errorCode?: string | null, errorMessage?: string | null) {
  if (status === 'waiting_infrastructure' || errorCode === 'BROWSER_RUNTIME_MISSING') {
    return 'Waiting Infrastructure — Browser Runtime Missing';
  }
  if (status === 'failed') {
    return errorMessage || errorCode?.replace(/_/g, ' ') || 'Failed';
  }
  return STATUS_LABEL[status] ?? status.replace(/_/g, ' ');
}

function Dot({ status }: { status: 'green' | 'red' | 'yellow' }) {
  const color =
    status === 'green' ? 'bg-emerald-500' : status === 'red' ? 'bg-red-500' : 'bg-amber-500';
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}

type Props = {
  projectId: string;
  selectedJobId: string | null;
  onSelectJob?: (id: string) => void;
};

export function BeeOpsPanel({ projectId, selectedJobId, onSelectJob }: Props) {
  const { request } = useApi();
  const qc = useQueryClient();
  const [reasonFilter, setReasonFilter] = useState('');
  const { getAccessToken } = useAuth();

  const health = useQuery({
    queryKey: ['bee-health', projectId],
    queryFn: () =>
      request<{ data: { indicators: HealthIndicator[]; overall: string } }>(
        `/v1/projects/${projectId}/browser/health`
      ),
    enabled: !!projectId,
    refetchInterval: 15_000,
  });

  const queue = useQuery({
    queryKey: ['bee-queue-monitor', projectId],
    queryFn: () =>
      request<{ data: QueueMonitor }>(`/v1/projects/${projectId}/browser/queue-monitor`),
    enabled: !!projectId,
    refetchInterval: 8_000,
  });

  const details = useQuery({
    queryKey: ['bee-job-details', projectId, selectedJobId],
    queryFn: () =>
      request<{ data: JobDetails }>(
        `/v1/projects/${projectId}/browser/jobs/${selectedJobId}/details`
      ),
    enabled: !!projectId && !!selectedJobId,
    refetchInterval: 3_000,
  });

  const liveLogs = useQuery({
    queryKey: ['bee-live-logs', projectId, selectedJobId],
    queryFn: () =>
      request<{
        data: Array<{ id: string; level: string; message: string; created_at: string }>;
      }>(`/v1/projects/${projectId}/browser/logs?jobId=${selectedJobId}`),
    enabled: !!projectId && !!selectedJobId,
    refetchInterval: 2_000,
  });

  const bulkRetry = useMutation({
    mutationFn: (body: {
      mode: 'all_failed' | 'selected' | 'by_reason' | 'temporary_only';
      jobIds?: string[];
      reasonCode?: string;
    }) =>
      request(`/v1/projects/${projectId}/browser/retry/bulk`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success('Bulk retry queued');
      qc.invalidateQueries({ queryKey: ['bee-jobs', projectId] });
      qc.invalidateQueries({ queryKey: ['bee-stats', projectId] });
      qc.invalidateQueries({ queryKey: ['mission-control-summary'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runDiagnostics = useMutation({
    mutationFn: () =>
      request<{
        data: {
          result: 'PASS' | 'FAIL';
          reason?: string;
          steps: Array<{ name: string; ok: boolean }>;
        };
      }>(`/v1/projects/${projectId}/browser/runtime/diagnostics`, { method: 'POST' }),
    onSuccess: (res) => {
      if (res.data.result === 'PASS') toast.success('Browser diagnostics PASS');
      else toast.error(res.data.reason || 'Browser diagnostics FAIL');
      qc.invalidateQueries({ queryKey: ['bee-health', projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const q = queue.data?.data;
  const indicators = health.data?.data.indicators ?? [];
  const d = details.data?.data;
  const logLines = liveLogs.data?.data ?? d?.logs ?? [];
  const runtimeIndicator = indicators.find((i) => i.key === 'browser_runtime');

  const downloadReport = async (format: string) => {
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const orgId = useAppStore.getState().currentOrgId;
      const base = (import.meta.env.VITE_API_URL as string).replace(/\/$/, '');
      const res = await fetch(
        `${base}/v1/projects/${projectId}/browser/workspace-report?format=${format}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            ...(orgId ? { 'X-Org-Id': orgId } : {}),
          },
        }
      );
      if (!res.ok) throw new Error(`Report failed (${res.status})`);
      if (format === 'json') {
        const json = await res.json();
        const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
        triggerDownload(blob, 'bee-report.json');
        toast.success('JSON report downloaded');
        return;
      }
      const blob = await res.blob();
      const ext = format === 'excel' ? 'xls' : format;
      triggerDownload(blob, `bee-report.${ext}`);
      toast.success(`${format.toUpperCase()} report downloaded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Report download failed');
    }
  };

  function triggerDownload(blob: Blob, filename: string) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const reportLinks = useMemo(
    () => [
      { label: 'CSV', format: 'csv' },
      { label: 'Excel', format: 'excel' },
      { label: 'PDF', format: 'pdf' },
      { label: 'JSON', format: 'json' },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Worker Health</CardTitle>
              <CardDescription>
                Browser Runtime · Playwright · Worker · Queue · Redis · Database · Storage · Providers
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={runDiagnostics.isPending}
              onClick={() => runDiagnostics.mutate()}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Run Diagnostics
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {runtimeIndicator?.status === 'red' ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              <p className="font-medium">Browser Runtime Missing — Install Required</p>
              <p className="mt-0.5">{runtimeIndicator.detail}</p>
            </div>
          ) : null}
          {health.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 text-sm">
              {indicators.map((i) => (
                <div key={i.key} className="flex items-start gap-2 rounded-md border px-2 py-1.5">
                  <Dot status={i.status} />
                  <div>
                    <p className="font-medium leading-tight">{i.label}</p>
                    <p className="text-[10px] text-muted-foreground line-clamp-2">{i.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Queue Monitor</CardTitle>
          <CardDescription>
            Queued · Running · Paused · Waiting User · Retrying · Completed · Failed · Cancelled
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4 lg:grid-cols-5 text-sm">
          {(
            [
              ['Queued', q?.queued],
              ['Running', q?.running],
              ['Paused', q?.paused],
              ['Waiting User', q?.waitingUser],
              ['Retrying', q?.retrying],
              ['Completed', q?.completed],
              ['Failed', q?.failed],
              ['Cancelled', q?.cancelled],
              ['Avg Runtime', q?.averageRuntimeMs != null ? `${Math.round(q.averageRuntimeMs / 1000)}s` : '—'],
              ['Success Rate', q?.successRate != null ? `${q.successRate}%` : '—'],
            ] as const
          ).map(([label, val]) => (
            <div key={label}>
              <p className="text-[10px] text-muted-foreground">{label}</p>
              <p className="font-medium tabular-nums">{val ?? 0}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Bulk Retry & Reports</CardTitle>
              <CardDescription>Retry failed jobs and download execution reports</CardDescription>
            </div>
            <div className="flex flex-wrap gap-1">
              {reportLinks.map((r) => (
                <Button
                  key={r.format}
                  size="sm"
                  variant="outline"
                  onClick={() => downloadReport(r.format)}
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  {r.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 items-end">
          <Button
            size="sm"
            variant="outline"
            disabled={bulkRetry.isPending}
            onClick={() => bulkRetry.mutate({ mode: 'all_failed' })}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry All Failed
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={bulkRetry.isPending}
            onClick={() => bulkRetry.mutate({ mode: 'temporary_only' })}
          >
            Retry Temporary Failures
          </Button>
          <div className="flex gap-1 items-end">
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Retry by reason code</p>
              <input
                className="flex h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                placeholder="NAVIGATION_TIMEOUT"
                value={reasonFilter}
                onChange={(e) => setReasonFilter(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!reasonFilter.trim() || bulkRetry.isPending}
              onClick={() =>
                bulkRetry.mutate({
                  mode: 'by_reason',
                  reasonCode: reasonFilter.trim().toUpperCase(),
                })
              }
            >
              Retry by Reason
            </Button>
          </div>
          {selectedJobId && (
            <Button
              size="sm"
              variant="outline"
              disabled={bulkRetry.isPending}
              onClick={() =>
                bulkRetry.mutate({ mode: 'selected', jobIds: [selectedJobId] })
              }
            >
              Retry Selected
            </Button>
          )}
        </CardContent>
      </Card>

      {selectedJobId && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Job details ·{' '}
              {d?.failure.label ||
                statusDisplayLabel(
                  d?.job.status ?? '',
                  d?.job.error_code,
                  d?.job.error_message
                )}
            </CardTitle>
            <CardDescription>
              Failure reason · Timeline · Screenshots · Live logs · AI analysis · Retry history
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {details.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : d ? (
              <>
                <div className="rounded-md border p-3 space-y-2 text-sm">
                  <div className="flex flex-wrap gap-2 items-center">
                    <Badge className="text-[10px]">{d.failure.label}</Badge>
                    {d.job.error_code && (
                      <Badge className="text-[10px] font-mono bg-transparent">{d.job.error_code}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      Retries: {d.job.retry_count ?? 0}
                    </span>
                  </div>
                  <p>
                    <span className="text-muted-foreground">Reason: </span>
                    {d.failure.message || d.job.error_message || '—'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">AI analysis: </span>
                    {d.failure.analysis.summary}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Suggested fix: </span>
                    {d.failure.suggestedFix || d.failure.analysis.suggestedAction}
                  </p>
                  {d.failure.stack && (
                    <pre className="max-h-28 overflow-auto rounded bg-muted/40 p-2 text-[10px] whitespace-pre-wrap">
                      {d.failure.stack}
                    </pre>
                  )}
                  {Array.isArray(d.failure.retryHistory) && d.failure.retryHistory.length > 0 && (
                    <div>
                      <p className="text-xs font-medium mb-1">Retry history</p>
                      <ul className="text-xs text-muted-foreground space-y-0.5">
                        {d.failure.retryHistory.map((h, idx) => (
                          <li key={idx}>{JSON.stringify(h)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs font-medium mb-2">Execution timeline</p>
                  <ul className="space-y-1 text-sm">
                    {d.timeline.map((t) => (
                      <li key={t.stepIndex} className="flex gap-2 items-start">
                        <span className="tabular-nums text-muted-foreground w-6">
                          {t.status === 'done' ? '✓' : t.status === 'failed' ? '✗' : '·'}
                        </span>
                        <div>
                          <p className="capitalize">
                            {String(t.action).replace(/_/g, ' ')}{' '}
                            <span className="text-[10px] text-muted-foreground">{t.status}</span>
                          </p>
                          {(t.durationMs != null || t.error) && (
                            <p className="text-[10px] text-muted-foreground">
                              {t.durationMs != null ? `${t.durationMs}ms` : ''}
                              {t.error ? ` · ${t.error}` : ''}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {d.screenshots.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-2">Screenshots</p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {d.screenshots.map((s) =>
                        s.url ? (
                          <a
                            key={s.id}
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 w-36 space-y-1"
                          >
                            <img
                              src={s.url}
                              alt={s.label}
                              className="h-24 w-36 object-cover rounded border"
                            />
                            <p className="text-[10px] text-muted-foreground truncate">{s.label}</p>
                          </a>
                        ) : (
                          <div key={s.id} className="text-[10px] text-muted-foreground">
                            {s.label} (path only)
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xs font-medium mb-2">Live logs</p>
                  <div className="max-h-56 overflow-y-auto rounded border font-mono text-[11px] divide-y">
                    {logLines.length === 0 ? (
                      <p className="p-2 text-muted-foreground">No logs yet…</p>
                    ) : (
                      logLines.map((l) => (
                        <div key={l.id} className="px-2 py-1 flex gap-2">
                          <span className="text-muted-foreground shrink-0 tabular-nums">
                            {new Date(l.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </span>
                          <span
                            className={
                              l.level === 'error'
                                ? 'text-red-600'
                                : l.level === 'warn'
                                  ? 'text-amber-700'
                                  : ''
                            }
                          >
                            {l.message}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {onSelectJob && (
                  <Button size="sm" variant="ghost" onClick={() => onSelectJob(selectedJobId)}>
                    Focus job in list
                  </Button>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Unable to load job details.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
