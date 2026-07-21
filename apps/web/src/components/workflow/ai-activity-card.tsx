import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AiActivityItem = {
  label: string;
  state: 'done' | 'active' | 'queued';
};

type Props = {
  title: string;
  percent?: number | null;
  current?: string | null;
  next?: string | null;
  eta?: string | null;
  items?: AiActivityItem[];
  className?: string;
};

/** Live-feeling AI activity card — replaces static “what happens next” copy */
export function AiActivityCard({
  title,
  percent,
  current,
  next,
  eta,
  items,
  className,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        'rounded-2xl border border-border/40 bg-card px-4 py-4 shadow-sm space-y-3',
        className
      )}
    >
      <div className="flex items-start gap-2">
        <Loader2 className="h-4 w-4 mt-0.5 animate-spin text-primary shrink-0" />
        <div className="min-w-0">
          <p className="font-medium text-sm">{title}</p>
          {current ? (
            <p className="text-xs text-muted-foreground mt-0.5">Current · {current}</p>
          ) : null}
          {next ? (
            <p className="text-xs text-muted-foreground">Next · {next}</p>
          ) : null}
        </div>
        {eta ? (
          <p className="text-xs text-muted-foreground tabular-nums ml-auto shrink-0">ETA {eta}</p>
        ) : null}
      </div>

      {percent != null ? (
        <div>
          <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
            <span>Progress</span>
            <span className="tabular-nums">{Math.round(percent)}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>
      ) : null}

      {items && items.length > 0 ? (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {items.map((item) => (
            <li
              key={item.label}
              className="flex items-center justify-between text-xs rounded-lg bg-muted/40 px-2.5 py-1.5"
            >
              <span>{item.label}</span>
              <span
                className={cn(
                  'tabular-nums font-medium',
                  item.state === 'done' && 'text-emerald-700',
                  item.state === 'active' && 'text-primary',
                  item.state === 'queued' && 'text-muted-foreground'
                )}
              >
                {item.state === 'done' ? '✓' : item.state === 'active' ? '…' : 'Queued'}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </motion.div>
  );
}

/** Intelligent loading placeholder */
export function AiLoadingState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-muted/20 px-4 py-8 justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
