import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useCampaignAiStatus } from '@/hooks/use-campaign-ai-status';

type Props = {
  projectId: string;
  className?: string;
  /** Override label when page already owns a more specific status */
  forceHide?: boolean;
};

/**
 * Universal AI Status — outcome language only.
 * Collapses to nothing when no AI work is active (empty-state rule).
 */
export function CampaignAiStatus({ projectId, className, forceHide }: Props) {
  const { aiActive, currentLabel, completed, remaining, percent, eta } =
    useCampaignAiStatus(projectId);

  if (forceHide || !aiActive) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'mb-4 rounded-2xl border border-border/40 bg-card px-4 py-3 shadow-sm space-y-2',
        className
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
        AI Status
      </div>
      <p className="text-xs text-muted-foreground">Current: {currentLabel}</p>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        Completed {completed} · Remaining {remaining}
        {eta ? ` · ETA ${eta}` : ''}
      </p>
    </motion.div>
  );
}
