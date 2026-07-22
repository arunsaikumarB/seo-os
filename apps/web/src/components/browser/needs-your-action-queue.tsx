import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { openInterventionWindow } from '@/lib/intervention-window';

export type InterventionItem = {
  jobId: string;
  website: string;
  pausedUrl?: string | null;
  currentUrl?: string | null;
  currentStep?: string;
  detectedStep?: string;
  reason: string;
  title: string;
  instruction: string;
  explanation?: string;
  cta: string;
  displayStatus: string;
  gate: string;
  elapsedMs: number;
  timeWaitingMs?: number;
  autoResumePending?: boolean;
  evidenceId?: string | null;
  matchedSignals?: string[];
  screenshotPath?: string | null;
  domSnapshotPath?: string | null;
  stage?: string | null;
  unclassified?: boolean;
  verified?: boolean;
  /** Phase 6.2 */
  lane?: 'auto' | 'human_gate';
  truthClaim?: string | null;
};

export type InterventionsPayload = {
  count: number;
  items: InterventionItem[];
  laneA?: { count: number; items: InterventionItem[]; label?: string };
  laneB?: { count: number; items: InterventionItem[]; label?: string };
  autoSubmitting?: number;
  lanes?: { laneA: number; laneB: number; autoSubmitting: number };
  needsYouCount?: number;
};

export function useInterventions(projectId: string, refetchInterval = 2_000) {
  const { request } = useApi();
  return useQuery({
    queryKey: ['bee-interventions', projectId],
    queryFn: () =>
      request<{ data: InterventionsPayload }>(
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
}: {
  projectId: string;
  activeJobId?: string | null;
}) {
  const interventions = useInterventions(projectId, 3_000);
  const items =
    interventions.data?.data.laneB?.items ??
    interventions.data?.data.items?.filter((i) => i.lane !== 'auto') ??
    interventions.data?.data.items ??
    [];

  if (!items.length) return null;

  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium">{items.length} need you (Lane B)</p>
      <ul className="space-y-1">
        {items.slice(0, 8).map((i) => (
          <li key={i.jobId}>
            <button
              type="button"
              className="text-left underline-offset-2 hover:underline"
              onClick={() => openInterventionWindow(projectId, i.jobId)}
            >
              {i.website} — {i.truthClaim || i.gate}
            </button>
            {activeJobId === i.jobId ? ' (open)' : ''}
          </li>
        ))}
      </ul>
      <Link
        to={`/projects/${projectId}/backlink-builder/execution`}
        className="text-xs text-muted-foreground underline"
      >
        Open Submit Backlinks
      </Link>
    </div>
  );
}
