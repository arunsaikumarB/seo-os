import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useWorkflow } from '@/hooks/use-workflow';

interface WorkflowRoadmapProps {
  projectId: string;
  compact?: boolean;
  className?: string;
}

export function WorkflowRoadmap({ projectId, compact, className }: WorkflowRoadmapProps) {
  const { steps, completedSteps, completedCount, totalSteps, currentStep, getStepHref } =
    useWorkflow(projectId);

  return (
    <div className={cn('rounded-lg border bg-card/50 px-4 py-3', className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          SEO Workflow
        </p>
        <p className="text-xs text-muted-foreground">
          {completedCount} / {totalSteps} Completed
        </p>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {steps.map((step) => {
          const done = completedSteps.has(step.id);
          const current = step.id === currentStep.id && !done;
          const label = `${step.emoji} Step ${step.number}: ${step.title}`;
          return (
            <Link
              key={step.id}
              to={getStepHref(step)}
              className="shrink-0"
              title={label}
              aria-label={label}
            >
              <motion.div
                className={cn(
                  'h-2.5 w-2.5 rounded-sm transition-colors',
                  done && 'bg-emerald-500',
                  current && 'bg-primary ring-2 ring-primary/30',
                  !done && !current && 'bg-muted'
                )}
                whileHover={{ scale: 1.3 }}
                layout
              />
            </Link>
          );
        })}
      </div>
      {!compact && currentStep && (
        <p className="mt-2 text-sm text-muted-foreground">
          Current:{' '}
          <span className="text-foreground font-medium">
            {currentStep.emoji} {currentStep.title}
          </span>
        </p>
      )}
    </div>
  );
}
