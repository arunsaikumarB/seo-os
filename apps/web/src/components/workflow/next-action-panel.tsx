import { Link } from 'react-router-dom';
import { ArrowRight, Clock, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWorkflow } from '@/hooks/use-workflow';
import { useBeeExecutionProgress } from '@/hooks/use-bee-execution-progress';

interface NextActionPanelProps {
  projectId: string;
  title?: string;
  className?: string;
}

export function NextActionPanel({ projectId, title, className }: NextActionPanelProps) {
  const { nextStep, currentStep, completedSteps, allComplete, getStepHref } =
    useWorkflow(projectId);
  const bee = useBeeExecutionProgress(projectId);
  const jobsOpen = (bee.data?.totalJobs ?? 0) > 0 && !bee.data?.executionComplete;

  // Never show Workflow Complete while Browser Execution jobs are still open
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
              Workflow Complete!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You have completed the guided workflow. Open Reports for your executive summary.
            </p>
            <Button asChild size="sm">
              <Link to={`/projects/${projectId}/reports/library`}>
                Open Reports
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  if (jobsOpen) {
    const p = bee.data!;
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={className}
      >
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Browser Execution in progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {p.completedJobs}/{p.totalJobs} jobs finished · Workers {p.workerUsage}
            </p>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.min(100, p.progressPercent)}%` }}
              />
            </div>
            <Button asChild size="sm">
              <Link to={`/projects/${projectId}/backlink-builder/execution`}>
                Open Execution Center
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  const step = nextStep;
  const justFinished = completedSteps.has(currentStep.id);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={className}
    >
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {title ?? 'Your Next Recommended Step'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {justFinished && (
            <p className="text-sm text-muted-foreground">
              {currentStep.title} complete
            </p>
          )}
          <div className="flex items-start gap-3">
            <span className="text-2xl">{step.emoji}</span>
            <div className="flex-1 space-y-1">
              <p className="font-medium">{step.title}</p>
              <p className="text-sm text-muted-foreground">{step.purpose}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {step.estimatedMinutes && (
                  <Badge className="text-[10px] font-normal gap-1 border-border bg-muted/50">
                    <Clock className="h-3 w-3" />
                    ~{step.estimatedMinutes} min
                  </Badge>
                )}
                {step.difficulty && (
                  <Badge className="text-[10px] font-normal border-border bg-muted/50">
                    {step.difficulty}
                  </Badge>
                )}
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
