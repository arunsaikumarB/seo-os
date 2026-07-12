import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Building2,
  Bot,
  Target,
  BookOpen,
  Users,
  Clock,
  TrendingUp,
  BarChart3,
  FolderKanban,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AnimatedCounter } from '@/components/demo/animated-counter';
import { PageTransition, StaggerGrid, StaggerItem } from '@/components/demo/page-transition';
import { useApi } from '@/hooks/use-api';

import type { LucideIcon } from 'lucide-react';

type ExecutiveMetrics = {
  organizations: number;
  projects: number;
  aiRuns: number;
  campaigns: number;
  opportunities: number;
  knowledgeDocuments: number;
  relationships: number;
  timeSavedHours: number;
  campaignSuccessRate: number;
  productivityScore: number;
  orgBreakdown: Array<{ id: string; name: string; projectCount: number }>;
};

function MetricCard({
  icon: Icon,
  label,
  value,
  suffix = '',
  highlight,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  suffix?: string;
  highlight?: boolean;
}) {
  return (
    <Card
      className={`transition-all hover:shadow-lg hover:-translate-y-0.5 ${highlight ? 'border-primary/30 bg-primary/5' : ''}`}
    >
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-2xl font-bold tracking-tight">
              <AnimatedCounter value={value} suffix={suffix} />
            </p>
          </div>
          <div className={`rounded-lg p-2 ${highlight ? 'bg-primary/15' : 'bg-muted'}`}>
            <Icon className={`h-4 w-4 ${highlight ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ExecutiveDashboardPage() {
  const { request } = useApi();

  const summary = useQuery({
    queryKey: ['executive-summary'],
    queryFn: () => request<{ data: ExecutiveMetrics }>('/v1/executive/summary'),
  });

  if (summary.isLoading) {
    return (
      <PageTransition className="space-y-8">
        <p className="text-muted-foreground">Loading executive summary…</p>
      </PageTransition>
    );
  }

  if (summary.isError || !summary.data?.data) {
    return (
      <PageTransition className="space-y-8">
        <p className="text-destructive">
          Unable to load executive summary. Check your organization access.
        </p>
      </PageTransition>
    );
  }

  const metrics = summary.data.data;

  return (
    <PageTransition className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1">Executive Dashboard</h1>
          <p className="text-muted-foreground">
            Organization-wide AI operations, productivity, and campaign performance
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/projects">
            <FolderKanban className="h-3 w-3 mr-1" /> All Projects
          </Link>
        </Button>
      </div>

      <StaggerGrid className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StaggerItem>
          <MetricCard icon={Building2} label="Organizations" value={metrics.organizations} />
        </StaggerItem>
        <StaggerItem>
          <MetricCard icon={FolderKanban} label="Projects" value={metrics.projects} />
        </StaggerItem>
        <StaggerItem>
          <MetricCard icon={Bot} label="AI Runs" value={metrics.aiRuns} />
        </StaggerItem>
        <StaggerItem>
          <MetricCard icon={Target} label="Campaigns" value={metrics.campaigns} />
        </StaggerItem>
        <StaggerItem>
          <MetricCard icon={Sparkles} label="Opportunities" value={metrics.opportunities} />
        </StaggerItem>
        <StaggerItem>
          <MetricCard icon={BookOpen} label="KB Documents" value={metrics.knowledgeDocuments} />
        </StaggerItem>
        <StaggerItem>
          <MetricCard icon={Users} label="Relationships" value={metrics.relationships} />
        </StaggerItem>
        <StaggerItem>
          <MetricCard
            icon={Clock}
            label="Est. time saved"
            value={metrics.timeSavedHours}
            suffix="h"
            highlight
          />
        </StaggerItem>
      </StaggerGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1 border-primary/20 bg-gradient-to-br from-primary/10 to-transparent">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Productivity Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <motion.p
              className="text-5xl font-bold text-primary"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 120 }}
            >
              <AnimatedCounter value={metrics.productivityScore} suffix="/100" />
            </motion.p>
            <p className="text-sm text-muted-foreground mt-2">
              AI automation vs manual SEO workflows
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Campaign Success
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">
              <AnimatedCounter value={metrics.campaignSuccessRate} suffix="%" />
            </p>
            <p className="text-sm text-muted-foreground mt-2">Campaigns reaching placement goals</p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Organizations</CardTitle>
            <CardDescription>Managed in this workspace</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {metrics.orgBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No organizations found.</p>
            ) : (
              metrics.orgBreakdown.map((org, i) => (
                <motion.div
                  key={org.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="flex justify-between text-sm rounded-md border px-3 py-2"
                >
                  <span className="font-medium">{org.name}</span>
                  <span className="text-muted-foreground">{org.projectCount} projects</span>
                </motion.div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
