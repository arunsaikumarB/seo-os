import { useMemo, useState, Fragment } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Play,
  Pause,
  Square,
  RotateCcw,
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
import { useCurrentOpportunity } from '@/hooks/use-current-opportunity';
import type { SelectedOpportunity } from '@/components/opportunities/opportunity-selector';
import {
  BeeOpsPanel,
  statusDisplayLabel,
} from '@/components/browser/bee-ops-panel';
import { formatEta, pipelineStagesForJob } from '@/lib/bee-execution-ui';
import {
  useInterventions,
} from '@/components/browser/needs-your-action-queue';
import { openInterventionWindow } from '@/lib/intervention-window';
import { AiLoadingState } from '@/components/workflow/ai-activity-card';
import { HumanInterventionQueue } from '@/components/browser/human-intervention-queue';
import { ExecutionLiveFeed } from '@/components/browser/execution-live-feed';
import { WebsiteExecutionTimeline } from '@/components/browser/website-execution-timeline';
import { useExecutionSummary } from '@/hooks/use-execution-summary';
import { explainFailure, explainWaitingHuman } from '@/hooks/use-execution-summary';

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
  failedToStart?: number;
  blocked: number;
  cancelled?: number;
  watching?: number;
  submitted?: number;
  ready?: number;
  /** Phase 5.5 — CSM count(status == Ready) */
  submissionReady?: number;
  handoff?: {
    generatedPackages?: number;
    submissionReady?: number;
    blocked?: number;
    blockers?: Record<string, number>;
    ok?: boolean;
    emptyState?: { kind: string; message: string } | null;
    conservationLeft?: number;
    conservationRight?: number;
  } | null;
  needsYou?: number;
  skipped?: number;
  aiSubmitted?: number;
  waitingApproval?: number;
  waitingVerification?: number;
  waitingLogin?: number;
  waitingMfa?: number;
  retrying?: number;
  successRate: number | null;
  avgRuntimeMs: number | null;
  avgSubmissionMs?: number | null;
  etaSeconds: number;
  estimatedFinishAt?: string | null;
  estimatedApprovalTime?: string;
  workerUsage?: string;
  maxParallelSessions?: number;
  activeWorkerCount?: number;
  totalJobs?: number;
  completedJobs?: number;
  remainingJobs?: number;
  progressPercent?: number;
  executionComplete?: boolean;
  campaignState?: string;
  campaignIsRunning?: boolean;
  aiStatusLine?: string;
  workers?: Array<{
    workerId: number;
    status: 'idle' | 'busy';
    website: string | null;
    step: string | null;
    elapsedMs: number;
    etaMs: number | null;
  }>;
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
  readiness: string;
  rowStatus?: string;
  error_message?: string | null;
  selectable: boolean;
  has_submission: boolean;
  has_content_draft: boolean;
  latest_job: {
    id: string;
    status: string;
    created_at: string;
    disposition?: string | null;
    error_code?: string | null;
    error_message?: string | null;
  } | null;
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

const ROW_STATUS_LABEL: Record<string, string> = {
  Ready: 'Submission Ready',
  Starting: 'Opening Website',
  Queued: 'Queued',
  Running: 'Running',
  'Waiting Human': 'Waiting Human',
  Completed: 'Completed',
  Submitted: 'Completed',
  Verified: 'Verified',
  Failed: 'Failed',
  'Failed to Start': 'Failed to Start',
  Skipped: 'Skipped',
  Deleted: 'Deleted',
  ready: 'Submission Ready',
  starting: 'Opening Website',
  running: 'Running',
  waiting_human: 'Waiting Human',
  completed: 'Completed',
  verified: 'Verified',
  failed: 'Failed',
  failed_to_start: 'Failed to Start',
  skipped: 'Skipped',
  deleted: 'Deleted',
  in_progress: 'Opening Website',
  needs_approval: 'Waiting Human',
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showWebsiteDetails, setShowWebsiteDetails] = useState(false);
  const [expandedOppId, setExpandedOppId] = useState<string | null>(null);
  const { setOpportunity } = useCurrentOpportunity(projectId);

  const setTab = (t: (typeof TABS)[number]) => {
    setParams({ tab: t });
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['bee-jobs', projectId] });
    qc.invalidateQueries({ queryKey: ['bee-stats', projectId] });
    qc.invalidateQueries({ queryKey: ['execution-summary', projectId] });
    qc.invalidateQueries({ queryKey: ['bee-execution-progress', projectId] });
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
    queryKey: ['execution-summary', projectId],
    queryFn: async () => {
      const res = await request<{ data: BeeStats }>(
        `/v1/projects/${projectId}/browser/statistics`
      );
      return res;
    },
    enabled: !!projectId,
    refetchInterval: 1_500,
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
    refetchInterval: 1_000,
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
          pause_for_login?: boolean;
          pause_for_captcha?: boolean;
          pause_for_email_verify?: boolean;
          auto_skip_login?: boolean;
          auto_skip_captcha?: boolean;
          never_ask_login?: boolean;
        };
      }>(`/v1/projects/${projectId}/browser/policies`),
    enabled: !!projectId,
    refetchInterval: 30_000,
  });

  const oppList = opportunities.data?.data ?? [];
  const selectableOpps = useMemo(
    () => oppList.filter((o) => o.selectable),
    [oppList]
  );

  const startExecutions = useMutation({
    mutationFn: async (ids: string[]) => {
      // Phase 6.3.2 — ensure + drain first (idempotent; recovers Queued idle)
      try {
        await request(`/v1/projects/${projectId}/browser/executions/ensure-ready`, {
          method: 'POST',
          body: JSON.stringify({ startImmediately: true }),
        });
      } catch {
        /* continue with per-id starts */
      }

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
          // Already has an active job — treat as ok (Phase 6 uniqueness)
          if (/already|active job|duplicate/i.test(message)) {
            setBulkProgress((prev) =>
              prev.map((p) =>
                p.opportunityId === opportunityId ? { ...p, phase: 'started' } : p
              )
            );
            continue;
          }
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
        toast.error(
          `Execution failed before submission began. ${errors[0]?.message ?? 'Failed to start'}`
        );
        return;
      }
      if (errors.length) {
        toast.error(
          `${results.length} started, ${errors.length} failed to start: ${errors[0]?.message ?? ''}`
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
      }
    },
    onError: (e: Error) =>
      toast.error(e.message || 'Execution failed before submission began.'),
  });

  const campaignControl = useMutation({
    mutationFn: (action: 'pause' | 'resume' | 'stop' | 'retry_failed') => {
      if (action === 'retry_failed') {
        return request(`/v1/projects/${projectId}/browser/retry/bulk`, {
          method: 'POST',
          body: JSON.stringify({ mode: 'all_failed' }),
        });
      }
      return request(`/v1/projects/${projectId}/browser/campaign/${action}`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
    },
    onSuccess: (_, action) => {
      toast.success(
        action === 'pause'
          ? 'Campaign paused'
          : action === 'resume'
            ? 'Campaign resumed'
            : action === 'stop'
              ? 'Campaign stopped'
              : 'Retrying failed jobs'
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
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
    const waitingUser = 'bg-amber-500/15 text-amber-800';
    const map: Record<string, string> = {
      Ready: 'bg-emerald-500/15 text-emerald-700',
      Starting: 'bg-sky-500/15 text-sky-700',
      Queued: 'bg-sky-500/15 text-sky-700',
      Running: 'bg-sky-500/15 text-sky-700',
      'Waiting Human': waitingUser,
      Completed: 'bg-emerald-500/15 text-emerald-700',
      Submitted: 'bg-emerald-500/15 text-emerald-700',
      Verified: 'bg-emerald-500/15 text-emerald-700',
      Failed: 'bg-red-500/15 text-red-700',
      'Failed to Start': 'bg-red-500/15 text-red-700',
      Skipped: 'bg-muted text-muted-foreground',
      Deleted: 'bg-muted text-muted-foreground',
      ready: 'bg-emerald-500/15 text-emerald-700',
      starting: 'bg-sky-500/15 text-sky-700',
      running: 'bg-sky-500/15 text-sky-700',
      waiting_human: waitingUser,
      completed: 'bg-emerald-500/15 text-emerald-700',
      verified: 'bg-emerald-500/15 text-emerald-700',
      failed: 'bg-red-500/15 text-red-700',
      failed_to_start: 'bg-red-500/15 text-red-700',
      skipped: 'bg-muted text-muted-foreground',
      in_progress: 'bg-sky-500/15 text-sky-700',
      needs_approval: waitingUser,
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

  const interventions = useInterventions(projectId);
  const actionItems = interventions.data?.data.items ?? [];
  const execSummary = useExecutionSummary(projectId, 1_500);
  const sum = execSummary.data;

  /** Phase 4.7 — always from Execution Summary (never local recalculation) */
  const progressPercent = Math.round(sum?.progressPercent ?? s?.progressPercent ?? 0);
  const totalJobs = sum?.total ?? s?.totalJobs ?? 0;
  const completedJobs = sum?.completed ?? s?.completedJobs ?? 0;
  const remainingJobs = sum?.remaining ?? s?.remainingJobs ?? 0;
  const campaignState = sum?.campaignState ?? s?.campaignState ?? 'Idle';
  const campaignIsRunning = Boolean(
    (sum?.running ?? 0) > 0 || s?.campaignIsRunning || campaignState === 'Running'
  );
  const campaignControlsVisible =
    campaignIsRunning ||
    campaignState === 'Starting' ||
    campaignState === 'Waiting Human' ||
    campaignState === 'Paused';
  const showFailedToStart =
    campaignState === 'Failed To Start' || (s?.failedToStart ?? 0) > 0;
  const maxWorkers =
    s?.maxParallelSessions ?? policy.data?.data.max_parallel_sessions ?? 0;
  const workerSlots =
    s?.workers?.length === maxWorkers && maxWorkers > 0
      ? s.workers
      : Array.from({ length: Math.max(0, maxWorkers) }, (_, i) => {
          const fromApi = s?.workers?.[i];
          return (
            fromApi ?? {
              workerId: i + 1,
              status: 'idle' as const,
              website: null,
              step: null,
              elapsedMs: 0,
              etaMs: null,
            }
          );
        });
  const showExecutionSummary = Boolean(
    (sum?.executionComplete || s?.executionComplete) &&
      (sum?.remaining ?? remainingJobs ?? 0) === 0 &&
      (sum?.running ?? 0) === 0 &&
      (sum?.waitingHuman ?? 0) === 0 &&
      (sum?.queued ?? s?.queued ?? 0) === 0
  );

  /** Phase 5.5 — CSM Submission Ready (shared selector via statistics.ready / submissionReady) */
  const submissionReady = s?.submissionReady ?? s?.ready ?? 0;
  const handoff = s?.handoff ?? null;
  const unsupportedBlocked = Number(handoff?.blockers?.unsupported ?? 0);
  const expectedHumanActions = Math.min(
    submissionReady,
    Number(handoff?.blockers?.needs_review ?? 0) >= 0
      ? Math.max(1, Math.round(submissionReady * 0.15))
      : 0
  );
  const estMinutes =
    submissionReady > 0
      ? Math.max(1, Math.ceil((submissionReady * 2) / Math.max(1, maxWorkers || 4)))
      : 0;
  const emptyMsg = handoff?.emptyState?.message ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Submit Backlinks</h1>
        <p className="text-muted-foreground">
          AI submits automatically. When a site needs you, SEO OS hands you one task at a time.
        </p>
      </div>

      {showAdvanced ? (
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
      ) : null}

      {tab === 'dashboard' && (
        <>
          {stats.isLoading ? (
            <AiLoadingState message="AI is preparing submissions…" />
          ) : null}

          {/* Phase 4.6 — task experience first (AI Progress + one card), not status tables */}
          <HumanInterventionQueue
            projectId={projectId}
            campaignActive={
              campaignIsRunning ||
              campaignState === 'Starting' ||
              campaignState === 'Waiting Human' ||
              campaignState === 'Paused' ||
              totalJobs > 0 ||
              selectableOpps.length > 0
            }
          />

          <ExecutionLiveFeed projectId={projectId} />

          {showFailedToStart && !campaignIsRunning && campaignState !== 'Starting' ? (
            <Card className="rounded-2xl border-red-500/30 bg-red-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Failed to Start</CardTitle>
                <CardDescription>
                  {s?.aiStatusLine ??
                    'Execution failed before submission began.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  size="sm"
                  disabled={
                    !runtimeHealthy ||
                    selectedOppIds.size === 0 ||
                    startExecutions.isPending
                  }
                  onClick={() => startExecutions.mutate([...selectedOppIds])}
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Retry
                  {selectedOppIds.size > 0 ? ` (${selectedOppIds.size})` : ''}
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {campaignIsRunning ||
          campaignState === 'Starting' ||
          campaignState === 'Waiting Human' ||
          campaignState === 'Paused' ? (
            <Card className="rounded-2xl border-border/40">
              <CardContent className="pt-5 space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{sum?.aiStatusLine ?? s?.aiStatusLine ?? 'Submitting backlinks'}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Progress {progressPercent}% · Completed {completedJobs} · Running{' '}
                      {sum?.running ?? s?.running ?? 0} · Waiting Human{' '}
                      {sum?.waitingHuman ?? actionItems.length} · Remaining {remainingJobs}
                    </p>
                  </div>
                  {sum?.etaSeconds || s?.etaSeconds ? (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      ETA {formatEta(sum?.etaSeconds || s?.etaSeconds || 0)}
                    </p>
                  ) : null}
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          ) : !showFailedToStart && !showExecutionSummary && submissionReady > 0 ? (
            <Card className="rounded-2xl border-border/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Campaign Ready</CardTitle>
                <CardDescription>
                  {submissionReady} website{submissionReady === 1 ? '' : 's'} · Submission Ready
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-2 sm:grid-cols-2">
                  <p>
                    Estimated Time:{' '}
                    <span className="font-medium tabular-nums">{estMinutes} minutes</span>
                    <span className="text-muted-foreground text-xs"> (estimate)</span>
                  </p>
                  <p>
                    Expected Human Actions:{' '}
                    <span className="font-medium tabular-nums">{expectedHumanActions}</span>
                  </p>
                  <p>
                    Supported:{' '}
                    <span className="font-medium tabular-nums">{submissionReady}</span>
                  </p>
                  <p>
                    Unsupported:{' '}
                    <span className="font-medium tabular-nums">{unsupportedBlocked}</span>
                    {unsupportedBlocked > 0 ? (
                      <span className="text-muted-foreground text-xs">
                        {' '}
                        ({unsupportedBlocked} unsupported, excluded)
                      </span>
                    ) : null}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={
                    !runtimeHealthy ||
                    selectableOpps.length === 0 ||
                    startExecutions.isPending
                  }
                  onClick={() => {
                    const ids =
                      selectedOppIds.size > 0
                        ? [...selectedOppIds]
                        : selectableOpps.map((o) => o.id);
                    if (ids.length) startExecutions.mutate(ids);
                  }}
                >
                  <Play className="h-3 w-3 mr-1" />
                  Start Submission
                </Button>
              </CardContent>
            </Card>
          ) : !showFailedToStart && !showExecutionSummary ? (
            <Card className="rounded-2xl border-border/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Submission Ready</CardTitle>
                <CardDescription>
                  {emptyMsg ??
                    'No packages are Submission Ready yet. Generate content first, or wait for quality review.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {handoff?.emptyState?.kind === 'no_packages' ||
                handoff?.emptyState?.kind === 'generation_running' ? (
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/projects/${projectId}/backlink-builder/automation`}>
                      Continue → Generate
                    </Link>
                  </Button>
                ) : null}
                {handoff?.emptyState?.kind === 'needs_review' ||
                handoff?.emptyState?.kind === 'quality_failed' ? (
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/projects/${projectId}/backlink-builder/automation`}>Review →</Link>
                  </Button>
                ) : null}
                {handoff?.emptyState?.kind === 'all_submitted' ? (
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/projects/${projectId}/backlink-builder/track-results`}>
                      Continue → Results
                    </Link>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {showAdvanced ? (
            <Card className="rounded-2xl border-border/40 border-dashed">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Intervention preferences</CardTitle>
                <CardDescription>
                  Control which gates pause for you vs skip automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
                {(
                  [
                    ['pause_for_login', 'Pause for Login'],
                    ['pause_for_captcha', 'Pause for CAPTCHA'],
                    ['pause_for_email_verify', 'Pause for Email Verification'],
                    ['auto_skip_login', 'Automatically Skip Login Sites'],
                    ['auto_skip_captcha', 'Automatically Skip CAPTCHA Sites'],
                    ['never_ask_login', 'Never Ask Again for Login Sites'],
                    [
                      'auto_publish_automatable',
                      'Auto-publish automatable links (off by default — prefer Assisted Manual)',
                    ],
                  ] as const
                ).map(([key, label]) => {
                  const checked = Boolean(
                    (policy.data?.data as Record<string, unknown> | undefined)?.[key] ??
                      (key.startsWith('pause_') ? true : false)
                  );
                  return (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={savePolicy.isPending || policy.isLoading}
                        onChange={(e) =>
                          savePolicy.mutate({ [key]: e.target.checked })
                        }
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </CardContent>
            </Card>
          ) : null}

          {showAdvanced ? (
            <Card className="border-dashed">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Technical · workers & queues</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                {workerSlots.map((w) => (
                  <div key={w.workerId} className="rounded-md border px-3 py-2">
                    <p className="font-medium">Slot {w.workerId}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{w.website || '—'}</p>
                    <p className="text-xs">{w.step || 'Idle'}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {showAdvanced ? (
            <Card className="border-dashed">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Status snapshot (support)</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6 text-sm">
                {(
                  [
                    ['Submission Ready', s?.submissionReady ?? s?.ready ?? 0],
                    ['Running', s?.running ?? 0],
                    ['Submitted', s?.aiSubmitted ?? s?.submitted ?? completedJobs],
                    ['Needs You', s?.needsYou ?? actionItems.length],
                    ['Skipped', s?.skipped ?? 0],
                    ['Failed', s?.failed ?? 0],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-lg font-semibold tabular-nums">{value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {showAdvanced ? (
            <Card className="border-dashed">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Website status table (support)</CardTitle>
                <CardDescription>Current Status and Detail — support engineers only</CardDescription>
              </CardHeader>
              <CardContent>
                {oppList.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No websites.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">Website</th>
                          <th className="px-3 py-2 font-medium">Current Status</th>
                          <th className="px-3 py-2 font-medium">Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {oppList.map((opp) => {
                          const statusKey = opp.rowStatus ?? opp.readiness;
                          const statusLabel = ROW_STATUS_LABEL[statusKey] ?? statusKey;
                          return (
                            <tr key={opp.id} className="border-t">
                              <td className="px-3 py-2 font-medium">{opp.website}</td>
                              <td className="px-3 py-2">
                                <Badge className={`text-[10px] ${statusBadge(statusKey)}`}>
                                  {statusLabel}
                                </Badge>
                              </td>
                              <td className="px-3 py-2 text-xs text-muted-foreground max-w-[240px] truncate">
                                {statusKey === 'Failed to Start' || statusKey === 'failed_to_start'
                                  ? opp.error_message ||
                                    opp.latest_job?.error_message ||
                                    'Failed to start'
                                  : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">Campaign websites</CardTitle>
                  <CardDescription>
                    {totalJobs > 0
                      ? 'Live counts from the Execution Summary — expand only when you need the list.'
                      : 'Select sites and start submission — AI handles the rest.'}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  {campaignControlsVisible ? (
                    <>
                      {campaignState === 'Paused' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={campaignControl.isPending}
                          onClick={() => campaignControl.mutate('resume')}
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Resume
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={campaignControl.isPending}
                          onClick={() => campaignControl.mutate('pause')}
                        >
                          <Pause className="h-3 w-3 mr-1" />
                          Pause
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={campaignControl.isPending}
                        onClick={() => campaignControl.mutate('stop')}
                      >
                        <Square className="h-3 w-3 mr-1" />
                        Stop
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          campaignControl.isPending ||
                          ((s?.failed ?? 0) === 0 && (s?.failedToStart ?? 0) === 0)
                        }
                        onClick={() => campaignControl.mutate('retry_failed')}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Retry Failed
                      </Button>
                    </>
                  ) : (
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
                      {showFailedToStart || (s?.failedToStart ?? 0) > 0 ? (
                        <RotateCcw className="h-3 w-3 mr-1" />
                      ) : (
                        <Play className="h-3 w-3 mr-1" />
                      )}
                      {showFailedToStart || (s?.failedToStart ?? 0) > 0
                        ? 'Retry'
                        : 'Start Submission'}
                      {selectedOppIds.size > 0 ? ` (${selectedOppIds.size})` : ''}
                    </Button>
                  )}
                </div>
              </div>
              {!runtimeHealthy ? (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <p className="font-medium">Browser setup needed</p>
                  <p className="mt-0.5">
                    Chromium is not launchable on the API worker — this is a missing browser
                    runtime, not a stuck submission queue.{' '}
                    <button
                      type="button"
                      className="underline font-medium"
                      onClick={() => setShowAdvanced(true)}
                    >
                      Technical details
                    </button>
                  </p>
                  {runtime.data?.data.last_error ? (
                    <p className="mt-1 font-mono text-[11px] break-all text-amber-950/80">
                      {runtime.data.data.last_error}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-3">
              {opportunities.isLoading ? (
                <AiLoadingState message="AI is loading approved websites…" />
              ) : oppList.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No approved websites yet. Approve items in AI Review first.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(
                      [
                        ['Running', sum?.running ?? s?.running ?? 0],
                        ['Completed', completedJobs],
                        ['Waiting Human', sum?.waitingHuman ?? actionItems.length],
                        ['Remaining', remainingJobs],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label}>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-xl font-semibold tabular-nums">{value}</p>
                      </div>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowWebsiteDetails((v) => !v)}
                  >
                    {showWebsiteDetails ? 'Hide Details' : 'View Details'}
                  </Button>
                  {showWebsiteDetails ? (
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
                            <th className="px-3 py-2 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {oppList.map((opp) => {
                            const checked = selectedOppIds.has(opp.id);
                            const waiting = actionItems.find(
                              (a) =>
                                a.website === opp.website ||
                                (opp.domain && a.website.includes(opp.domain))
                            );
                            const statusKey = waiting
                              ? 'Waiting Human'
                              : (opp.rowStatus ?? opp.readiness);
                            const statusLabel = ROW_STATUS_LABEL[statusKey] ?? statusKey;
                            const fail = explainFailure(
                              opp.latest_job?.error_code,
                              opp.error_message || opp.latest_job?.error_message
                            );
                            const wait = waiting
                              ? explainWaitingHuman(waiting.gate, waiting.reason)
                              : null;
                            return (
                              <Fragment key={opp.id}>
                              <tr className="border-t">
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
                                  <button
                                    type="button"
                                    className="text-left w-full"
                                    onClick={() =>
                                      setExpandedOppId((id) => (id === opp.id ? null : opp.id))
                                    }
                                  >
                                    <p className="font-medium">{opp.website}</p>
                                    {wait ? (
                                      <p className="text-[11px] text-muted-foreground mt-0.5">
                                        {wait.title} — {wait.detail}
                                        {waiting?.pausedUrl ? (
                                          <>
                                            <br />
                                            Current URL · {waiting.pausedUrl}
                                          </>
                                        ) : null}
                                      </p>
                                    ) : statusKey === 'Failed' ||
                                      statusKey === 'failed' ||
                                      statusKey === 'Failed to Start' ? (
                                      <p className="text-[11px] text-muted-foreground mt-0.5">
                                        {fail.title} — {fail.detail}
                                        {fail.retry ? ' · Retry Available' : ''}
                                        {fail.needsHuman ? ' · Needs Human' : ''}
                                      </p>
                                    ) : (
                                      <p className="text-[11px] text-muted-foreground mt-0.5">
                                        {expandedOppId === opp.id
                                          ? 'Hide timeline'
                                          : 'Show timeline'}
                                      </p>
                                    )}
                                  </button>
                                </td>
                                <td className="px-3 py-2">
                                  <Badge className={`text-[10px] ${statusBadge(statusKey)}`}>
                                    {statusLabel}
                                  </Badge>
                                </td>
                              </tr>
                              {expandedOppId === opp.id ? (
                                <tr className="border-t bg-muted/10">
                                  <td colSpan={3} className="px-3 py-2">
                                    <WebsiteExecutionTimeline
                                      projectId={projectId}
                                      jobId={opp.latest_job?.id}
                                      status={opp.latest_job?.status ?? statusKey}
                                      createdAt={opp.latest_job?.created_at}
                                      failed={
                                        statusKey === 'Failed' ||
                                        statusKey === 'failed' ||
                                        statusKey === 'Failed to Start'
                                      }
                                    />
                                  </td>
                                </tr>
                              ) : null}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </>
              )}

              {(startExecutions.isPending || progressCounts.total > 0) &&
              !(s?.totalJobs && s.totalJobs > 0) ? (
                <div className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <p className="font-medium">Opening websites…</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {progressCounts.started + progressCounts.failed}/{progressCounts.total}
                    </p>
                  </div>
                  <ul className="space-y-1 max-h-32 overflow-auto text-xs">
                    {bulkProgress.map((item) => (
                      <li
                        key={item.opportunityId}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="truncate">{item.website}</span>
                        <span className="text-muted-foreground">
                          {item.phase === 'failed'
                            ? item.message || 'Failed'
                            : item.phase === 'started'
                              ? 'Queued'
                              : item.phase === 'starting'
                                ? 'Opening Website…'
                                : 'Queued'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {showExecutionSummary ? (
            <Card className="border-emerald-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Campaign Finished</CardTitle>
                <CardDescription>
                  Submitted {completedJobs} · Waiting Human{' '}
                  {sum?.waitingHuman ?? 0} · Skipped {sum?.skipped ?? s?.skipped ?? 0} · Failed{' '}
                  {sum?.failed ?? s?.failed ?? 0}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Estimated Verification Time ·{' '}
                  {sum?.estimatedVerificationTime ?? s?.estimatedApprovalTime ?? '24 hours'}
                </p>
                <Button asChild size="sm">
                  <Link to={`/projects/${projectId}/backlink-builder/track-results`}>
                    Continue · Track Results
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}

      <div>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? 'Hide' : 'Show'} Advanced Tools
        </Button>
      </div>

      {showAdvanced && (tab === 'dashboard' || tab === 'timeline' || tab === 'logs' || tab === 'replay') && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Active submissions</CardTitle>
            <CardDescription>
              {completedJobs}/{totalJobs} finished
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {jobs.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : jobList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No execution jobs yet.</p>
            ) : (
              jobList.map((j) => {
                const label = statusDisplayLabel(
                  j.status,
                  j.error_code,
                  j.error_message,
                  j.pause_reason
                );
                const stages = pipelineStagesForJob(j.status, {
                  pauseReason: j.pause_reason,
                });
                return (
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
                          {new Date(j.created_at).toLocaleString()}
                        </p>
                      </button>
                      <div className="flex items-center gap-2">
                        <Badge className={`text-[10px] ${statusBadge(j.status)}`}>{label}</Badge>
                        {label === 'Waiting for User' ? (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => openInterventionWindow(projectId, j.id)}
                          >
                            Open Browser
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {stages.map((stage) => (
                        <span
                          key={stage.label}
                          className={
                            stage.state === 'done'
                              ? 'text-[10px] text-emerald-700'
                              : stage.state === 'current'
                                ? 'text-[10px] font-medium text-foreground'
                                : stage.state === 'failed'
                                  ? 'text-[10px] text-red-600'
                                  : 'text-[10px] text-muted-foreground/60'
                          }
                        >
                          {stage.state === 'done' ? '✓ ' : stage.state === 'current' ? '→ ' : ''}
                          {stage.label}
                          {stage.label !== 'Completed' ? (
                            <span className="text-muted-foreground/40"> · </span>
                          ) : null}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        size="sm"
                        disabled={!runtimeHealthy || act.isPending}
                        onClick={() => act.mutate({ action: 'start', jobId: j.id })}
                      >
                        <Play className="h-3 w-3 mr-1" /> Start
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
                          ).map(([action, actionLabel]) => (
                            <button
                              key={action}
                              type="button"
                              className="flex w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
                              onClick={() => act.mutate({ action, jobId: j.id })}
                            >
                              {actionLabel}
                            </button>
                          ))}
                        </div>
                      </details>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      )}

      {showAdvanced && (tab === 'dashboard' || tab === 'timeline' || tab === 'logs') && (
        <BeeOpsPanel
          projectId={projectId}
          selectedJobId={selectedJobId}
          onSelectJob={setSelectedJobId}
        />
      )}

      {showAdvanced && tab === 'timeline' && selected && (
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

      {showAdvanced && tab === 'logs' && (
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

      {showAdvanced && tab === 'history' && (
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

      {showAdvanced && tab === 'sessions' && (
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

      {showAdvanced && tab === 'policies' && policy.data?.data && (
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
