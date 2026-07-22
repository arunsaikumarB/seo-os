import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInterventions } from '@/components/browser/needs-your-action-queue';
import { openInterventionWindow, runCompleteAllSequence } from '@/lib/intervention-window';
import { cn } from '@/lib/utils';

type Props = {
  projectId: string;
  className?: string;
};

/**
 * Compact banner — Lane B human gates only (Phase 6.2).
 */
export function InterventionBanner({ projectId, className }: Props) {
  const q = useInterventions(projectId, 2_500);
  const items =
    q.data?.data.laneB?.items ??
    q.data?.data.items?.filter((i) => i.lane !== 'auto') ??
    [];
  const count = q.data?.data.laneB?.count ?? items.length;

  if (count === 0) return null;

  return (
    <div
      className={cn(
        'mb-6 flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
      role="status"
    >
      <div className="flex items-start gap-2 min-w-0">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="font-medium text-sm">Lane B — Needs you</p>
          <p className="text-sm text-muted-foreground">
            {count === 1
              ? '1 site needs a CAPTCHA / Login / Manual step — AI keeps submitting the rest.'
              : `${count} sites need you (CAPTCHA / Login / Manual) — Complete All in Lane B.`}
          </p>
        </div>
      </div>
      <Button
        size="sm"
        className="shrink-0"
        onClick={() => {
          if (items.length === 1) openInterventionWindow(projectId, items[0]!.jobId);
          else void runCompleteAllSequence(
            projectId,
            items.map((i) => i.jobId)
          );
        }}
      >
        {items.length === 1 ? 'Complete Now' : 'Complete All in Lane B'}
      </Button>
    </div>
  );
}
