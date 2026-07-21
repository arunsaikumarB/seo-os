import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { openInterventionWindow } from '@/lib/intervention-window';

export type InterventionItem = {
  jobId: string;
  website: string;
  reason: string;
  title: string;
  instruction: string;
  cta: string;
  displayStatus: string;
  gate: string;
  elapsedMs: number;
  autoResumePending?: boolean;
};

export function useInterventions(projectId: string, refetchInterval = 2_000) {
  const { request } = useApi();
  return useQuery({
    queryKey: ['bee-interventions', projectId],
    queryFn: () =>
      request<{ data: { count: number; items: InterventionItem[] } }>(
        `/v1/projects/${projectId}/browser/interventions`
      ),
    enabled: !!projectId,
    refetchInterval,
  });
}

/**
 * @deprecated Use InterventionBanner — kept so Advanced tooling can still list jobs.
 */
export function NeedsYourActionQueue({
  projectId,
  activeJobId,
  className,
}: {
  projectId: string;
  activeJobId?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const q = useInterventions(projectId);
  const items = q.data?.data.items ?? [];
  if (items.length === 0) return null;
  return (
    <div className={className ?? 'rounded-xl border border-dashed p-3 text-sm space-y-2'}>
      <p className="text-xs text-muted-foreground font-medium">Advanced · waiting jobs</p>
      {items.map((item) => (
        <button
          key={item.jobId}
          type="button"
          className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left hover:bg-muted/40 ${
            activeJobId === item.jobId ? 'ring-1 ring-amber-500' : ''
          }`}
          onClick={() => openInterventionWindow(projectId, item.jobId)}
        >
          <span className="truncate font-medium">{item.website}</span>
          <span className="text-xs text-amber-700 shrink-0">{item.reason}</span>
        </button>
      ))}
      <p className="text-[11px] text-muted-foreground">
        Prefer the compact banner — or{' '}
        <Link className="underline" to={`/projects/${projectId}/backlink-builder/execution`}>
          return to Submit Backlinks
        </Link>
        .
      </p>
    </div>
  );
}

/** @deprecated Use InterventionBanner + openInterventionWindow */
export function ActionRequiredCard({
  projectId,
  item,
}: {
  projectId: string;
  item: InterventionItem;
}) {
  return (
    <button
      type="button"
      className="w-full rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-left text-sm"
      onClick={() => openInterventionWindow(projectId, item.jobId)}
    >
      <p className="font-medium">{item.website}</p>
      <p className="text-amber-800 dark:text-amber-200 text-xs mt-0.5">{item.reason}</p>
    </button>
  );
}
