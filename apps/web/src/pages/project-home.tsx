import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useAppStore } from '@/stores/app-store';
import { useWorkflow } from '@/hooks/use-workflow';
import { useBeeExecutionProgress } from '@/hooks/use-bee-execution-progress';
import { WorkflowRoadmap } from '@/components/workflow/workflow-roadmap';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const KPI_DEFS = [
  { key: 'imported', label: 'Imported Websites', from: 'totalOpportunities' },
  { key: 'qualified', label: 'Qualified', from: 'qualified' },
  { key: 'approved', label: 'Approved', from: 'approved' },
  { key: 'queued', label: 'Queued', from: 'queued' },
  { key: 'submitted', label: 'Submitted', from: 'submitted' },
  { key: 'verified', label: 'Verified', from: 'verified' },
  { key: 'failed', label: 'Failed', from: 'failed' },
  { key: 'pending', label: 'Pending', from: 'pending' },
  { key: 'today', label: "Today's Backlinks", from: 'todayBacklinks' },
  { key: 'success', label: 'Success Rate', from: 'successRate', suffix: '%' },
  { key: 'eta', label: 'Est. Approval Time', from: 'estimatedApproval' },
] as const;

export function ProjectHomePage() {
  const { projectId = '' } = useParams();
  const { currentOrgId } = useAppStore();
  const { fetchProjects, request } = useApi();
  const { currentStep, getStepHref, allComplete } = useWorkflow(projectId);
  const beeProgress = useBeeExecutionProgress(projectId);
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
  const b = (beeProgress.data ?? {}) as Record<string, unknown>;

  const num = (...vals: unknown[]) => {
    for (const v of vals) {
      if (typeof v === 'number' && !Number.isNaN(v)) return v;
    }
    return 0;
  };

  const kpiValues: Record<string, string | number> = {
    totalOpportunities: num(s.totalOpportunities, s.imported, s.total),
    qualified: num(s.qualified, s.scored),
    approved: num(s.approved),
    queued: num(b.queued, s.queued),
    submitted: num(s.submitted),
    verified: num(s.verified, s.won),
    failed: num(b.failed, s.failed, s.lost),
    pending: num(s.pending),
    todayBacklinks: num(s.todayBacklinks, s.today),
    successRate: (b.successRate as number | undefined) ?? (s.successRate as number | undefined) ?? '—',
    estimatedApproval: String(s.estimatedApproval ?? '7–14 days'),
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        <p className="text-sm text-muted-foreground">Dashboard</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {project?.name ?? 'Backlink Builder'}
        </h1>
        <p className="text-muted-foreground max-w-xl">
          Build authority backlinks in one guided workflow — import, qualify, create, submit, and
          verify.
        </p>
      </motion.div>

      <WorkflowRoadmap projectId={projectId} />

      <Card className="border-border/40 shadow-sm rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {showComplete
              ? 'Workflow complete'
              : jobsOpen
                ? 'Browser Execution in progress'
                : 'Continue where you left off'}
          </CardTitle>
          <CardDescription>
            {showComplete
              ? 'Review reports or import more websites anytime.'
              : jobsOpen
                ? `${beeProgress.data!.completedJobs}/${beeProgress.data!.totalJobs} jobs finished · Workers ${beeProgress.data!.workerUsage}`
                : currentStep.purpose}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="lg">
            <Link
              to={
                jobsOpen
                  ? `/projects/${projectId}/backlink-builder/execution`
                  : getStepHref(currentStep)
              }
            >
              {showComplete
                ? 'Open Reports'
                : jobsOpen
                  ? 'Open Execution Center'
                  : currentStep.title}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-sm font-semibold tracking-tight mb-3">Results at a glance</h2>
        {summary.isLoading ? (
          <Skeleton className="h-32 w-full rounded-2xl" />
        ) : (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {KPI_DEFS.map((kpi) => {
              const raw = kpiValues[kpi.from];
              const suffix = 'suffix' in kpi ? kpi.suffix : undefined;
              const display =
                suffix && typeof raw === 'number' ? `${raw}${suffix}` : raw;
              return (
                <div
                  key={kpi.key}
                  className="rounded-2xl border border-border/40 bg-card px-4 py-3 shadow-sm"
                >
                  <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                  <p className="text-xl font-semibold tabular-nums mt-1 tracking-tight">
                    {display ?? '—'}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
