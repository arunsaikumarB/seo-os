import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useWorkflow } from '@/hooks/use-workflow';
import { useBeeExecutionProgress } from '@/hooks/use-bee-execution-progress';
import { formatEta } from '@/lib/bee-execution-ui';
import { cn } from '@/lib/utils';

type Props = {
  projectId: string;
  className?: string;
};

/** Current · Next · Progress — guided pages only */
export function WorkflowContextBar({ projectId, className }: Props) {
  const {
    currentStep,
    nextStep,
    completedCount,
    totalSteps,
    allComplete,
    getStepHref,
    steps,
    isStepComplete,
  } = useWorkflow(projectId);
  const bee = useBeeExecutionProgress(projectId);
  const hasJobs = (bee.data?.totalJobs ?? 0) > 0;
  const jobsOpen = hasJobs && !bee.data?.executionComplete;
  const showComplete = allComplete && !jobsOpen;

  const pct = hasJobs
    ? Math.round(bee.data?.progressPercent ?? 0)
    : Math.round((completedCount / Math.max(totalSteps, 1)) * 100);
  const estRemaining = steps
    .filter((s) => !isStepComplete(s.id))
    .reduce((sum, s) => sum + (s.estimatedMinutes ?? 5), 0);

  return (
    <div
      className={cn(
        'mb-6 rounded-xl border border-border/50 bg-card/80 px-4 py-3 shadow-sm',
        className
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {showComplete ? 'Done' : jobsOpen ? 'Submitting' : 'Current'}
          </p>
          <p className="font-medium truncate">
            {showComplete
              ? 'Workflow complete'
              : jobsOpen
                ? `AI is submitting backlinks · ${bee.data!.completedJobs}/${bee.data!.totalJobs}`
                : currentStep.title}
          </p>
          {!showComplete && !jobsOpen && nextStep.id !== currentStep.id ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              Next <ArrowRight className="h-3 w-3" /> {nextStep.title}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-4 shrink-0">
          <div className="min-w-[140px]">
            <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
              <span>Progress</span>
              <span className="tabular-nums">{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {hasJobs
              ? `${bee.data!.completedJobs}/${bee.data!.totalJobs}`
              : `${completedCount}/${totalSteps}`}
            {jobsOpen && bee.data!.etaSeconds > 0 ? (
              <span className="ml-2">· ETA {formatEta(bee.data!.etaSeconds)}</span>
            ) : !showComplete && !hasJobs && estRemaining > 0 ? (
              <span className="ml-2">· ~{estRemaining} min left</span>
            ) : null}
          </div>
          {!showComplete ? (
            <Link
              to={
                jobsOpen
                  ? `/projects/${projectId}/backlink-builder/execution`
                  : getStepHref(currentStep)
              }
              className="text-xs font-medium text-primary hover:underline"
            >
              Continue
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
