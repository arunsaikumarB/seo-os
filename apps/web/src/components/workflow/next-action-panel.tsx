import { Link } from 'react-router-dom';
import { ArrowRight, Clock, Sparkles, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWorkflow } from '@/hooks/use-workflow';
import { useBeeExecutionProgress } from '@/hooks/use-bee-execution-progress';
import { useInterventions } from '@/components/browser/needs-your-action-queue';
import { formatEta } from '@/lib/bee-execution-ui';

interface NextActionPanelProps {
  projectId: string;
  title?: string;
  className?: string;
}

export function NextActionPanel({ projectId, title, className }: NextActionPanelProps) {
  const { nextStep, currentStep, allComplete, getStepHref, isStepComplete } =
    useWorkflow(projectId);
  const bee = useBeeExecutionProgress(projectId);
  const interventions = useInterventions(projectId, 3_000);
  const actionItems = interventions.data?.data.items ?? [];
  const jobsOpen = (bee.data?.totalJobs ?? 0) > 0 && !bee.data?.executionComplete;
  const firstAction = actionItems[0];

  if (firstAction) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={className}
      >
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              AI needs you
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="font-medium">{firstAction.website}</p>
              <p className="text-sm text-amber-800 dark:text-amber-200">{firstAction.reason}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              AI finished everything it can. Open Browser Assistant to continue.
            </p>
            <Button asChild size="sm">
              <Link
                to={`/projects/${projectId}/backlink-builder/browser-assistant?jobId=${firstAction.jobId}`}
              >
                Open Browser
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  if (allComplete && !jobsOpen) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={className}
      >
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-500" />
              All set
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Your guided workflow is complete. Track results anytime.
            </p>
            <Button asChild size="sm">
              <Link to={`/projects/${projectId}/backlink-builder/track-results`}>
                Track Results
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  if (jobsOpen && bee.data) {
    const p = bee.data;
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={className}
      >
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">AI is submitting backlinks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {p.completedJobs}/{p.totalJobs} finished
              {p.etaSeconds > 0 ? ` · ETA ${formatEta(p.etaSeconds)}` : ''}
            </p>
            <p className="text-sm text-muted-foreground">No action required.</p>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.min(100, p.progressPercent)}%` }}
              />
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to={`/projects/${projectId}/backlink-builder/execution`}>
                View progress
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  const step = nextStep;
  const justFinished = isStepComplete(currentStep.id);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={className}
    >
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title ?? 'Next step'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {justFinished && currentStep.id !== step.id ? (
            <p className="text-sm text-muted-foreground">{currentStep.title} complete</p>
          ) : null}
          <div className="flex items-start gap-3">
            <span className="text-2xl">{step.emoji}</span>
            <div className="flex-1 space-y-1">
              <p className="font-medium">{step.title}</p>
              <p className="text-sm text-muted-foreground">{step.purpose}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {step.estimatedMinutes ? (
                  <Badge className="text-[10px] font-normal gap-1 border-border bg-muted/50">
                    <Clock className="h-3 w-3" />~{step.estimatedMinutes} min
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
          <Button asChild size="sm">
            <Link to={getStepHref(step)}>
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
