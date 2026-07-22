/**
 * Phase 4.7 — per-website lifecycle timeline with timestamps.
 * Prefer job report timeline; fall back to status-derived milestones.
 */
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { cn } from '@/lib/utils';

const MILESTONES = [
  'Imported',
  'Reviewed',
  'Approved',
  'Generated',
  'Browser Opened',
  'Form Detected',
  'Uploading',
  'Submitting',
  'Completed',
] as const;

type Milestone = (typeof MILESTONES)[number] | 'Failure';

type Props = {
  projectId: string;
  jobId?: string | null;
  status?: string | null;
  createdAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  failed?: boolean;
  className?: string;
};

function stageLabel(status: string): string {
  const s = String(status ?? '');
  if (s.startsWith('watching') || s.startsWith('blocked_') || s === 'needs_approval')
    return 'Waiting Human';
  if (s === 'failed') return 'Failed';
  if (['submitted', 'completed', 'verified'].includes(s)) return 'Completed';
  if (s === 'submitting') return 'Submitting';
  if (s === 'uploading_assets') return 'Uploading Assets';
  if (s === 'filling_fields' || s === 'validating') return 'Generating Payload';
  if (s === 'analyzing_form') return 'Detecting Submission Form';
  if (s === 'navigating') return 'Reading Page';
  if (['launching_browser', 'authenticating', 'preparing', 'queued'].includes(s))
    return 'Opening Website';
  return s.replace(/_/g, ' ') || 'Working';
}

function statusToReached(status: string): number {
  const s = String(status ?? '');
  if (s === 'failed') return -1;
  if (['submitted', 'completed', 'verified', 'waiting_verification'].includes(s)) return 8;
  if (s === 'submitting') return 7;
  if (s === 'uploading_assets') return 6;
  if (s === 'analyzing_form' || s === 'filling_fields' || s === 'validating') return 5;
  if (s === 'navigating') return 4;
  if (['launching_browser', 'authenticating', 'preparing', 'queued'].includes(s)) return 4;
  if (s.startsWith('watching') || s.startsWith('blocked_') || s === 'needs_approval') return 7;
  return 3;
}

function fmt(ts?: string | null): string | null {
  if (!ts) return null;
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return null;
  }
}

export function WebsiteExecutionTimeline({
  projectId,
  jobId,
  status,
  createdAt,
  startedAt,
  finishedAt,
  failed,
  className,
}: Props) {
  const { request } = useApi();
  const report = useQuery({
    queryKey: ['bee-job-report', projectId, jobId],
    queryFn: () =>
      request<{
        data: {
          timeline?: Array<{ at: string; message: string }>;
          status?: string;
        };
      }>(`/v1/projects/${projectId}/browser/reports?jobId=${encodeURIComponent(jobId!)}`),
    enabled: !!projectId && !!jobId,
    retry: false,
    staleTime: 8_000,
  });

  const apiTimeline = report.data?.data?.timeline ?? [];
  const jobStatus = report.data?.data?.status ?? status ?? '';
  const isFailed = failed || jobStatus === 'failed';

  if (apiTimeline.length > 0) {
    return (
      <div className={cn('mt-2 rounded-md border bg-muted/20 px-3 py-2 space-y-1.5', className)}>
        <p className="text-[11px] font-medium text-muted-foreground">Website Timeline</p>
        <ol className="space-y-1">
          {apiTimeline.slice(-12).map((ev, i) => (
            <li key={`${ev.at}-${i}`} className="text-xs flex gap-2">
              <span className="text-muted-foreground tabular-nums shrink-0 w-[7.5rem]">
                {fmt(ev.at) ?? '—'}
              </span>
              <span>{ev.message}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const reached = statusToReached(jobStatus);
  const rows: Array<{
    label: Milestone;
    at: string | null;
    state: 'done' | 'current' | 'pending' | 'failed';
  }> = [];

  for (let i = 0; i < MILESTONES.length; i++) {
    const label = MILESTONES[i]!;
    let state: 'done' | 'current' | 'pending' | 'failed' = 'pending';
    if (isFailed && i === Math.max(0, reached === -1 ? 4 : reached)) state = 'failed';
    else if (reached < 0) state = i <= 4 ? (i === 4 ? 'failed' : 'done') : 'pending';
    else if (i < reached) state = 'done';
    else if (i === reached) state = isFailed ? 'failed' : 'current';
    const at =
      i <= 3
        ? fmt(createdAt)
        : i === 4
          ? fmt(startedAt ?? createdAt)
          : i === 8
            ? fmt(finishedAt)
            : i === reached
              ? fmt(startedAt ?? createdAt)
              : null;
    rows.push({ label, at, state });
  }

  if (isFailed) {
    rows.push({
      label: 'Failure',
      at: fmt(finishedAt),
      state: 'failed',
    });
  }

  return (
    <div className={cn('mt-2 rounded-md border bg-muted/20 px-3 py-2 space-y-1.5', className)}>
      <p className="text-[11px] font-medium text-muted-foreground">Website Timeline</p>
      <p className="text-[11px] text-muted-foreground">Current · {stageLabel(jobStatus)}</p>
      <ol className="space-y-1">
        {rows.map((row) => (
          <li key={row.label} className="text-xs flex gap-2 items-baseline">
            <span
              className={cn(
                'shrink-0 w-28',
                row.state === 'done' && 'text-foreground',
                row.state === 'current' && 'font-medium text-foreground',
                row.state === 'pending' && 'text-muted-foreground/60',
                row.state === 'failed' && 'text-red-700 dark:text-red-300 font-medium'
              )}
            >
              {row.label}
            </span>
            <span className="text-muted-foreground tabular-nums">{row.at ?? '—'}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
