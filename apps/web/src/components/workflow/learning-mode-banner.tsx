import { useWorkflow } from '@/hooks/use-workflow';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';

interface LearningModeBannerProps {
  projectId: string;
}

export function LearningModeBanner({ projectId }: LearningModeBannerProps) {
  const { learningMode, currentStep, completedCount } = useWorkflow(projectId);

  if (!learningMode) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="border-b bg-primary/5 px-4 py-2 md:px-6"
      >
        <div className="flex items-start gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-muted-foreground">
            <span className="text-foreground font-medium">Learning Mode: </span>
            You&apos;re on step {currentStep.number} ({completedCount} done).{' '}
            {currentStep.purpose}
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
