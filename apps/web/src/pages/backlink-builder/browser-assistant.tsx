import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Camera,
  CheckCircle2,
  Globe,
  Loader2,
  MonitorPlay,
  SkipForward,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { PageTransition } from '@/components/demo/page-transition';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import { OpportunitySelector } from '@/components/opportunities/opportunity-selector';
import { CurrentOpportunityBanner } from '@/components/opportunities/current-opportunity-banner';
import { useCurrentOpportunity } from '@/hooks/use-current-opportunity';
import {
  NeedsYourActionQueue,
  useInterventions,
} from '@/components/browser/needs-your-action-queue';

type InterventionDetail = {
  jobId: string;
  website: string;
  status: string;
  displayStatus: string;
  gate: string;
  reason: string;
  title: string;
  instruction: string;
  successToast: string;
  stepLabel: string;
  browser: string;
  session: string;
  elapsedMs: number;
  screenshot: { url: string | null; label: string } | null;
  liveUrl: string | null;
  pageTitle: string | null;
  needsAction: boolean;
  completedByAi: string[];
  userOnly: string;
  sessionId: string | null;
};

function formatElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function BrowserAssistantPage() {
  const { projectId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const jobId = params.get('jobId');
  const { request } = useApi();
  const flags = useFeatureFlags();
  const assistFillEnabled = flags.isEnabled('v11_browser_assist_fill');
  const qc = useQueryClient();
  const { opportunity: selectedOpp, setOpportunity } = useCurrentOpportunity(projectId);
  const [planId, setPlanId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(!jobId);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const interventions = useInterventions(projectId, 2_000);

  const intervention = useQuery({
    queryKey: ['bee-intervention', projectId, jobId],
    queryFn: () =>
      request<{ data: InterventionDetail }>(
        `/v1/projects/${projectId}/browser/jobs/${jobId}/intervention`
      ),
    enabled: !!projectId && !!jobId,
    refetchInterval: 2_000,
  });

  const capture = useQuery({
    queryKey: ['bee-intervention-live', projectId, jobId],
    queryFn: () =>
      request<{
        data: { ok: boolean; live: boolean; url: string | null; pageUrl: string | null };
      }>(`/v1/projects/${projectId}/browser/jobs/${jobId}/intervention/capture`, {
        method: 'POST',
      }),
    enabled: !!projectId && !!jobId && Boolean(intervention.data?.data.needsAction),
    refetchInterval: 2_500,
  });

  useEffect(() => {
    const url = capture.data?.data.url ?? intervention.data?.data.screenshot?.url ?? null;
    if (url) setLiveUrl(url);
  }, [capture.data?.data.url, intervention.data?.data.screenshot?.url]);

  const checkClear = useMutation({
    mutationFn: () =>
      request<{ data: { cleared: boolean; resumed: boolean; message: string } }>(
        `/v1/projects/${projectId}/browser/jobs/${jobId}/intervention/check`,
        { method: 'POST' }
      ),
    onSuccess: (res) => {
      if (res.data.cleared) {
        toast.success(res.data.message || '✓ Step complete — AI is continuing');
        qc.invalidateQueries({ queryKey: ['bee-intervention', projectId, jobId] });
        qc.invalidateQueries({ queryKey: ['bee-interventions', projectId] });
        qc.invalidateQueries({ queryKey: ['bee-jobs', projectId] });
        qc.invalidateQueries({ queryKey: ['bee-stats', projectId] });
      }
    },
    onError: () => {
      /* silent during auto-poll */
    },
  });

  // Prefer first intervention when landing without jobId
  useEffect(() => {
    if (jobId) return;
    const first = interventions.data?.data.items?.[0];
    if (first) setParams({ jobId: first.jobId }, { replace: true });
  }, [jobId, interventions.data?.data.items, setParams]);

  const checkMutate = checkClear.mutate;
  const checkPending = checkClear.isPending;
  // Auto-detect clearance — no Resume click required
  useEffect(() => {
    if (!projectId || !jobId || !intervention.data?.data.needsAction) return;
    if (intervention.data.data.gate === 'human_approval') return;
    const t = window.setInterval(() => {
      if (!checkPending) checkMutate();
    }, 4_000);
    return () => window.clearInterval(t);
  }, [
    projectId,
    jobId,
    intervention.data?.data.needsAction,
    intervention.data?.data.gate,
    checkMutate,
    checkPending,
  ]);

  const cancelJob = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/browser/cancel`, {
        method: 'POST',
        body: JSON.stringify({ jobId }),
      }),
    onSuccess: () => {
      toast.message('Job cancelled');
      setParams({});
      qc.invalidateQueries({ queryKey: ['bee-interventions', projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const skipJob = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/browser/cancel`, {
        method: 'POST',
        body: JSON.stringify({ jobId, reason: 'skipped_by_user' }),
      }),
    onSuccess: () => {
      toast.message('Website skipped — other jobs keep running');
      setParams({});
      qc.invalidateQueries({ queryKey: ['bee-interventions', projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/browser/approve`, {
        method: 'POST',
        body: JSON.stringify({ jobId }),
      }),
    onSuccess: () => {
      toast.success('Approved — resuming automation…');
      checkClear.mutate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSelect = (opp: typeof selectedOpp) => {
    setOpportunity(opp);
    setPlanId(null);
  };

  const plan = useQuery({
    queryKey: ['browser-plan', projectId, planId],
    queryFn: () =>
      request<{
        data: {
          id: string;
          plan_steps: Array<{
            order: number;
            action: string;
            detail: string;
            requiresUser: boolean;
          }>;
          blockers: Array<{ type: string; message: string }>;
          status: string;
          metrics_source: string;
        };
      }>(`/v1/projects/${projectId}/backlink-builder/browser/plans/${planId}`),
    enabled: !!planId,
  });

  const create = useMutation({
    mutationFn: () => {
      if (!selectedOpp) throw new Error('Select an approved website first');
      return request<{ data: { id: string } }>(
        `/v1/projects/${projectId}/backlink-builder/browser/plans`,
        {
          method: 'POST',
          body: JSON.stringify({ opportunityId: selectedOpp.id }),
        }
      );
    },
    onSuccess: (res) => {
      setPlanId(res.data.id);
      toast.success(`Action plan ready for ${selectedOpp?.website ?? 'website'}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assist = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/backlink-builder/browser/plans/${planId}/assist`, {
        method: 'POST',
      }),
    onSuccess: () => toast.success('Assist session started (will pause for protected steps)'),
    onError: (e: Error) => toast.error(e.message),
  });

  const d = intervention.data?.data;
  const steps = plan.data?.data.plan_steps ?? [];
  const blockers = plan.data?.data.blockers ?? [];

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Globe className="h-6 w-6" /> Browser Assistant
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Human Intervention Center — login, CAPTCHA, MFA, and verification happen here. AI
            resumes automatically.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/projects/${projectId}/backlink-builder/execution`}>Execution Center</Link>
        </Button>
      </div>

      <NeedsYourActionQueue projectId={projectId} activeJobId={jobId} />

      {jobId ? (
        <div className="space-y-4">
          {intervention.isLoading || !d ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              {!d.needsAction ? (
                <Card className="border-emerald-500/40 bg-emerald-500/5">
                  <CardContent className="pt-4 flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">{d.successToast || 'AI is continuing'}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {d.website} no longer needs you. Watch progress in Execution Center.
                      </p>
                      <Button size="sm" className="mt-3" asChild variant="outline">
                        <Link to={`/projects/${projectId}/backlink-builder/execution`}>
                          Back to Execution
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-amber-500/40">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MonitorPlay className="h-4 w-4" />
                      {d.title}
                    </CardTitle>
                    <CardDescription>{d.instruction}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                      {(
                        [
                          ['Current Website', d.website],
                          ['Status', d.displayStatus],
                          ['Reason', d.reason],
                          ['Current Step', d.stepLabel],
                          ['Browser', d.browser],
                          ['Session', d.session],
                          ['Elapsed', formatElapsed(d.elapsedMs)],
                        ] as const
                      ).map(([label, value]) => (
                        <div key={label}>
                          <p className="text-xs text-muted-foreground">{label}</p>
                          <p className="font-medium">{value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                      <p className="font-medium text-xs text-muted-foreground">AI already completed</p>
                      <ul className="grid gap-1 sm:grid-cols-2">
                        {d.completedByAi.map((line) => (
                          <li key={line} className="flex items-center gap-1.5 text-xs">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            {line}
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs pt-2">
                        <span className="text-muted-foreground">You only: </span>
                        <span className="font-medium">{d.userOnly}</span>
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium flex items-center gap-2">
                          Live browser
                          {capture.data?.data.live ? (
                            <Badge className="text-[10px] bg-emerald-500/15 text-emerald-700 border-transparent">
                              Live
                            </Badge>
                          ) : (
                            <Badge className="text-[10px] bg-muted text-muted-foreground">
                              Session view
                            </Badge>
                          )}
                          {capture.isFetching ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          ) : null}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            qc.invalidateQueries({
                              queryKey: ['bee-intervention-live', projectId, jobId],
                            })
                          }
                        >
                          <Camera className="h-3.5 w-3.5 mr-1" /> Take Screenshot
                        </Button>
                      </div>
                      <div className="relative rounded-lg border bg-black/90 overflow-hidden min-h-[280px] flex items-center justify-center">
                        {liveUrl ? (
                          <img
                            src={liveUrl}
                            alt={`Live view of ${d.website}`}
                            className="max-h-[420px] w-full object-contain"
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground p-6 text-center">
                            Connecting to the Playwright session…
                            <br />
                            <span className="text-xs">
                              Cookies, filled forms, and uploads are preserved — nothing is lost.
                            </span>
                          </p>
                        )}
                      </div>
                      {d.liveUrl ? (
                        <p className="text-[11px] text-muted-foreground truncate">
                          Page: {d.pageTitle || d.liveUrl}
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        Complete {d.reason.toLowerCase()} in the live Playwright session for this job
                        (same cookies, forms, and uploads). AI watches and resumes automatically —
                        no Resume or Retry button.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {d.gate === 'human_approval' ? (
                        <Button
                          onClick={() => approve.mutate()}
                          disabled={approve.isPending}
                        >
                          Approve submission
                        </Button>
                      ) : (
                        <Button variant="secondary" disabled>
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          Watching for completion…
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => skipJob.mutate()}
                        disabled={skipJob.isPending}
                      >
                        <SkipForward className="h-3.5 w-3.5 mr-1" /> Skip
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => cancelJob.mutate()}
                        disabled={cancelJob.isPending}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel Job
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          checkClear.mutate(undefined, {
                            onSuccess: (res) => {
                              if (!res.data.cleared) toast.message(res.data.message);
                            },
                            onError: (e: Error) => toast.error(e.message),
                          })
                        }
                        disabled={checkClear.isPending}
                      >
                        <Camera className="h-3.5 w-3.5 mr-1" /> Refresh status
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-4 text-sm text-muted-foreground">
            Select a website from <span className="font-medium text-foreground">Needs Your Action</span>{' '}
            above, or open one from the Execution Center. AI will send you here automatically whenever
            login, CAPTCHA, MFA, or verification is required.
          </CardContent>
        </Card>
      )}

      <div>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? 'Hide' : 'Show'} advanced planning tools
        </Button>
      </div>

      {showAdvanced ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Create action plan</CardTitle>
              <CardDescription>
                Optional — generate a form plan for an approved website (not required for
                interventions).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <CurrentOpportunityBanner projectId={projectId} />
              <OpportunitySelector
                projectId={projectId}
                selectedId={selectedOpp?.id ?? null}
                onSelect={handleSelect}
                mode="content"
                showTable={!selectedOpp}
                allowClear
              />
              <Button disabled={!selectedOpp || create.isPending} onClick={() => create.mutate()}>
                Generate plan
                {selectedOpp ? ` for ${selectedOpp.website}` : ''}
              </Button>
            </CardContent>
          </Card>

          {plan.data && selectedOpp ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Steps — {selectedOpp.website}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {steps.map((s) => (
                    <div
                      key={s.order}
                      className="flex gap-2 text-sm border-b border-border/40 py-2 last:border-0"
                    >
                      <span className="text-muted-foreground w-6">{s.order}</span>
                      <div>
                        <p className="font-medium capitalize">{s.action.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-muted-foreground">{s.detail}</p>
                        {s.requiresUser ? (
                          <Badge className="text-[10px] mt-1">Needs you</Badge>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {assistFillEnabled ? (
                    <Button
                      size="sm"
                      className="mt-2"
                      disabled={assist.isPending}
                      onClick={() => assist.mutate()}
                    >
                      Assist Fill
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Blockers</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {blockers.length === 0 ? (
                    <p className="text-muted-foreground">None detected in plan.</p>
                  ) : (
                    blockers.map((b, i) => (
                      <p key={i}>
                        <span className="font-medium">{b.type}</span> — {b.message}
                      </p>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </>
      ) : null}
    </PageTransition>
  );
}
