import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Play,
  Settings2,
  Monitor,
  ScrollText,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { CurrentOpportunityBanner } from '@/components/opportunities/current-opportunity-banner';
import { useCurrentOpportunity } from '@/hooks/use-current-opportunity';
import type { SelectedOpportunity } from '@/components/opportunities/opportunity-selector';
import {
  BeeOpsPanel,
  statusDisplayLabel,
} from '@/components/browser/bee-ops-panel';

type BeeJob = {
  id: string;
  status: string;
  site_domain?: string;
  mode?: string;
  current_step_index?: number;
  created_at: string;
  opportunity_id?: string;
  error_code?: string | null;
  error_message?: string | null;
  pause_reason?: string | null;
  retry_count?: number;
  steps?: Array<{
    id: string;
    step_index: number;
    action: string;
    status: string;
    blocker?: string | null;
    detail?: Record<string, unknown>;
  }>;
};

type BeeStats = {
  running: number;
  queued: number;
  paused: number;
  needs_approval: number;
  completed: number;
  failed: number;
  blocked: number;
  watching?: number;
  auto_resumed?: number;
  completed_after_captcha?: number;
  completed_after_login?: number;
  successRate: number | null;
  avgRuntimeMs: number | null;
  etaSeconds: number;
  estimatedFinishAt?: string | null;
  current?: { website?: string; step?: string; browser?: string; queueProgress?: string };
};

type ExecutionOpportunity = {
  id: string;
  website: string;
  domain: string | null;
  title: string;
  score: number;
  opportunity_type: string;
  status: string;
  pipeline_stage?: string | null;
  readiness: 'ready' | 'in_progress' | 'needs_approval' | 'completed' | 'failed' | 'needs_domain' | 'not_ready';
  selectable: boolean;
  has_submission: boolean;
  has_content_draft: boolean;
  latest_job: { id: string; status: string; created_at: string } | null;
};

type BulkProgressItem = {
  opportunityId: string;
  website: string;
  phase: 'queued' | 'starting' | 'started' | 'failed';
  message?: string;
  jobId?: string;
};

const TABS = [
  'dashboard',
  'timeline',
  'history',
  'logs',
  'policies',
  'sessions',
  'replay',
] as const;

const READINESS_LABEL: Record<ExecutionOpportunity['readiness'], string> = {
  ready: 'Ready',
  in_progress: 'In progress',
  needs_approval: 'Needs approval',
  completed: 'Completed',
  failed: 'Failed',
  needs_domain: 'Needs domain',
  not_ready: 'Not ready',
};

export function BrowserExecutionCenterPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as (typeof TABS)[number]) || 'dashboard';
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedOppIds, setSelectedOppIds] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<BulkProgressItem[]>([]);
  const { opportunity: currentOpp, setOpportunity } = useCurrentOpportunity(projectId);

  const setTab = (t: (typeof TABS)[number]) => {
    setParams({ tab: t });
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['bee-jobs', projectId] });
    qc.invalidateQueries({ queryKey: ['bee-stats', projectId] });
    qc.invalidateQueries({ queryKey: ['bee-job', projectId] });
    qc.invalidateQueries({ queryKey: ['bee-opportunities', projectId] });
  };

  const runtime = useQuery({
    queryKey: ['browser-runtime', projectId],
    queryFn: () =>
      request<{
        data: { health: string; last_error?: string | null; launch_ok?: boolean };
      }>(`/v1/projects/${projectId}/browser/runtime`),
    enabled: !!projectId,
    refetchInterval: 10_000,
  });
  const runtimeHealthy =
    runtime.data?.data.health === 'healthy' && runtime.data?.data.launch_ok !== false;

  const stats = useQuery({
    queryKey: ['bee-stats', projectId],
    queryFn: () =>
      request<{ data: BeeStats }>(`/v1/projects/${projectId}/browser/statistics`),
    enabled: !!projectId,
    refetchInterval: 10_000,
  });

  const opportunities = useQuery({
    queryKey: ['bee-opportunities', projectId],
    queryFn: () =>
      request<{ data: ExecutionOpportunity[] }>(
        `/v1/projects/${projectId}/browser/opportunities`
      ),
    enabled: !!projectId,
    refetchInterval: 12_000,
  });

  const jobs = useQuery({
    queryKey: ['bee-jobs', projectId],
    queryFn: () => request<{ data: BeeJob[] }>(`/v1/projects/${projectId}/browser/jobs`),
    enabled: !!projectId,
    refetchInterval: 8_000,
  });

  const jobDetail = useQuery({
    queryKey: ['bee-job', projectId, selectedJobId],
    queryFn: () =>
      request<{ data: BeeJob }>(`/v1/projects/${projectId}/browser/jobs/${selectedJobId}`),
    enabled: !!projectId && !!selectedJobId,
  });

  const history = useQuery({
    queryKey: ['bee-history', projectId],
    queryFn: () => request<{ data: unknown[] }>(`/v1/projects/${projectId}/browser/history`),
    enabled: !!projectId && (tab === 'history' || tab === 'replay'),
  });

  const logs = useQuery({
    queryKey: ['bee-logs', projectId, selectedJobId],
    queryFn: () =>
      request<{ data: Array<{ id: string; level: string; message: string; created_at: string }> }>(
        `/v1/projects/${projectId}/browser/logs?jobId=${selectedJobId}`
      ),
    enabled: !!projectId && !!selectedJobId,
    refetchInterval: selectedJobId ? 2_500 : false,
  });

  const sessions = useQuery({
    queryKey: ['bee-sessions', projectId],
    queryFn: () => request<{ data: unknown[] }>(`/v1/projects/${projectId}/browser/sessions`),
    enabled: !!projectId && tab === 'sessions',
  });

  const policy = useQuery({
    queryKey: ['bee-policy', projectId],
    queryFn: () =>
      request<{
        data: {
          submission_policy: string;
          daily_goal: number;
          max_parallel_sessions: number;
          submission_speed: string;
          retry_count: number;
          cooldown_seconds: number;
          require_approval_before_submit: boolean;
          auto_resume?: boolean;
          watch_interval_ms?: number;
          max_watch_ms?: number;
          session_reuse?: boolean;
          queue_auto_continue?: boolean;
        };
      }>(`/v1/projects/${projectId}/browser/policies`),
    enabled: !!projectId && tab === 'policies',
  });

  const oppList = opportunities.data?.data ?? [];
  const selectableOpps = useMemo(
    () => oppList.filter((o) => o.selectable),
    [oppList]
  );

  const startExecutions = useMutation({
    mutationFn: async (ids: string[]) => {
      const byId = new Map(oppList.map((o) => [o.id, o]));
      setBulkProgress(
        ids.map((id) => ({
          opportunityId: id,
          website: byId.get(id)?.website ?? 'Opportunity',
          phase: 'queued',
        }))
      );

      const results: Array<{ opportunityId: string; jobId: string; status: string }> = [];
      const errors: Array<{ opportunityId: string; message: string }> = [];

      for (const opportunityId of ids) {
        setBulkProgress((prev) =>
          prev.map((p) =>
            p.opportunityId === opportunityId ? { ...p, phase: 'starting' } : p
          )
        );
        try {
          const res = await request<{
            data: BeeJob;
          }>(`/v1/projects/${projectId}/browser/executions`, {
            method: 'POST',
            body: JSON.stringify({
              opportunityId,
              mode: 'prepare',
              startImmediately: true,
            }),
          });
          results.push({
            opportunityId,
            jobId: res.data.id,
            status: res.data.status,
          });
          setBulkProgress((prev) =>
            prev.map((p) =>
              p.opportunityId === opportunityId
                ? { ...p, phase: 'started', jobId: res.data.id }
                : p
            )
          );
          if (!selectedJobId) setSelectedJobId(res.data.id);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to start';
          errors.push({ opportunityId, message });
          setBulkProgress((prev) =>
            prev.map((p) =>
              p.opportunityId === opportunityId
                ? { ...p, phase: 'failed', message }
                : p
            )
          );
        }
      }

      return { results, errors };
    },
    onSuccess: (outcome) => {
      const { results, errors } = outcome;
      setSelectedOppIds(new Set());
      invalidate();
      if (errors.length && !results.length) {
        toast.error(`All executions failed: ${errors[0]?.message ?? 'Unknown error'}`);
        return;
      }
      if (errors.length) {
        toast.error(
          `${results.length} started, ${errors.length} failed: ${errors[0]?.message ?? ''}`
        );
      } else {
        toast.success(
          results.length === 1
            ? 'Execution started'
            : `Started ${results.length} executions`
        );
      }
      if (results[0]?.jobId) {
        setSelectedJobId(results[0].jobId);
        setTab('timeline');
      }
    },
    onError: (e: Error) => toast.error(e.message || 'Could not start executions'),
  });

  const act = useMutation({
    mutationFn: ({ action, jobId }: { action: string; jobId: string }) =>
      request(`/v1/projects/${projectId}/browser/${action}`, {
        method: 'POST',
        body: JSON.stringify({ jobId }),
      }),
    onSuccess: (_, v) => {
      toast.success(`${v.action} OK`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const savePolicy = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      request(`/v1/projects/${projectId}/browser/policies`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success('Policies saved');
      qc.invalidateQueries({ queryKey: ['bee-policy', projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const s = stats.data?.data;
  const jobList = jobs.data?.data ?? [];
  const selected = jobDetail.data?.data;

  const statusBadge = useMemo(() => {
    const map: Record<string, string> = {
      needs_approval: 'bg-amber-500/15 text-amber-700',
      blocked_captcha: 'bg-red-500/15 text-red-700',
      blocked_mfa: 'bg-red-500/15 text-red-700',
      watching_captcha: 'bg-sky-500/15 text-sky-700',
      watching_login: 'bg-sky-500/15 text-sky-700',
      watching_mfa: 'bg-sky-500/15 text-sky-700',
      watching_email: 'bg-sky-500/15 text-sky-700',
      watching_phone: 'bg-sky-500/15 text-sky-700',
      ready_to_continue: 'bg-emerald-500/15 text-emerald-700',
      completed: 'bg-emerald-500/15 text-emerald-700',
      failed: 'bg-red-500/15 text-red-700',
      retry_scheduled: 'bg-violet-500/15 text-violet-700',
      awaiting_user: 'bg-amber-500/15 text-amber-700',
      ready: 'bg-emerald-500/15 text-emerald-700',
      in_progress: 'bg-sky-500/15 text-sky-700',
      needs_domain: 'bg-amber-500/15 text-amber-700',
      not_ready: 'bg-muted text-muted-foreground',
    };
    return (status: string) => map[status] ?? '';
  }, []);

  const toggleOpp = (id: string, selectable: boolean) => {
    if (!selectable) return;
    const row = (opportunities.data?.data ?? []).find((o) => o.id === id);
    setSelectedOppIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        if (row) {
          const snap: SelectedOpportunity = {
            id: row.id,
            website: row.website,
            domain: row.domain,
            title: row.title,
            score: row.score,
            opportunity_type: row.opportunity_type,
            status: row.status,
            readiness: row.readiness,
            pipeline_stage: row.pipeline_stage,
            selectable: row.selectable,
            has_submission: row.has_submission,
            has_content_draft: row.has_content_draft,
          };
          setOpportunity(snap);
        }
      }
      return next;
    });
  };

  const allSelectableSelected =
    selectableOpps.length > 0 && selectableOpps.every((o) => selectedOppIds.has(o.id));

  const toggleAll = () => {
    if (allSelectableSelected) {
      setSelectedOppIds(new Set());
      return;
    }
    setSelectedOppIds(new Set(selectableOpps.map((o) => o.id)));
  };

  const progressCounts = useMemo(() => {
    const total = bulkProgress.length;
    const started = bulkProgress.filter((p) => p.phase === 'started').length;
    const failed = bulkProgress.filter((p) => p.phase === 'failed').length;
    const active = bulkProgress.filter(
      (p) => p.phase === 'queued' || p.phase === 'starting'
    ).length;
    return { total, started, failed, active };
  }, [bulkProgress]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Browser Execution</h1>
          <p className="text-muted-foreground">
            Browser Execution Engine — approved opportunities load automatically. CAPTCHA, MFA,
            and email/phone verification always pause; watchers auto-resume after you complete them.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/projects/${projectId}/backlink-builder/browser-assistant`}>
            Browser Intelligence
          </Link>
        </Button>
      </div>

      <CurrentOpportunityBanner projectId={projectId} />
      {currentOpp ? (
        <p className="text-xs text-muted-foreground">
          Selecting an opportunity also updates the shared current website (
          <span className="font-medium text-foreground">{currentOpp.website}</span>).
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button
            key={t}
            size="sm"
            variant={tab === t ? 'default' : 'outline'}
            onClick={() => setTab(t)}
            className="capitalize"
          >
            {t}
          </Button>
        ))}
      </div>

      {tab === 'dashboard' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ['Running', s?.running],
                ['Queued', s?.queued],
                ['Watching', s?.watching],
                ['Paused', s?.paused],
                ['Auto-resumed', s?.auto_resumed],
                ['After CAPTCHA', s?.completed_after_captcha],
                ['After Login', s?.completed_after_login],
                ['Needs Approval', s?.needs_approval],
                ['Completed', s?.completed],
                ['Failed', s?.failed],
                ['Blocked', s?.blocked],
                ['Success Rate', s?.successRate != null ? `${s.successRate}%` : '—'],
              ] as const
            ).map(([label, value]) => (
              <Card key={label}>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-semibold tabular-nums">{value ?? 0}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Current</CardTitle>
              <CardDescription>
                ETA ~{Math.round((s?.etaSeconds ?? 0) / 60)} min · Avg runtime{' '}
                {s?.avgRuntimeMs ? `${Math.round(s.avgRuntimeMs / 1000)}s` : '—'}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm grid gap-2 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Website</p>
                <p className="font-medium">{s?.current?.website || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Step</p>
                <p className="font-medium">{s?.current?.step || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Browser session</p>
                <p className="font-medium truncate">{s?.current?.browser || '—'}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">Approved opportunities</CardTitle>
                  <CardDescription>
                    Loaded from this project workspace. Select sites and start execution — no manual
                    IDs required.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={
                      !runtimeHealthy ||
                      selectedOppIds.size === 0 ||
                      startExecutions.isPending ||
                      selectableOpps.length === 0
                    }
                    onClick={() => startExecutions.mutate([...selectedOppIds])}
                    title={
                      runtimeHealthy
                        ? undefined
                        : 'Browser Runtime Missing — Install Required'
                    }
                  >
                    <Play className="h-3 w-3 mr-1" />
                    Start Execution
                    {selectedOppIds.size > 0 ? ` (${selectedOppIds.size})` : ''}
                  </Button>
                </div>
              </div>
              {!runtimeHealthy ? (
                <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  <p className="font-medium">Browser Runtime Missing — Install Required</p>
                  <p className="mt-0.5">
                    {runtime.data?.data.last_error ||
                      'Administrator Action Required. Suggested Fix: Install Chromium.'}{' '}
                    <Link
                      className="underline font-medium"
                      to={`/projects/${projectId}/settings/browser-runtime`}
                    >
                      Open Browser Runtime
                    </Link>
                  </p>
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-3">
              {opportunities.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : oppList.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No approved opportunities yet. Approve items in Opportunity Queue first.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 w-10">
                          <input
                            type="checkbox"
                            aria-label="Select all ready opportunities"
                            checked={allSelectableSelected}
                            onChange={toggleAll}
                            disabled={selectableOpps.length === 0 || startExecutions.isPending}
                          />
                        </th>
                        <th className="px-3 py-2 font-medium">Website</th>
                        <th className="px-3 py-2 font-medium">Score</th>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Readiness</th>
                        <th className="px-3 py-2 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {oppList.map((opp) => {
                        const checked = selectedOppIds.has(opp.id);
                        return (
                          <tr key={opp.id} className="border-t">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                aria-label={`Select ${opp.website}`}
                                checked={checked}
                                disabled={!opp.selectable || startExecutions.isPending}
                                onChange={() => toggleOpp(opp.id, opp.selectable)}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <p className="font-medium">{opp.website}</p>
                              {opp.domain && opp.domain !== opp.website && (
                                <p className="text-xs text-muted-foreground">{opp.domain}</p>
                              )}
                            </td>
                            <td className="px-3 py-2 tabular-nums">{opp.score}</td>
                            <td className="px-3 py-2 capitalize">
                              {String(opp.opportunity_type).replace(/_/g, ' ')}
                            </td>
                            <td className="px-3 py-2">
                              <Badge className="text-[10px] capitalize">
                                {String(opp.status).replace(/_/g, ' ')}
                              </Badge>
                            </td>
                            <td className="px-3 py-2">
                              <Badge
                                className={`text-[10px] ${statusBadge(opp.readiness)}`}
                              >
                                {READINESS_LABEL[opp.readiness]}
                              </Badge>
                              {opp.latest_job && (
                                <p className="text-[10px] text-muted-foreground mt-1 capitalize">
                                  Job: {opp.latest_job.status.replace(/_/g, ' ')}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={
                                  !runtimeHealthy || !opp.selectable || startExecutions.isPending
                                }
                                title={
                                  runtimeHealthy
                                    ? undefined
                                    : 'Browser Runtime Missing — Install Required'
                                }
                                onClick={() => startExecutions.mutate([opp.id])}
                              >
                                <Play className="h-3 w-3 mr-1" /> Start
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {(startExecutions.isPending || progressCounts.total > 0) && (
                <div className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <p className="font-medium">Execution progress</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {progressCounts.started + progressCounts.failed}/{progressCounts.total}
                      {progressCounts.active > 0 ? ' · running…' : ''}
                    </p>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{
                        width:
                          progressCounts.total === 0
                            ? '0%'
                            : `${Math.round(
                                ((progressCounts.started + progressCounts.failed) /
                                  progressCounts.total) *
                                  100
                              )}%`,
                      }}
                    />
                  </div>
                  <ul className="space-y-1 max-h-40 overflow-auto text-xs">
                    {bulkProgress.map((item) => (
                      <li
                        key={item.opportunityId}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="truncate">{item.website}</span>
                        <span
                          className={
                            item.phase === 'failed'
                              ? 'text-red-600'
                              : item.phase === 'started'
                                ? 'text-emerald-700'
                                : 'text-muted-foreground'
                          }
                        >
                          {item.phase === 'failed'
                            ? item.message || 'Failed'
                            : item.phase === 'started'
                              ? 'Started'
                              : item.phase === 'starting'
                                ? 'Starting…'
                                : 'Queued'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {(tab === 'dashboard' || tab === 'timeline' || tab === 'logs') && (
        <BeeOpsPanel
          projectId={projectId}
          selectedJobId={selectedJobId}
          onSelectJob={setSelectedJobId}
        />
      )}

      {(tab === 'dashboard' || tab === 'timeline' || tab === 'logs' || tab === 'replay') && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Jobs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {jobs.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : jobList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No execution jobs yet.</p>
            ) : (
              jobList.map((j) => (
                <div
                  key={j.id}
                  className={`rounded-md border p-3 space-y-2 ${selectedJobId === j.id ? 'ring-1 ring-primary' : ''}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      className="text-left"
                      onClick={() => {
                        setSelectedJobId(j.id);
                        if (tab === 'dashboard') setTab('timeline');
                      }}
                    >
                      <p className="text-sm font-medium">{j.site_domain ?? 'Execution job'}</p>
                      <p className="text-xs text-muted-foreground">
                        {j.mode} · {new Date(j.created_at).toLocaleString()}
                      </p>
                    </button>
                    <Badge
                      className={`text-[10px] capitalize ${statusBadge(j.status)}`}
                      title={
                        j.status === 'failed'
                          ? `${j.error_code ?? ''} ${j.error_message ?? ''}`.trim() ||
                            'Failed'
                          : j.pause_reason
                            ? `Paused: ${j.pause_reason}`
                            : statusDisplayLabel(j.status, j.error_code, j.error_message)
                      }
                    >
                      {statusDisplayLabel(j.status, j.error_code, j.error_message)}
                    </Badge>
                  </div>
                  {j.status === 'failed' && (j.error_message || j.error_code) && (
                    <p className="text-xs text-destructive">
                      {j.error_message || j.error_code}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-1">
                    <Button
                      size="sm"
                      disabled={!runtimeHealthy || act.isPending}
                      title={
                        runtimeHealthy ? undefined : 'Browser Runtime Missing — Install Required'
                      }
                      onClick={() => act.mutate({ action: 'start', jobId: j.id })}
                    >
                      <Play className="h-3 w-3 mr-1" /> Start Execution
                    </Button>
                    <details className="relative">
                      <summary className="list-none cursor-pointer inline-flex h-8 items-center rounded-md border border-input px-3 text-xs font-medium hover:bg-accent">
                        More ▾
                      </summary>
                      <div className="absolute right-0 z-20 mt-1 min-w-[160px] rounded-lg border bg-card p-1 shadow-md">
                        {(
                          [
                            ['pause', 'Pause'],
                            ['resume', 'Resume'],
                            ['approve', 'Approve'],
                            ['retry', 'Retry'],
                            ['cancel', 'Cancel'],
                            ...(tab === 'replay' ? [['replay', 'Replay'] as const] : []),
                          ] as const
                        ).map(([action, label]) => (
                          <button
                            key={action}
                            type="button"
                            className="flex w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
                            onClick={() => act.mutate({ action, jobId: j.id })}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </details>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'timeline' && selected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Execution timeline</CardTitle>
            <CardDescription>{selected.site_domain}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(selected.steps ?? []).map((step) => (
              <div key={step.id} className="flex items-start gap-3 rounded-md border px-3 py-2 text-sm">
                <span className="text-xs text-muted-foreground w-6">{step.step_index}</span>
                <div className="flex-1">
                  <p className="font-medium capitalize">{step.action.replace(/_/g, ' ')}</p>
                  {step.blocker && (
                    <p className="text-xs text-amber-700">
                      Gate: {step.blocker} — never bypassed
                    </p>
                  )}
                </div>
                <Badge className="text-[10px] capitalize">{step.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === 'logs' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ScrollText className="h-4 w-4" /> Logs
            </CardTitle>
            <CardDescription>Passwords and tokens are redacted</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 max-h-[420px] overflow-auto font-mono text-xs">
            {!selectedJobId ? (
              <p className="text-muted-foreground">Select a job first.</p>
            ) : logs.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              (logs.data?.data ?? []).map((l) => (
                <p key={l.id}>
                  <span className="text-muted-foreground">
                    {new Date(l.created_at).toLocaleTimeString()}
                  </span>{' '}
                  [{l.level}] {l.message}
                </p>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'history' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Execution history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(history.data?.data as Array<Record<string, unknown>> | undefined)?.map((h) => (
              <div key={String(h.id)} className="rounded-md border px-3 py-2 text-sm flex justify-between">
                <div>
                  <p className="font-medium">{String(h.domain ?? 'Site')}</p>
                  <p className="text-xs text-muted-foreground capitalize">{String(h.result)}</p>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(String(h.created_at)).toLocaleString()}
                </span>
              </div>
            )) ?? <p className="text-sm text-muted-foreground">No history yet.</p>}
          </CardContent>
        </Card>
      )}

      {tab === 'sessions' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Monitor className="h-4 w-4" /> Session manager
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(sessions.data?.data as Array<Record<string, unknown>> | undefined)?.map((sess) => (
              <div key={String(sess.id)} className="rounded-md border px-3 py-2 text-sm flex justify-between">
                <div>
                  <p className="font-medium">{String(sess.site_domain ?? sess.profile_key)}</p>
                  <p className="text-xs text-muted-foreground">
                    {String(sess.mode)} · health {String(sess.health_status)}
                  </p>
                </div>
                <Badge className="text-[10px] capitalize">{String(sess.status)}</Badge>
              </div>
            )) ?? <p className="text-sm text-muted-foreground">No sessions.</p>}
          </CardContent>
        </Card>
      )}

      {tab === 'policies' && policy.data?.data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-4 w-4" /> Execution policies
            </CardTitle>
            <CardDescription>
              Default is Always Ask. Auto-resume watches for user-completed gates — never bypasses
              CAPTCHA/MFA/verification.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Submission policy</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                defaultValue={policy.data.data.submission_policy}
                id="pol-sub"
              >
                <option value="always_ask">Always Ask</option>
                <option value="trusted_websites">Trusted Websites</option>
                <option value="automatic_eligible">Automatic Eligible</option>
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="daily">Daily goal</Label>
                <Input id="daily" type="number" defaultValue={policy.data.data.daily_goal} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="parallel">Max parallel sessions</Label>
                <Input
                  id="parallel"
                  type="number"
                  defaultValue={policy.data.data.max_parallel_sessions}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="speed">Submission speed</Label>
                <select
                  id="speed"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  defaultValue={policy.data.data.submission_speed}
                >
                  <option value="slow">Slow</option>
                  <option value="normal">Normal</option>
                  <option value="fast">Fast</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="retry">Retry count</Label>
                <Input id="retry" type="number" defaultValue={policy.data.data.retry_count} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="watch-interval">Watch interval (ms)</Label>
                <Input
                  id="watch-interval"
                  type="number"
                  defaultValue={policy.data.data.watch_interval_ms ?? 2000}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="max-watch">Max watch time (ms)</Label>
                <Input
                  id="max-watch"
                  type="number"
                  defaultValue={policy.data.data.max_watch_ms ?? 1800000}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  id="auto-resume"
                  type="checkbox"
                  defaultChecked={policy.data.data.auto_resume !== false}
                />
                Auto Resume
              </label>
              <label className="flex items-center gap-2">
                <input
                  id="session-reuse"
                  type="checkbox"
                  defaultChecked={policy.data.data.session_reuse !== false}
                />
                Session Reuse
              </label>
              <label className="flex items-center gap-2">
                <input
                  id="queue-continue"
                  type="checkbox"
                  defaultChecked={policy.data.data.queue_auto_continue !== false}
                />
                Queue Auto Continue
              </label>
            </div>
            <Button
              onClick={() => {
                const submission_policy = (document.getElementById('pol-sub') as HTMLSelectElement)
                  .value;
                savePolicy.mutate({
                  submission_policy,
                  daily_goal: Number((document.getElementById('daily') as HTMLInputElement).value),
                  max_parallel_sessions: Number(
                    (document.getElementById('parallel') as HTMLInputElement).value
                  ),
                  submission_speed: (document.getElementById('speed') as HTMLSelectElement).value,
                  retry_count: Number((document.getElementById('retry') as HTMLInputElement).value),
                  watch_interval_ms: Number(
                    (document.getElementById('watch-interval') as HTMLInputElement).value
                  ),
                  max_watch_ms: Number(
                    (document.getElementById('max-watch') as HTMLInputElement).value
                  ),
                  auto_resume: (document.getElementById('auto-resume') as HTMLInputElement).checked,
                  session_reuse: (document.getElementById('session-reuse') as HTMLInputElement)
                    .checked,
                  queue_auto_continue: (
                    document.getElementById('queue-continue') as HTMLInputElement
                  ).checked,
                  require_approval_before_submit: submission_policy !== 'automatic_eligible',
                });
              }}
            >
              Save policies
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
