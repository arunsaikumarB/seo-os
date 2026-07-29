import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDurationMs } from '@/lib/bee-execution-ui';

export type StepTimingPhase = 'idle' | 'running' | 'done';

export type StepTiming = {
  stepId: string;
  phase: StepTimingPhase;
  estimateMinutes?: number;
  elapsedMs: number | null;
  /** ISO start — used to tick live elapsed while processing */
  startedAt?: string | null;
};

type Props = {
  timing?: StepTiming | null;
  compact?: boolean;
  className?: string;
};

/**
 * Clock only while processing or after finish — never shows estimates.
 */
export function StepTimingBadge({ timing, compact, className }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (timing?.phase !== 'running') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [timing?.phase, timing?.startedAt, timing?.stepId]);

  if (!timing) return null;
  if (timing.phase === 'idle') return null;

  let ms: number | null = timing.elapsedMs;
  if (timing.phase === 'running' && timing.startedAt) {
    const start = new Date(timing.startedAt).getTime();
    if (Number.isFinite(start)) ms = Math.max(0, now - start);
  }

  if (ms == null || ms < 0) return null;

  const label =
    timing.phase === 'done'
      ? compact
        ? formatDurationMs(ms)
        : `Took ${formatDurationMs(ms)}`
      : formatDurationMs(ms);

  return (
    <span
      title={
        timing.phase === 'done'
          ? `Processing time: ${formatDurationMs(ms)}`
          : 'Time spent processing'
      }
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border/40 bg-muted/40 text-muted-foreground tabular-nums',
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]',
        timing.phase === 'done' && 'text-emerald-800 dark:text-emerald-300 border-emerald-500/20',
        timing.phase === 'running' && 'text-foreground',
        className
      )}
    >
      <Clock className={cn(compact ? 'h-2.5 w-2.5' : 'h-3 w-3', 'shrink-0 opacity-70')} />
      <span>{label}</span>
    </span>
  );
}
