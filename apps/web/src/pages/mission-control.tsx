import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Upload,
  Target,
  ListChecks,
  Mail,
  MessageSquareReply,
  Trophy,
  ShieldCheck,
  Percent,
  Link2,
  Radio,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import { useDemoMode } from '@/hooks/use-demo-mode';
import { AnimatedCounter } from '@/components/demo/animated-counter';
import { PageTransition, StaggerGrid, StaggerItem } from '@/components/demo/page-transition';
import { WorkflowCelebration } from '@/components/workflow/workflow-celebration';
import type { BacklinkSummary, AutomationSummary } from '@/components/backlink-builder/types';
import type { OutreachSummary } from '@/components/outreach/outreach-widget';
import type { LucideIcon } from 'lucide-react';

type MissionSummary = {
  backlinkBuilder?: BacklinkSummary;
  automation?: AutomationSummary;
  outreach?: OutreachSummary;
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
  const { isDemoMode } = useDemoMode();

  const summary = useQuery({
    queryKey: ['mission-control-summary', projectId],
    queryFn: () =>
      request<{ data: MissionSummary }>(`/v1/projects/${projectId}/mission-control/summary`),
    enabled: !!projectId,
    refetchInterval: isDemoMode ? 20_000 : 30_000,
  });

  const data = summary.data?.data;
  const bb = data?.backlinkBuilder;
  const auto = data?.automation;
  const outreach = data?.outreach;

  const imported = auto?.importedWebsites ?? 0;
  const qualified = Math.max(bb?.qualified ?? 0, auto?.qualifiedOpportunities ?? 0);
  const outreachQueue =
    (bb?.outreach_running ?? 0) + (bb?.campaign_ready ?? 0) + (bb?.outreach_ready ?? 0);
  const emailsSent = outreach?.emailsSent ?? 0;
  const replies = outreach?.replies ?? 0;
  const won = bb?.won ?? 0;
  const verified = bb?.verified ?? 0;
  const successRate = bb?.successRate ?? 0;

  const kpis = [
    {
      label: 'Imported Websites',
      value: imported,
      icon: Upload,
      href: `/projects/${projectId}/backlink-builder/import`,
    },
    {
      label: 'Qualified Opportunities',
      value: qualified,
      icon: Target,
      href: `/projects/${projectId}/backlink-builder/explorer`,
    },
    {
      label: 'Outreach Queue',
      value: outreachQueue,
      icon: ListChecks,
      href: `/projects/${projectId}/campaigns/queue`,
    },
    {
      label: 'Emails Sent',
      value: emailsSent,
      icon: Mail,
      href: `/projects/${projectId}/outreach/inbox`,
    },
    {
      label: 'Replies',
      value: replies,
      icon: MessageSquareReply,
      href: `/projects/${projectId}/outreach/inbox`,
    },
    {
      label: 'Backlinks Won',
      value: won,
      icon: Trophy,
      href: `/projects/${projectId}/backlink-builder/won`,
    },
    {
      label: 'Verified Links',
      value: verified,
      icon: ShieldCheck,
      href: `/projects/${projectId}/backlink-builder/pending`,
    },
    {
      label: 'Success Rate',
      value: successRate,
      suffix: '%',
      icon: Percent,
      href: `/projects/${projectId}/backlink-builder`,
    },
  ];

  return (
    <PageTransition className="space-y-6">
      <WorkflowCelebration projectId={projectId} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Mission Control</h1>
            {isDemoMode && (
              <Badge className="text-[10px] border-primary/30 text-primary">Live Demo</Badge>
            )}
            {!isDemoMode && (
              <Badge className="text-[10px] border-emerald-500/30 text-emerald-600 gap-1">
                <Radio className="h-3 w-3" /> Live
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            Backlink operations at a glance — import, qualify, outreach, and verify
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${projectId}/backlink-builder/import`}>
              <Upload className="h-3 w-3 mr-1" /> Import websites
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link to={`/projects/${projectId}/backlink-builder`}>
              <Link2 className="h-3 w-3 mr-1" /> Open Backlink Builder
              <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </div>
      </div>

      {summary.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : summary.isError ? (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">
            Unable to load backlink metrics. Check your connection and try again.
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
          <CardTitle className="text-base">Next steps</CardTitle>
          <CardDescription>
            Keep working inside Backlink Builder — supporting engines run automatically in the
            background when you import or analyze websites.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${projectId}/backlink-builder/import`}>1. Import websites</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${projectId}/backlink-builder/automation`}>2. Run AI analysis</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${projectId}/campaigns/queue`}>3. Review opportunity queue</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${projectId}/outreach/inbox`}>4. Send outreach</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${projectId}/backlink-builder/pending`}>5. Verify links</Link>
          </Button>
        </CardContent>
      </Card>
    </PageTransition>
  );
}
