import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useAppStore } from '@/stores/app-store';
import { useWorkflow } from '@/hooks/use-workflow';
import { useBeeExecutionProgress } from '@/hooks/use-bee-execution-progress';
import { useInterventions } from '@/components/browser/needs-your-action-queue';
import { WorkflowRoadmap } from '@/components/workflow/workflow-roadmap';
import { NextActionPanel } from '@/components/workflow/next-action-panel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatEta } from '@/lib/bee-execution-ui';

export function ProjectHomePage() {
  const { projectId = '' } = useParams();
  const { currentOrgId } = useAppStore();
  const { fetchProjects, request } = useApi();
  const { currentStep, nextStep, completedCount, totalSteps, getStepHref, allComplete } =
    useWorkflow(projectId);
  const beeProgress = useBeeExecutionProgress(projectId);
  const interventions = useInterventions(projectId, 3_000);
  const actionItems = interventions.data?.data.items ?? [];
  const jobsOpen =
    (beeProgress.data?.totalJobs ?? 0) > 0 && !beeProgress.data?.executionComplete;
  const showComplete = allComplete && !jobsOpen;

  const { data } = useQuery({
    queryKey: ['projects', currentOrgId],
    queryFn: () => fetchProjects(currentOrgId!),
    enabled: !!currentOrgId,
  });

  const summary = useQuery({
    queryKey: ['backlink-summary-dashboard', projectId],
    queryFn: () =>
      request<{
        data: Record<string, unknown>;
      }>(`/v1/projects/${projectId}/backlink-builder/summary`).catch(() => ({ data: {} })),
    enabled: !!projectId,
    retry: false,
  });

  const project = data?.data.find((p) => p.id === projectId);
  const s = (summary.data?.data ?? {}) as Record<string, unknown>;
  const b = beeProgress.data;

  const num = (...vals: unknown[]) => {
    for (const v of vals) {
      if (typeof v === 'number' && !Number.isNaN(v)) return v;
    }
    return 0;
  };

  const todayResults = {
    submitted: num(s.submitted, s.todayBacklinks, s.today),
    verified: num(s.verified, s.won),
    pending: num(s.pending),
    successRate: (b?.successRate as number | undefined) ?? (s.successRate as number | undefined),
  };

  const aiTask = actionItems[0]
    ? `${actionItems[0].reason} — ${actionItems[0].website}`
    : jobsOpen
      ? 'Submitting backlinks'
      : currentStep.title;

  const welcomeLine = showComplete
    ? 'Your backlink campaign workflow is complete.'
    : actionItems.length > 0
      ? 'AI needs a quick hand — then it continues automatically.'
      : jobsOpen
        ? 'AI is working on your backlink campaign.'
        : 'AI is ready to build backlinks with you.';

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        <p className="text-sm text-muted-foreground">Welcome</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {project?.name ?? 'Your project'}
        </h1>
        <p className="text-muted-foreground max-w-xl">{welcomeLine}</p>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-border/40 shadow-sm rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Current project</CardTitle>
            <CardDescription>{project?.name ?? '—'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span>Progress</span>
                <span className="tabular-nums">
                  {completedCount} / {totalSteps}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${Math.round((completedCount / Math.max(totalSteps, 1)) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Current</p>
                <p className="font-medium">{aiTask}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Next</p>
                <p className="font-medium">
                  {showComplete ? 'Track results anytime' : nextStep.title}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Needs your action</p>
                <p className="font-medium">
                  {actionItems.length === 0
                    ? 'None'
                    : `${actionItems.length} website${actionItems.length === 1 ? '' : 's'}`}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">ETA</p>
                <p className="font-medium tabular-nums">
                  {jobsOpen && b?.etaSeconds
                    ? formatEta(b.etaSeconds)
                    : currentStep.estimatedMinutes
                      ? `~${currentStep.estimatedMinutes} min`
                      : '—'}
                </p>
              </div>
            </div>
            <Button asChild size="lg">
              <Link
                to={
                  actionItems[0]
                    ? `/projects/${projectId}/backlink-builder/browser-assistant?jobId=${actionItems[0].jobId}`
                    : jobsOpen
                      ? `/projects/${projectId}/backlink-builder/execution`
                      : getStepHref(showComplete ? nextStep : currentStep)
                }
              >
                {actionItems[0]
                  ? 'Open Browser'
                  : showComplete
                    ? 'Track Results'
                    : jobsOpen
                      ? 'View progress'
                      : 'Continue'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <NextActionPanel projectId={projectId} />
      </div>

      <WorkflowRoadmap projectId={projectId} />

      <div>
        <h2 className="text-sm font-semibold tracking-tight mb-3">Today&apos;s results</h2>
        {summary.isLoading ? (
          <Skeleton className="h-24 w-full rounded-2xl" />
        ) : (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            {(
              [
                ['Submitted', todayResults.submitted],
                ['Pending', todayResults.pending],
                ['Verified', todayResults.verified],
                [
                  'Success rate',
                  typeof todayResults.successRate === 'number'
                    ? `${todayResults.successRate}%`
                    : '—',
                ],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-border/40 bg-card px-4 py-3 shadow-sm"
              >
                <p className="text-[11px] text-muted-foreground">{label}</p>
                <p className="text-xl font-semibold tabular-nums mt-1 tracking-tight">{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
