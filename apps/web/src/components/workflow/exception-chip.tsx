import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCampaignAiStatus } from '@/hooks/use-campaign-ai-status';

type Props = {
  projectId: string;
  className?: string;
  /** Expanded review content (existing queue UI) */
  children?: React.ReactNode;
};

/**
 * Exception chip — renders NOTHING when Needs Review + Failed = 0.
 */
export function ExceptionChip({ projectId, className, children }: Props) {
  const { exceptionCount, needsReview, failed } = useCampaignAiStatus(projectId);
  const [open, setOpen] = useState(false);

  if (exceptionCount <= 0) return null;

  const label =
    needsReview > 0 && failed > 0
      ? `Needs attention: ${exceptionCount}`
      : needsReview > 0
        ? `Needs Review  ${needsReview}`
        : `Failed  ${failed}`;

  return (
    <div className={cn('mb-4 space-y-3', className)}>
      <div className="inline-flex items-center gap-3 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm">
        <span className="tabular-nums font-medium">{label}</span>
        <Button size="sm" variant="secondary" className="h-7 rounded-full" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide' : 'Review →'}
        </Button>
      </div>
      {open ? children : null}
    </div>
  );
}
