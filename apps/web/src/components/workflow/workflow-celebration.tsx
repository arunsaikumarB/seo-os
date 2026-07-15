import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PartyPopper, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useWorkflow } from '@/hooks/use-workflow';
import { useBeeExecutionProgress } from '@/hooks/use-bee-execution-progress';

interface WorkflowCelebrationProps {
  projectId: string;
}

export function WorkflowCelebration({ projectId }: WorkflowCelebrationProps) {
  const { allComplete, completedCount, totalSteps } = useWorkflow(projectId);
  const bee = useBeeExecutionProgress(projectId);
  const jobsOpen = (bee.data?.totalJobs ?? 0) > 0 && !bee.data?.executionComplete;

  if (!allComplete || jobsOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mb-6"
    >
      <Card className="border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 via-primary/5 to-emerald-500/10">
        <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-5">
          <div className="flex items-start gap-3">
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <PartyPopper className="h-8 w-8 text-emerald-500" />
            </motion.div>
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                Congratulations!
                <Sparkles className="h-4 w-4 text-primary" />
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                You completed all {completedCount} of {totalSteps} workflow steps. Your SEO OS
                journey from website analysis to verified backlinks is complete.
              </p>
            </div>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link to={`/projects/${projectId}/home`}>Review Progress</Link>
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
