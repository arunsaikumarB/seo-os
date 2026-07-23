import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useWorkflow } from '@/hooks/use-workflow';
import { WORKFLOW_PIPELINE_LABELS } from '@/config/workflow-steps';

type Props = {
  projectId: string;
  className?: string;
};

/** Workflow steps only — no counts, chips, or sub-statuses (Phase 3.6). */
export function WorkflowProgressHeader({ projectId, className }: Props) {
  const { steps, currentStep, getStepHref, isStepComplete, hasSuccessfulImport } =
    useWorkflow(projectId);

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('mb-4 rounded-xl border border-border/40 bg-card/60 px-3 py-2.5', className)}
    >
      <ol className="flex flex-wrap gap-1.5">
        {steps.map((step) => {
          const done = isStepComplete(step.id);
          const current = step.id === currentStep.id && !done;
          const locked =
            !hasSuccessfulImport &&
            step.id !== 'create-project' &&
            step.id !== 'import-websites';
          const label =
            WORKFLOW_PIPELINE_LABELS.find((l) => l.id === step.id)?.label ?? step.title;
          const href = locked
            ? `/projects/${projectId}/backlink-builder/import`
            : getStepHref(step);
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
                  'inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors',
                  done && 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
                  current && 'bg-primary/10 text-primary ring-1 ring-primary/30',
                  !done && !current && 'bg-muted/50 text-muted-foreground',
                  locked && 'opacity-60'
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]',
                    done && 'bg-emerald-500 text-white',
                    current && 'bg-primary text-primary-foreground',
                    !done && !current && 'bg-muted text-muted-foreground'
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : step.number}
                </span>
                <span className="hidden sm:inline truncate max-w-[7rem]">{label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </motion.div>
  );
}
