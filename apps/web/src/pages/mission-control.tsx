import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Upload,
  Target,
  ClipboardList,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  AlertTriangle,
  Percent,
  Link2,
  Radio,
  ArrowRight,
  Heart,
  Activity,
  Image as ImageIcon,
  Plug,
  HeartPulse,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import { AnimatedCounter } from '@/components/demo/animated-counter';
import { PageTransition, StaggerGrid, StaggerItem } from '@/components/demo/page-transition';
import type { BacklinkSummary, AutomationSummary } from '@/components/backlink-builder/types';
import type { LucideIcon } from 'lucide-react';
import { ImageProviderMissionWidget } from '@/components/images/image-provider-mission-widget';

type MissionSummary = {
  backlinkBuilder?: BacklinkSummary;
  automation?: AutomationSummary;
  relationshipIntelligence?: { relationshipHealth?: number; avgHealth?: number };
  workforce?: {
    recentRuns?: Array<{ id: string; agent_type?: string; status: string; created_at: string }>;
    strip?: {
      currentAgent?: string | null;
      queue?: number;
      progress?: number;
      completedJobs?: unknown[];
    };
  };
  campaigns?: { timeline?: Array<{ title: string; event_type: string; created_at: string }> };
  browserExecution?: {
    running?: number;
    queued?: number;
    paused?: number;
    needs_approval?: number;
    completed?: number;
    failed?: number;
    blocked?: number;
    watching?: number;
    auto_resumed?: number;
    completed_after_captcha?: number;
    completed_after_login?: number;
    successRate?: number | null;
    avgRuntimeMs?: number | null;
    etaSeconds?: number;
    estimatedFinishAt?: string | null;
    current?: { website?: string; step?: string; browser?: string; queueProgress?: string };
  };
  imageIntelligence?: {
    generated?: number;
    queued?: number;
    approved?: number;
    submitted?: number;
    verified?: number;
    rejected?: number;
    bestProvider?: string;
    bestStyle?: string;
    todaysImages?: number;
    providerHealth?: Array<{ key: string; status: string }>;
  };
  opportunityClassification?: {
    imported?: number;
    classified?: number;
    unknown?: number;
    estimatedAccuracy?: number;
    avgConfidence?: number;
    snapshot?: {
      directories?: number;
      guestPosts?: number;
      articles?: number;
      images?: number;
      videos?: number;
      profiles?: number;
      forums?: number;
      qa?: number;
      unknown?: number;
    };
  };
  contentIntelligence?: {
    packs?: number;
    learnedSites?: number;
    avgQualityScore?: number | null;
    avgSeoScore?: number | null;
    imagesReady?: number;
    videoReady?: number;
    submissionReady?: number;
    estimatedApprovalProbability?: number;
    estimatedReviewHours?: number;
  };
  providerFramework?: {
    connected?: number;
    healthy?: number;
    offline?: number;
    warning?: number;
    quota?: number;
    averageLatencyMs?: number | null;
    todaysCalls?: number;
    errors?: number;
    failoverEvents?: number;
  };
  enterpriseHealth?: {
    status?: string;
    latencyMs?: number;
    checks?: Record<string, string>;
    metrics?: {
      errorRate?: number;
      successRate?: number;
      pendingJobs?: number;
      avgMs?: number;
      requests?: number;
      errors?: number;
    };
    memory?: { rssMb?: number; heapUsedMb?: number };
    queues?: Record<string, number>;
  };
};

function KpiCard({
  icon: Icon,
  label,
  value,
  suffix = '',
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  suffix?: string;
  href?: string;
}) {
  const body = (
    <Card className="h-full transition-all hover:shadow-md hover:-translate-y-0.5">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-2xl font-semibold tracking-tight tabular-nums">
              <AnimatedCounter value={value} suffix={suffix} />
            </p>
          </div>
          <div className="rounded-lg bg-primary/10 p-2">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  if (!href) return body;
  return (
    <Link to={href} className="block h-full">
      {body}
    </Link>
  );
}

export function MissionControlPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();

  const summary = useQuery({
    queryKey: ['mission-control-summary', projectId],
    queryFn: () =>
      request<{ data: MissionSummary }>(`/v1/projects/${projectId}/mission-control/summary`),
    enabled: !!projectId,
    refetchInterval: 30_000,
  });

  const data = summary.data?.data;
  const bb = data?.backlinkBuilder;
  const auto = data?.automation;
  const relHealth =
    data?.relationshipIntelligence?.relationshipHealth ??
    data?.relationshipIntelligence?.avgHealth ??
    0;

  const imported = auto?.importedWebsites ?? 0;
  const qualified = Math.max(bb?.qualified ?? 0, auto?.qualifiedOpportunities ?? 0);
  const prepared = auto?.pendingApproval ?? auto?.contentGenerated ?? 0;
  const submitted = auto?.submitted ?? 0;
  const pendingReview = auto?.waiting ?? 0;
  const accepted = auto?.accepted ?? 0;
  const rejected = auto?.rejected ?? 0;
  const verified = Math.max(bb?.verified ?? 0, auto?.verified ?? 0);
  const failed = auto?.rejected ?? 0;
  const successRate = bb?.successRate ?? 0;
  const todayGoal = Math.max(10, qualified || 10);
  const todayProgress = Math.min(100, Math.round(((submitted + verified + accepted) / todayGoal) * 100));

  const timeline = [
    ...(data?.campaigns?.timeline ?? []).map((t) => ({
      id: `${t.created_at}-${t.title}`,
      title: t.title,
      meta: t.event_type,
      at: t.created_at,
    })),
    ...(data?.workforce?.recentRuns ?? []).slice(0, 5).map((r) => ({
      id: r.id,
      title: `Agent ${r.agent_type ?? 'run'} · ${r.status}`,
      meta: 'ai_activity',
      at: r.created_at,
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 8);

  const kpis = [
    { label: 'Imported Websites', value: imported, icon: Upload, href: `/projects/${projectId}/backlink-builder/import` },
    { label: 'Qualified Opportunities', value: qualified, icon: Target, href: `/projects/${projectId}/backlink-builder/explorer` },
    { label: 'Prepared Submissions', value: prepared, icon: ClipboardList, href: `/projects/${projectId}/backlink-builder/tracking` },
    { label: 'Submitted', value: submitted, icon: Send, href: `/projects/${projectId}/backlink-builder/tracking` },
    { label: 'Pending Review', value: pendingReview, icon: Clock, href: `/projects/${projectId}/backlink-builder/tracking` },
    { label: 'Accepted', value: accepted, icon: CheckCircle2, href: `/projects/${projectId}/backlink-builder/tracking` },
    { label: 'Rejected', value: rejected, icon: XCircle, href: `/projects/${projectId}/backlink-builder/tracking` },
    { label: 'Verified', value: verified, icon: ShieldCheck, href: `/projects/${projectId}/backlink-builder/pending` },
    { label: 'Failed', value: failed, icon: AlertTriangle, href: `/projects/${projectId}/backlink-builder/tracking` },
    { label: 'Success Rate', value: successRate, suffix: '%', icon: Percent, href: `/projects/${projectId}/backlink-builder` },
    { label: "Today's Progress", value: todayProgress, suffix: '%', icon: Activity, href: `/projects/${projectId}/backlink-builder` },
    { label: 'Relationship Health', value: Math.round(relHealth), suffix: '/100', icon: Heart, href: `/projects/${projectId}/relationships` },
  ];

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <Badge className="text-[10px] border-emerald-500/30 text-emerald-600 gap-1">
              <Radio className="h-3 w-3" /> Live
            </Badge>
          </div>
          <p className="text-muted-foreground">
            Today&apos;s backlink operations summary — import through verification
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${projectId}/backlink-builder/import`}>
              <Upload className="h-3 w-3 mr-1" /> Import
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link to={`/projects/${projectId}/backlink-builder/discover`}>
              Discover websites
              <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Today&apos;s goal</CardTitle>
          <CardDescription>
            Target {todayGoal} submission/verification actions · {todayProgress}% complete
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${todayProgress}%` }} />
          </div>
        </CardContent>
      </Card>

      {summary.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : summary.isError ? (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">
            Unable to load dashboard metrics. Check your connection and try again.
          </CardContent>
        </Card>
      ) : (
        <StaggerGrid className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((kpi) => (
            <StaggerItem key={kpi.label}>
              <KpiCard
                icon={kpi.icon}
                label={kpi.label}
                value={kpi.value}
                suffix={kpi.suffix}
                href={kpi.href}
              />
            </StaggerItem>
          ))}
        </StaggerGrid>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" /> Browser Execution
          </CardTitle>
          <CardDescription>
            Running · Queued · Watching · Paused · Auto-resumed · Blocked · ETA
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Running / Queued</p>
            <p className="font-medium">
              {data?.browserExecution?.running ?? 0} / {data?.browserExecution?.queued ?? 0}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Watching / Paused</p>
            <p className="font-medium">
              {data?.browserExecution?.watching ?? 0} / {data?.browserExecution?.paused ?? 0}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Auto-resumed / After CAPTCHA</p>
            <p className="font-medium">
              {data?.browserExecution?.auto_resumed ?? 0} /{' '}
              {data?.browserExecution?.completed_after_captcha ?? 0}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Blocked / Failed</p>
            <p className="font-medium">
              {data?.browserExecution?.blocked ?? 0} / {data?.browserExecution?.failed ?? 0}
            </p>
          </div>
          <div className="sm:col-span-4 flex justify-between items-center">
            <p className="text-xs text-muted-foreground">
              Current: {data?.browserExecution?.current?.website || '—'} ·{' '}
              {data?.browserExecution?.current?.step || 'idle'}
              {data?.browserExecution?.current?.browser
                ? ` · browser ${String(data.browserExecution.current.browser).slice(0, 8)}`
                : ''}
              {data?.browserExecution?.current?.queueProgress
                ? ` · queue ${data.browserExecution.current.queueProgress}`
                : ''}
              {data?.browserExecution?.estimatedFinishAt
                ? ` · ETA ${new Date(data.browserExecution.estimatedFinishAt).toLocaleTimeString()}`
                : data?.browserExecution?.etaSeconds
                  ? ` · ~${Math.round((data.browserExecution.etaSeconds ?? 0) / 60)}m`
                  : ''}
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/projects/${projectId}/backlink-builder/execution`}>Execution Center</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="h-4 w-4" /> Image Intelligence
          </CardTitle>
          <CardDescription>
            Generated · Queued · Approved · Submitted · Verified · Rejected · Provider health
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Generated / Queued</p>
            <p className="font-medium">
              {data?.imageIntelligence?.generated ?? 0} / {data?.imageIntelligence?.queued ?? 0}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Approved / Submitted</p>
            <p className="font-medium">
              {data?.imageIntelligence?.approved ?? 0} / {data?.imageIntelligence?.submitted ?? 0}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Verified / Rejected</p>
            <p className="font-medium">
              {data?.imageIntelligence?.verified ?? 0} / {data?.imageIntelligence?.rejected ?? 0}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Best provider · style</p>
            <p className="font-medium capitalize">
              {data?.imageIntelligence?.bestProvider ?? 'flux'} ·{' '}
              {data?.imageIntelligence?.bestStyle ?? 'editorial'}
            </p>
          </div>
          <div className="sm:col-span-4 flex justify-between items-center">
            <p className="text-xs text-muted-foreground">
              Today: {data?.imageIntelligence?.todaysImages ?? 0} · Providers:{' '}
              {(data?.imageIntelligence?.providerHealth ?? [])
                .slice(0, 3)
                .map((p) => `${p.key}:${p.status}`)
                .join(' · ') || 'unconfigured'}
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/projects/${projectId}/content/library`}>Content Studio · Images</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="h-4 w-4" /> Image Provider
          </CardTitle>
          <CardDescription>
            Provider · Health · Latency · Queue · Jobs · Generated Today · Rejected · Ready
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ImageProviderMissionWidget projectId={projectId} summary={data?.imageIntelligence} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Opportunity Classification</CardTitle>
          <CardDescription>
            Directories · Guest Posts · Articles · Images · Videos · Profiles · Forums · Q&A ·
            Unknown · Accuracy
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {(
              [
                ['Directories', data?.opportunityClassification?.snapshot?.directories],
                ['Guest Posts', data?.opportunityClassification?.snapshot?.guestPosts],
                ['Articles', data?.opportunityClassification?.snapshot?.articles],
                ['Images', data?.opportunityClassification?.snapshot?.images],
                ['Videos', data?.opportunityClassification?.snapshot?.videos],
                ['Profiles', data?.opportunityClassification?.snapshot?.profiles],
                ['Forums', data?.opportunityClassification?.snapshot?.forums],
                ['Q&A', data?.opportunityClassification?.snapshot?.qa],
                ['Unknown', data?.opportunityClassification?.snapshot?.unknown],
              ] as const
            ).map(([label, n]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-medium tabular-nums">{n ?? 0}</p>
              </div>
            ))}
            <div>
              <p className="text-xs text-muted-foreground">Total Imported</p>
              <p className="font-medium tabular-nums">
                {data?.opportunityClassification?.imported ?? 0}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Classified</p>
              <p className="font-medium tabular-nums">
                {data?.opportunityClassification?.classified ?? 0}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Accuracy</p>
              <p className="font-medium tabular-nums">
                {data?.opportunityClassification?.estimatedAccuracy != null
                  ? `${data.opportunityClassification.estimatedAccuracy}%`
                  : '—'}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${projectId}/backlink-builder/classification`}>
              Classification dashboard
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Content Intelligence</CardTitle>
          <CardDescription>
            Detected packs · Quality · SEO · Assets · Submission ready · Approval probability · Review
            time
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Content Packs</p>
              <p className="font-medium tabular-nums">{data?.contentIntelligence?.packs ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Learned Sites</p>
              <p className="font-medium tabular-nums">
                {data?.contentIntelligence?.learnedSites ?? 0}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Quality Score</p>
              <p className="font-medium tabular-nums">
                {data?.contentIntelligence?.avgQualityScore != null
                  ? `${data.contentIntelligence.avgQualityScore}`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">SEO Score</p>
              <p className="font-medium tabular-nums">
                {data?.contentIntelligence?.avgSeoScore != null
                  ? `${data.contentIntelligence.avgSeoScore}`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Images Ready</p>
              <p className="font-medium tabular-nums">
                {data?.contentIntelligence?.imagesReady ?? 0}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Video Ready</p>
              <p className="font-medium tabular-nums">
                {data?.contentIntelligence?.videoReady ?? 0}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Submission Ready</p>
              <p className="font-medium tabular-nums">
                {data?.contentIntelligence?.submissionReady ?? 0}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Est. Approval</p>
              <p className="font-medium tabular-nums">
                {data?.contentIntelligence?.estimatedApprovalProbability != null
                  ? `${data.contentIntelligence.estimatedApprovalProbability}%`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Est. Review</p>
              <p className="font-medium tabular-nums">
                {data?.contentIntelligence?.estimatedReviewHours != null
                  ? `${data.contentIntelligence.estimatedReviewHours}h`
                  : '—'}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${projectId}/content/library`}>Open Content Studio</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Plug className="h-4 w-4" /> Provider Health
          </CardTitle>
          <CardDescription>
            Connected · Healthy · Offline · Quota · Latency · Calls · Errors · Failovers
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Connected / Healthy</p>
            <p className="font-medium">
              {data?.providerFramework?.connected ?? 0} / {data?.providerFramework?.healthy ?? 0}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Offline / Quota</p>
            <p className="font-medium">
              {data?.providerFramework?.offline ?? 0} / {data?.providerFramework?.quota ?? 0}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Avg latency · Calls</p>
            <p className="font-medium">
              {data?.providerFramework?.averageLatencyMs ?? '—'} ms ·{' '}
              {data?.providerFramework?.todaysCalls ?? 0}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Errors · Failovers</p>
            <p className="font-medium">
              {data?.providerFramework?.errors ?? 0} / {data?.providerFramework?.failoverEvents ?? 0}
            </p>
          </div>
          <div className="sm:col-span-4 flex justify-end">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/projects/${projectId}/providers`}>Provider Dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <HeartPulse className="h-4 w-4" /> Enterprise Health
          </CardTitle>
          <CardDescription>
            API · DB · Queue · Workers · Error rate · Latency · Memory · Pending jobs
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Platform status</p>
            <p className="font-medium capitalize">{data?.enterpriseHealth?.status ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">API / DB / Queue</p>
            <p className="font-medium">
              {data?.enterpriseHealth?.checks?.api ?? '—'} /{' '}
              {data?.enterpriseHealth?.checks?.database ?? '—'} /{' '}
              {data?.enterpriseHealth?.checks?.queue ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Success · Error rate</p>
            <p className="font-medium">
              {data?.enterpriseHealth?.metrics?.successRate ?? '—'}% ·{' '}
              {data?.enterpriseHealth?.metrics?.errorRate ?? '—'}%
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Latency · Memory</p>
            <p className="font-medium">
              {data?.enterpriseHealth?.metrics?.avgMs ?? data?.enterpriseHealth?.latencyMs ?? '—'}{' '}
              ms · {data?.enterpriseHealth?.memory?.heapUsedMb ?? '—'} MB
            </p>
          </div>
          <div className="sm:col-span-4 flex justify-between items-center">
            <p className="text-xs text-muted-foreground">
              Pending jobs: {data?.enterpriseHealth?.metrics?.pendingJobs ?? 0} · Requests:{' '}
              {data?.enterpriseHealth?.metrics?.requests ?? 0} · Errors:{' '}
              {data?.enterpriseHealth?.metrics?.errors ?? 0}
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/projects/${projectId}/diagnostics`}>Diagnostics</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" /> AI Workforce
          </CardTitle>
          <CardDescription>Current agent, queue depth, errors, and completed jobs</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Current agent</p>
            <p className="font-medium">{data?.workforce?.strip?.currentAgent ?? 'Idle'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Queue</p>
            <p className="font-medium">{data?.workforce?.strip?.queue ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Progress</p>
            <p className="font-medium">{data?.workforce?.strip?.progress ?? 0}%</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Completed (recent)</p>
            <p className="font-medium">
              {data?.workforce?.strip?.completedJobs?.length ?? 0}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" /> AI activity timeline
          </CardTitle>
          <CardDescription>Recent campaign and agent events for this project</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No activity yet. Import websites or run AI analysis to start the pipeline.
            </p>
          ) : (
            timeline.map((evt) => (
              <div
                key={evt.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{evt.title}</p>
                  <p className="text-xs text-muted-foreground">{evt.meta}</p>
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {new Date(evt.at).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link to={`/projects/${projectId}/backlink-builder`}>
            <Link2 className="h-3 w-3 mr-1" /> Backlink Builder
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/projects/${projectId}/content/library`}>Content Studio</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/projects/${projectId}/backlink-builder/tracking`}>Submission Center</Link>
        </Button>
      </div>
    </PageTransition>
  );
}
