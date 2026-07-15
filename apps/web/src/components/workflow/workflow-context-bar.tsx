import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useWorkflow } from '@/hooks/use-workflow';
import { cn } from '@/lib/utils';

type Props = {
  projectId: string;
  className?: string;
};

/** Current Step · Next Step · Progress — shown on guided pages */
export function WorkflowContextBar({ projectId, className }: Props) {
  const {
    currentStep,
    nextStep,
    completedCount,
    totalSteps,
    allComplete,
    getStepHref,
    steps,
    completedSteps,
  } = useWorkflow(projectId);

  const pct = Math.round((completedCount / Math.max(totalSteps, 1)) * 100);
  const estRemaining = steps
    .filter((s) => !completedSteps.has(s.id))
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
            {allComplete ? 'Workflow complete' : 'Current stage'}
          </p>
          <p className="font-medium truncate">
            {allComplete ? 'All steps finished' : currentStep.title}
          </p>
          {!allComplete && nextStep.id !== currentStep.id ? (
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
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {completedCount}/{totalSteps}
            {!allComplete && estRemaining > 0 ? (
              <span className="ml-2">· ~{estRemaining} min left</span>
            ) : null}
          </div>
          {!allComplete ? (
            <Link
              to={getStepHref(currentStep)}
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
