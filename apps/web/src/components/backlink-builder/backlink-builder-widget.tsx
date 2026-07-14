import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AnimatedCounter } from '@/components/demo/animated-counter';
import { ProgressBarLabel } from '@/components/demo/animated-progress';
import { PageTransition, StaggerGrid, StaggerItem } from '@/components/demo/page-transition';
import {
  Link2,
  Sparkles,
  Search,
  GitBranch,
  ShieldCheck,
  ArrowRight,
  Users,
  Target,
  Mail,
  BarChart3,
  Upload,
  Bot,
} from 'lucide-react';
import type { BacklinkSummary } from './types';

interface BacklinkBuilderWidgetProps {
  summary?: BacklinkSummary;
  projectId: string;
  compact?: boolean;
}

export function BacklinkBuilderWidget({ summary, projectId, compact }: BacklinkBuilderWidgetProps) {
  const data = summary ?? {
    totalOpportunities: 0,
    discovered: 0,
    qualified: 0,
    approved: 0,
    campaign_ready: 0,
    outreach_running: 0,
    won: 0,
    lost: 0,
    verified: 0,
    pending: 0,
    avgDomainRating: 0,
    successRate: 0,
    activeCampaigns: 0,
    aiActivity: [],
  };

  const stageValues = [
    { key: 'total', label: 'Total', value: data.totalOpportunities },
    { key: 'qualified', label: 'Qualified', value: data.qualified },
    { key: 'campaign_ready', label: 'Campaign Ready', value: data.campaign_ready },
    { key: 'outreach_running', label: 'Outreach', value: data.outreach_running },
    { key: 'won', label: 'Won', value: data.won },
    { key: 'lost', label: 'Lost', value: data.lost },
    { key: 'verified', label: 'Verified', value: data.verified },
  ];

  if (compact) {
    return (
      <Card className="transition-shadow hover:shadow-md border-primary/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" /> Backlink Builder v1.0
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 text-sm">
          {stageValues.map((s) => (
            <div key={s.key} className="flex justify-between rounded-md border px-2 py-1.5">
              <span className="text-muted-foreground text-xs">{s.label}</span>
              <span className="font-medium tabular-nums">{s.value}</span>
            </div>
          ))}
          <Button variant="ghost" size="sm" className="col-span-2 h-8" asChild>
            <Link to={`/projects/${projectId}/backlink-builder`}>Open Backlink Builder</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary/5 via-background to-background">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <motion.div
                animate={{ rotate: [0, 8, -8, 0] }}
                transition={{ repeat: Infinity, duration: 4 }}
              >
                <Link2 className="h-5 w-5 text-primary" />
              </motion.div>
              Backlink Builder
              <Badge className="text-[10px] border-primary/30 text-primary">Epic 1 · v1.0</Badge>
            </CardTitle>
            <CardDescription>
              Discovery → Qualification → Campaign → Outreach → Won → Verified
            </CardDescription>
          </div>
          <Button size="sm" asChild>
            <Link to={`/projects/${projectId}/backlink-builder`}>
              Open <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <StaggerGrid className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {stageValues.map((s) => (
            <StaggerItem key={s.key}>
              <div className="rounded-lg border bg-card/80 px-3 py-2 text-center">
                <p className="text-[10px] text-muted-foreground truncate">{s.label}</p>
                <p className="text-xl font-semibold tabular-nums">
                  <AnimatedCounter value={s.value} />
                </p>
              </div>
            </StaggerItem>
          ))}
        </StaggerGrid>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="rounded-md border px-3 py-2">
            <p className="text-[10px] text-muted-foreground">Avg DR</p>
            <p className="font-semibold tabular-nums">{data.avgDomainRating}</p>
          </div>
          <div className="rounded-md border px-3 py-2">
            <p className="text-[10px] text-muted-foreground">Success Rate</p>
            <p className="font-semibold tabular-nums">{data.successRate}%</p>
          </div>
          <div className="rounded-md border px-3 py-2">
            <p className="text-[10px] text-muted-foreground">Pending Verify</p>
            <p className="font-semibold tabular-nums">{data.pending}</p>
          </div>
          <div className="rounded-md border px-3 py-2">
            <p className="text-[10px] text-muted-foreground">Campaigns</p>
            <p className="font-semibold tabular-nums">{data.activeCampaigns}</p>
          </div>
        </div>

        {data.aiActivity && data.aiActivity.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium flex items-center gap-1">
              <Bot className="h-3 w-3" /> AI Activity
            </p>
            {data.aiActivity.slice(0, 3).map((a) => (
              <ProgressBarLabel
                key={a.agentType}
                label={`${a.agent}: ${a.task}`}
                value={a.progress}
                showPulse
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function BacklinkBuilderNav() {
  const { projectId = '' } = useParams();
  const base = `/projects/${projectId}`;
  const links = [
    { href: `${base}/backlink-builder`, label: 'Dashboard', icon: Link2 },
    { href: `${base}/backlink-builder/import`, label: 'Import', icon: Upload },
    { href: `${base}/backlink-builder/explorer`, label: 'Explorer', icon: Search },
    { href: `${base}/backlink-builder/automation`, label: 'AI Analysis', icon: Sparkles },
    { href: `${base}/campaigns/queue`, label: 'Queue', icon: Target },
    { href: `${base}/backlink-builder/pipeline`, label: 'Pipeline', icon: GitBranch },
    { href: `${base}/campaigns`, label: 'Campaigns', icon: Target },
    { href: `${base}/outreach/inbox`, label: 'Outreach', icon: Mail },
    { href: `${base}/relationships`, label: 'Relationships', icon: Users },
    { href: `${base}/backlink-builder/pending`, label: 'Verification', icon: ShieldCheck },
    { href: `${base}/reports/library`, label: 'Reports', icon: BarChart3 },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {links.map((l) => (
        <Button key={l.href} variant="outline" size="sm" asChild>
          <Link to={l.href}>
            <l.icon className="h-3 w-3 mr-1" /> {l.label}
          </Link>
        </Button>
      ))}
    </div>
  );
}

export function BacklinkBuilderHero({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <PageTransition className="space-y-4">
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-r from-primary/10 via-background to-violet-500/5 p-6">
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-5 w-5 text-primary" />
              <Badge className="text-[10px]">Epic 1 · Backlink Builder v1.0</Badge>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-muted-foreground max-w-xl">{subtitle}</p>
          </div>
        </div>
      </div>
      <BacklinkBuilderNav />
    </PageTransition>
  );
}
