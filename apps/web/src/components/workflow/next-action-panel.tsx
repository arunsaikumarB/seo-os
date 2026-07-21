import { Link } from 'react-router-dom';
import { ArrowRight, Clock, Sparkles, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useWorkflow } from '@/hooks/use-workflow';
import { formatEta } from '@/lib/bee-execution-ui';

interface NextActionPanelProps {
  projectId: string;
  title?: string;
  className?: string;
}

/**
 * Single Next Action card — Continue always uses Workflow State Manager targets.
 */
export function NextActionPanel({ projectId, title = 'Next Action', className }: NextActionPanelProps) {
  const {
    currentStep,
    nextUnlockedStep,
    continueHref,
    continueLabel,
    allComplete,
    jobsOpen,
    needsHumanAction,
    firstAction,
    bee,
    etaLabel,
  } = useWorkflow(projectId);

  if (needsHumanAction && firstAction) {
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
              {firstAction.reason}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Website</p>
              <p className="font-medium">{firstAction.website}</p>
            </div>
            <p className="text-muted-foreground">
              AI paused only this website. Everything else continues.
            </p>
            <Button asChild size="sm">
              <Link to={continueHref}>
                Open Browser
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  if (jobsOpen && bee) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={className}
      >
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">AI is working</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">No action required.</p>
            <p className="text-muted-foreground">
              {bee.completedJobs}/{bee.totalJobs} finished
              {bee.etaSeconds > 0 ? ` · Estimated completion ${formatEta(bee.etaSeconds)}` : ''}
            </p>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, bee.progressPercent)}%` }}
              />
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to={continueHref}>
                {continueLabel}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  if (allComplete) {
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
              Campaign complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              AI finished the guided workflow. Review reports anytime.
            </p>
            <Button asChild size="sm">
              <Link to={continueHref}>
                {continueLabel}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={className}
    >
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Current Step</p>
            <p className="font-medium">{currentStep.title}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Next</p>
            <p className="font-medium">{nextUnlockedStep.title}</p>
          </div>
          {etaLabel ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Estimated {etaLabel}
            </p>
          ) : null}
          <Button asChild size="sm">
            <Link to={continueHref}>
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
