import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Play,
  Pause,
  RotateCcw,
  Square,
  CheckCircle2,
  History,
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

type BeeJob = {
  id: string;
  status: string;
  site_domain?: string;
  mode?: string;
  current_step_index?: number;
  created_at: string;
  opportunity_id?: string;
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
  successRate: number | null;
  avgRuntimeMs: number | null;
  etaSeconds: number;
  current?: { website?: string; step?: string; browser?: string };
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

export function BrowserExecutionCenterPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as (typeof TABS)[number]) || 'dashboard';
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [opportunityId, setOpportunityId] = useState('');

  const setTab = (t: (typeof TABS)[number]) => {
    setParams({ tab: t });
  };

  const stats = useQuery({
    queryKey: ['bee-stats', projectId],
    queryFn: () =>
      request<{ data: BeeStats }>(`/v1/projects/${projectId}/browser/statistics`),
    enabled: !!projectId,
    refetchInterval: 10_000,
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
    enabled: !!projectId && !!selectedJobId && tab === 'logs',
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
        };
      }>(`/v1/projects/${projectId}/browser/policies`),
    enabled: !!projectId && tab === 'policies',
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['bee-jobs', projectId] });
    qc.invalidateQueries({ queryKey: ['bee-stats', projectId] });
    qc.invalidateQueries({ queryKey: ['bee-job', projectId] });
  };

  const createMut = useMutation({
    mutationFn: () =>
      request<{ data: BeeJob }>(`/v1/projects/${projectId}/browser/executions`, {
        method: 'POST',
        body: JSON.stringify({ opportunityId: opportunityId.trim(), mode: 'prepare' }),
      }),
    onSuccess: (res) => {
      toast.success('Execution plan created');
      setSelectedJobId(res.data.id);
      invalidate();
      setTab('timeline');
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
    const map: Record<string, string> = {
      needs_approval: 'bg-amber-500/15 text-amber-700',
      blocked_captcha: 'bg-red-500/15 text-red-700',
      blocked_mfa: 'bg-red-500/15 text-red-700',
      completed: 'bg-emerald-500/15 text-emerald-700',
      failed: 'bg-red-500/15 text-red-700',
    };
    return (status: string) => map[status] ?? '';
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Execution Center</h1>
          <p className="text-muted-foreground">
            Browser Execution Engine — user-authorized Playwright workflows. CAPTCHA, MFA, and
            email/phone verification always pause for you.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/projects/${projectId}/backlink-builder/browser-assistant`}>
            Browser Intelligence
          </Link>
        </Button>
      </div>

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
                ['Paused', s?.paused],
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
            <CardHeader>
              <CardTitle className="text-base">Create execution</CardTitle>
              <CardDescription>Builds a plan from Website Requirement Library + form intelligence</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 items-end">
              <div className="space-y-1 flex-1 min-w-[220px]">
                <Label htmlFor="opp">Opportunity ID</Label>
                <Input
                  id="opp"
                  value={opportunityId}
                  onChange={(e) => setOpportunityId(e.target.value)}
                  placeholder="uuid"
                />
              </div>
              <Button
                disabled={!opportunityId.trim() || createMut.isPending}
                onClick={() => createMut.mutate()}
              >
                Prepare plan
              </Button>
            </CardContent>
          </Card>
        </>
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
                      <p className="text-sm font-medium">{j.site_domain ?? j.id}</p>
                      <p className="text-xs text-muted-foreground">
                        {j.mode} · {new Date(j.created_at).toLocaleString()}
                      </p>
                    </button>
                    <Badge className={`text-[10px] capitalize ${statusBadge(j.status)}`}>
                      {j.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => act.mutate({ action: 'start', jobId: j.id })}
                    >
                      <Play className="h-3 w-3 mr-1" /> Start
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => act.mutate({ action: 'pause', jobId: j.id })}
                    >
                      <Pause className="h-3 w-3 mr-1" /> Pause
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => act.mutate({ action: 'resume', jobId: j.id })}
                    >
                      Resume
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => act.mutate({ action: 'approve', jobId: j.id })}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => act.mutate({ action: 'retry', jobId: j.id })}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" /> Retry
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => act.mutate({ action: 'cancel', jobId: j.id })}
                    >
                      <Square className="h-3 w-3 mr-1" /> Cancel
                    </Button>
                    {tab === 'replay' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => act.mutate({ action: 'replay', jobId: j.id })}
                      >
                        <History className="h-3 w-3 mr-1" /> Replay
                      </Button>
                    )}
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
                  <p className="font-medium">{String(h.domain ?? h.job_id)}</p>
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
              Default is Always Ask. Automatic Eligible never bypasses CAPTCHA/MFA/verification.
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
