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
 * Compact banner — points users to Complete Now / Complete All (task flow).
 */
export function InterventionBanner({ projectId, className }: Props) {
  const q = useInterventions(projectId, 2_500);
  const items = q.data?.data.items ?? [];
  const count = q.data?.data.count ?? items.length;

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
          <p className="font-medium text-sm">Needs Your Help</p>
          <p className="text-sm text-muted-foreground">
            {count === 1
              ? '1 website needs a quick human step — AI keeps submitting the rest.'
              : `${count} websites need your help — complete them one by one.`}
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
        {items.length === 1 ? 'Complete Now' : 'Complete All'}
      </Button>
    </div>
  );
}
