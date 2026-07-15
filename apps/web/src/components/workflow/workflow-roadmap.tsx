import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkflow } from '@/hooks/use-workflow';
import { WORKFLOW_PIPELINE_LABELS } from '@/config/workflow-steps';

interface WorkflowRoadmapProps {
  projectId: string;
  compact?: boolean;
  className?: string;
}

export function WorkflowRoadmap({ projectId, compact, className }: WorkflowRoadmapProps) {
  const { steps, completedSteps, completedCount, totalSteps, currentStep, getStepHref } =
    useWorkflow(projectId);

  const pct = Math.round((completedCount / Math.max(totalSteps, 1)) * 100);

  return (
    <div
      className={cn(
        'rounded-2xl border border-border/40 bg-card px-5 py-5 shadow-sm',
        className
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold tracking-tight">Workflow Progress</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {pct}% complete · {completedCount} of {totalSteps} stages
          </p>
        </div>
      </div>
      <ol className={cn('grid gap-2', compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-4')}>
        {steps.map((step) => {
          const done = completedSteps.has(step.id);
          const current = step.id === currentStep.id && !done;
          const label =
            WORKFLOW_PIPELINE_LABELS.find((l) => l.id === step.id)?.label ?? step.title;
          return (
            <li key={step.id}>
              <Link
                to={getStepHref(step)}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors',
                  done && 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
                  current && 'bg-primary/10 text-primary ring-1 ring-primary/25',
                  !done && !current && 'bg-muted/40 text-muted-foreground'
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium',
                    done && 'bg-emerald-500 text-white',
                    current && 'bg-primary text-primary-foreground',
                    !done && !current && 'bg-muted text-muted-foreground'
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : step.number}
                </span>
                <span className="truncate font-medium">{label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
