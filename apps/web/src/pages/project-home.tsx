import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Globe,
  BookOpen,
  Link2,
  Mail,
  Search,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useAppStore } from '@/stores/app-store';
import { useWorkflow } from '@/hooks/use-workflow';
import { WorkflowRoadmap } from '@/components/workflow/workflow-roadmap';
import { NextActionPanel } from '@/components/workflow/next-action-panel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const QUICK_ACTIONS = [
  { label: 'Analyze Website', href: 'intelligence/browser', icon: Globe },
  { label: 'Knowledge Base', href: 'knowledge/library', icon: BookOpen },
  { label: 'Backlink Builder', href: 'backlink-builder', icon: Link2 },
  { label: 'Outreach', href: 'outreach/inbox', icon: Mail },
  { label: 'SEO Audit', href: 'backlink-builder/audit', icon: Search },
  { label: 'AI Chat', href: 'command-center', icon: Sparkles },
];

export function ProjectHomePage() {
  const { projectId = '' } = useParams();
  const { currentOrgId } = useAppStore();
  const { fetchProjects } = useApi();
  const { currentStep, completedCount, totalSteps, learningMode, getStepHref } =
    useWorkflow(projectId);

  const { data } = useQuery({
    queryKey: ['projects', currentOrgId],
    queryFn: () => fetchProjects(currentOrgId!),
    enabled: !!currentOrgId,
  });

  const project = data?.data.find((p) => p.id === projectId);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-1"
      >
        <p className="text-sm text-muted-foreground">Project Overview</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {project?.name ?? 'Your Project'}
        </h1>
        {project?.domain && (
          <p className="text-muted-foreground text-sm">{project.domain}</p>
        )}
      </motion.div>

      <WorkflowRoadmap projectId={projectId} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Current Step</CardTitle>
              <CardDescription>
                Step {currentStep.number} of {totalSteps} — {completedCount} completed
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-4">
                <span className="text-3xl">{currentStep.emoji}</span>
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">{currentStep.title}</h3>
                  <p className="text-sm text-muted-foreground">{currentStep.purpose}</p>
                  {currentStep.aiTip && learningMode && (
                    <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                      <span className="font-medium text-primary">AI Tip: </span>
                      {currentStep.aiTip}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {currentStep.difficulty && (
                      <Badge className="border-border bg-muted/50">{currentStep.difficulty}</Badge>
                    )}
                    {currentStep.estimatedMinutes && (
                      <Badge className="border-border bg-muted/50">~{currentStep.estimatedMinutes} min</Badge>
                    )}
                  </div>
                  <Button asChild>
                    <Link to={getStepHref(currentStep)}>
                      Start this step
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
              <CardDescription>Jump to any module when you know what you need</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {QUICK_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Button key={action.label} variant="outline" className="justify-start h-auto py-3" asChild>
                      <Link to={`/projects/${projectId}/${action.href}`}>
                        <Icon className="mr-2 h-4 w-4 shrink-0" />
                        {action.label}
                      </Link>
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <NextActionPanel projectId={projectId} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-3">
              <p>Activity from scans, outreach, and AI agents will appear here.</p>
              <Button variant="ghost" className="h-auto p-0" asChild>
                <Link to={`/projects/${projectId}/mission-control`}>View Mission Control</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
