import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useWorkflow } from '@/hooks/use-workflow';
import { useCampaignAiStatus } from '@/hooks/use-campaign-ai-status';

interface NextActionPanelProps {
  projectId: string;
  className?: string;
}

/**
 * Exactly ONE primary action card (Phase 3.6).
 * Pure function of workflow + CSM generation status — no per-page duplicate Continues.
 * Hidden on Generate Content page (that page owns States A/B/C primary action).
 */
export function NextActionPanel({ projectId, className }: NextActionPanelProps) {
  const location = useLocation();
  const {
    currentStep,
    nextUnlockedStep,
    continueHref,
    continueLabel,
    allComplete,
    jobsOpen,
    needsHumanAction,
    activeStep,
  } = useWorkflow(projectId);
  const { generateState, exceptionCount, progress, genActive } = useCampaignAiStatus(projectId);

  const onGeneratePage = location.pathname.includes('/content/library');
  if (onGeneratePage) return null;

  // Banner + auto window own the human-action state
  if (needsHumanAction) return null;

  // Run in progress — Continue hidden; AI Status block owns the fold
  if (jobsOpen || genActive) {
    return null;
  }

  // User is on the step that needs work — that page owns the one primary CTA
  if (activeStep && activeStep.id === nextUnlockedStep.id) {
    return null;
  }

  // Exceptions need attention before continuing
  if (exceptionCount > 0 && generateState === 'complete') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={className}
      >
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Current: Generate Content</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              AI finished generating. {exceptionCount} package
              {exceptionCount === 1 ? '' : 's'} need your review before continuing.
            </p>
            <Button asChild size="sm">
              <Link to={`/projects/${projectId}/content/library`}>Review →</Link>
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

  const completedSummary =
    generateState === 'complete' && progress
      ? `AI completed package generation. ${progress.completed} websites are ready.`
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={className}
    >
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Current: {currentStep.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {completedSummary ? (
            <p className="text-muted-foreground">{completedSummary}</p>
          ) : (
            <p className="text-muted-foreground">{currentStep.purpose}</p>
          )}
          <div>
            <p className="text-xs text-muted-foreground">Next: {nextUnlockedStep.title}</p>
          </div>
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
