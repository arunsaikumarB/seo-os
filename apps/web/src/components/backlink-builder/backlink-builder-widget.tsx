import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AnimatedCounter } from '@/components/demo/animated-counter';
import { ProgressBarLabel } from '@/components/demo/animated-progress';
import { PageTransition, StaggerGrid, StaggerItem } from '@/components/demo/page-transition';
import { AIThinkingPanel } from '@/components/demo/ai-thinking-panel';
import { Link2, Sparkles, Search, GitBranch, Trophy, Clock, ShieldCheck, ArrowRight } from 'lucide-react';
import type { BacklinkSummary } from './types';
import { PIPELINE_STAGES } from './types';

interface BacklinkBuilderWidgetProps {
  summary?: BacklinkSummary;
  projectId: string;
  compact?: boolean;
}

export function BacklinkBuilderWidget({ summary, projectId, compact }: BacklinkBuilderWidgetProps) {
  const data = summary ?? {
    discovered: 0,
    qualified: 0,
    approved: 0,
    outreach_ready: 0,
    won: 0,
    lost: 0,
    verified: 0,
    pending: 0,
    totalOpportunities: 0,
    activeCampaigns: 0,
  };

  const pipelineTotal = Math.max(
    1,
    data.discovered + data.qualified + data.approved + data.outreach_ready + data.won
  );

  const stageValues = [
    { key: 'discovered', value: data.discovered },
    { key: 'qualified', value: data.qualified },
    { key: 'approved', value: data.approved },
    { key: 'outreach_ready', value: data.outreach_ready },
    { key: 'won', value: data.won },
    { key: 'lost', value: data.lost },
    { key: 'verified', value: data.verified },
  ];

  if (compact) {
    return (
      <Card className="transition-shadow hover:shadow-md border-primary/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" /> Backlink Builder
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 text-sm">
          {stageValues.slice(0, 6).map((s) => (
            <div key={s.key} className="flex justify-between rounded-md border px-2 py-1.5">
              <span className="text-muted-foreground capitalize text-xs">{s.key.replace(/_/g, ' ')}</span>
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
                transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
              >
                <Link2 className="h-5 w-5 text-primary" />
              </motion.div>
              Backlink Builder
              <Badge className="text-[10px] border-primary/30 text-primary">Flagship</Badge>
            </CardTitle>
            <CardDescription>Discover → qualify → approve → win → verify</CardDescription>
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
              <div className="rounded-lg border bg-card/80 px-3 py-2 text-center transition-all hover:shadow-sm hover:-translate-y-0.5">
                <p className="text-[10px] text-muted-foreground capitalize truncate">
                  {s.key.replace(/_/g, ' ')}
                </p>
                <p className="text-xl font-semibold tabular-nums">
                  <AnimatedCounter value={s.value} />
                </p>
              </div>
            </StaggerItem>
          ))}
        </StaggerGrid>

        <div className="space-y-2">
          {PIPELINE_STAGES.slice(0, 4).map((stage) => {
            const count = data[stage.id as keyof BacklinkSummary] as number;
            const pct = Math.round((count / pipelineTotal) * 100);
            return (
              <ProgressBarLabel
                key={stage.id}
                label={stage.label}
                value={pct}
                showPulse={count > 0}
              />
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <Badge className="gap-1 border-muted-foreground/30">
            <Trophy className="h-3 w-3" /> {data.won} won
          </Badge>
          <Badge className="gap-1 border-muted-foreground/30">
            <ShieldCheck className="h-3 w-3" /> {data.verified} verified
          </Badge>
          <Badge className="gap-1 border-muted-foreground/30">
            <Clock className="h-3 w-3" /> {data.pending} pending
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export function BacklinkBuilderNav() {
  const { projectId = '' } = useParams();
  const base = `/projects/${projectId}/backlink-builder`;
  const links = [
    { href: base, label: 'Dashboard', icon: Link2 },
    { href: `${base}/explorer`, label: 'Explorer', icon: Search },
    { href: `${base}/pipeline`, label: 'Pipeline', icon: GitBranch },
    { href: `${base}/won`, label: 'Won', icon: Trophy },
    { href: `${base}/pending`, label: 'Pending', icon: Clock },
    { href: `${base}/audit`, label: 'Link Audit', icon: ShieldCheck },
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

export function BacklinkBuilderHero({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  const [step, setStep] = useState(0);
  const thinkingSteps = [
    'Scanning referring domains...',
    'Scoring 26 backlink types...',
    'Ranking opportunities...',
    'Building recommendations...',
    'Completed.',
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((s) => (s >= thinkingSteps.length - 1 ? 0 : s + 1));
    }, 2200);
    return () => clearInterval(timer);
  }, [thinkingSteps.length]);

  return (
    <PageTransition className="space-y-4">
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-r from-primary/10 via-background to-violet-500/5 p-6">
        <motion.div
          className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl"
          animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ repeat: Infinity, duration: 5 }}
        />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-5 w-5 text-primary" />
              <Badge className="text-[10px]">Sprint 5.5 · Flagship Module</Badge>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-muted-foreground max-w-xl">{subtitle}</p>
          </div>
          <AIThinkingPanel
            steps={thinkingSteps}
            currentStep={step}
            active={step < thinkingSteps.length - 1}
          />
        </div>
      </div>
      <BacklinkBuilderNav />
    </PageTransition>
  );
}
