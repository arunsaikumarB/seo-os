import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useWorkflow } from '@/hooks/use-workflow';
import { WORKFLOW_PIPELINE_LABELS } from '@/config/workflow-steps';
import { StepTimingBadge } from '@/components/workflow/step-timing-badge';

type Props = {
  projectId: string;
  className?: string;
};

/**
 * Stepper: completed steps stay green (even on that page).
 * Incomplete current page uses the primary highlight.
 * Clock shows only real processing time (running / took) — never estimates.
 */
export function WorkflowProgressHeader({ projectId, className }: Props) {
  const {
    steps,
    activeStep,
    getStepHref,
    isStepComplete,
    hasSuccessfulImport,
    importsLoaded,
    stepTimings,
  } = useWorkflow(projectId);
  const lockLaterSteps = importsLoaded && !hasSuccessfulImport;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('mb-4 rounded-xl border border-border/40 bg-card/60 px-3 py-2.5', className)}
    >
      <ol className="flex flex-wrap gap-1.5">
        {steps.map((step) => {
          const done = isStepComplete(step.id);
          /** Highlight = route you are viewing, forever — never CSM "first incomplete". */
          const onPage = activeStep != null && step.id === activeStep.id;
          const locked =
            lockLaterSteps &&
            step.id !== 'create-project' &&
            step.id !== 'import-websites';
          const label =
            WORKFLOW_PIPELINE_LABELS.find((l) => l.id === step.id)?.label ?? step.title;
          const href = locked
            ? `/projects/${projectId}/backlink-builder/import`
            : getStepHref(step);
          const timing = stepTimings.find((t) => t.stepId === step.id) ?? null;
          return (
            <li key={step.id}>
              <Link
                to={href}
                title={
                  locked
                    ? 'Import websites before continuing to this step'
                    : undefined
                }
                className={cn(
                  'inline-flex flex-col gap-0.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors',
                  done && 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
                  !done && onPage && 'bg-primary/10 text-primary ring-1 ring-primary/30',
                  !done && !onPage && 'bg-muted/50 text-muted-foreground',
                  locked && 'opacity-60'
                )}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]',
                      done && 'bg-emerald-500 text-white',
                      !done && onPage && 'bg-primary text-primary-foreground',
                      !done && !onPage && 'bg-muted text-muted-foreground'
                    )}
                  >
                    {done ? <Check className="h-3 w-3" /> : step.number}
                  </span>
                  <span className="hidden sm:inline truncate max-w-[7rem]">{label}</span>
                </span>
                <StepTimingBadge timing={timing} compact className="self-start ml-6 sm:ml-0" />
              </Link>
            </li>
          );
        })}
      </ol>
    </motion.div>
  );
}
