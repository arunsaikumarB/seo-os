import { Link, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkflow } from '@/hooks/use-workflow';
import { useAppStore } from '@/stores/app-store';

interface NextActionStripProps {
  projectId: string;
}

export function NextActionStrip({ projectId }: NextActionStripProps) {
  const location = useLocation();
  const learningMode = useAppStore((s) => s.learningMode);
  const { nextStep, allComplete, getStepHref } = useWorkflow(projectId);

  const onHome = location.pathname.endsWith('/home');
  if (!learningMode || onHome || allComplete) return null;

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-lg border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm">
        <span className="text-muted-foreground">Next recommended step: </span>
        <span className="font-medium">
          {nextStep.emoji} {nextStep.title}
        </span>
      </div>
      <Button asChild size="sm" variant="secondary" className="shrink-0">
        <Link to={getStepHref(nextStep)}>
          Continue
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}
