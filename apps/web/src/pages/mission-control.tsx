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

type MissionSummary = {
  backlinkBuilder?: BacklinkSummary;
  automation?: AutomationSummary;
  relationshipIntelligence?: { relationshipHealth?: number; avgHealth?: number };
  workforce?: { recentRuns?: Array<{ id: string; agent_type?: string; status: string; created_at: string }> };
  campaigns?: { timeline?: Array<{ title: string; event_type: string; created_at: string }> };
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
