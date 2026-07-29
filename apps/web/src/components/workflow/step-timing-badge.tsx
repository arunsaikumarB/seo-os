import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatDurationMs,
  formatEstimateMinutes,
} from '@/lib/bee-execution-ui';

export type StepTimingPhase = 'idle' | 'running' | 'done';

export type StepTiming = {
  stepId: string;
  phase: StepTimingPhase;
  estimateMinutes: number;
  elapsedMs: number | null;
};

type Props = {
  timing?: StepTiming | null;
  /** Compact for stepper chips */
  compact?: boolean;
  className?: string;
};

/**
 * Clock badge: estimate (upcoming), live elapsed (running), or Took (done).
 */
export function StepTimingBadge({ timing, compact, className }: Props) {
  if (!timing) return null;

  let label: string;
  if (timing.phase === 'done' && timing.elapsedMs != null) {
    label = compact
      ? formatDurationMs(timing.elapsedMs)
      : `Took ${formatDurationMs(timing.elapsedMs)}`;
  } else if (timing.phase === 'running') {
    label =
      timing.elapsedMs != null
        ? compact
          ? formatDurationMs(timing.elapsedMs)
          : `${formatDurationMs(timing.elapsedMs)} · ETA ${formatEstimateMinutes(timing.estimateMinutes)}`
        : formatEstimateMinutes(timing.estimateMinutes);
  } else {
    label = formatEstimateMinutes(timing.estimateMinutes);
  }

  return (
    <span
      title={
        timing.phase === 'done'
          ? `Processing time: ${formatDurationMs(timing.elapsedMs)}`
          : timing.phase === 'running'
            ? 'Processing…'
            : `Typical time: ${formatEstimateMinutes(timing.estimateMinutes)}`
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
