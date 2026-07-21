import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInterventions } from '@/components/browser/needs-your-action-queue';
import { openAllInterventionWindows, openInterventionWindow } from '@/lib/intervention-window';
import { cn } from '@/lib/utils';

type Props = {
  projectId: string;
  className?: string;
};

/**
 * Compact banner — optional human tasks live in Human Intervention Queue.
 * Does not interrupt automatic submissions.
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
          <p className="font-medium text-sm">Human Intervention Queue</p>
          <p className="text-sm text-muted-foreground">
            {count === 1
              ? '1 optional website needs you — AI submissions continue.'
              : `${count} optional websites need you — AI submissions continue.`}
          </p>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0"
        onClick={() => {
          if (items.length === 1) openInterventionWindow(projectId, items[0]!.jobId);
          else openAllInterventionWindows(
            projectId,
            items.map((i) => i.jobId)
          );
        }}
      >
        Complete Now
      </Button>
    </div>
  );
}
