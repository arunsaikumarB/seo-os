import { Card, CardContent } from '@/components/ui/card';
import {
  formatElapsed,
  useExecutionSummary,
} from '@/hooks/use-execution-summary';
import { formatEta } from '@/lib/bee-execution-ui';
import { cn } from '@/lib/utils';

type Props = {
  projectId: string;
  className?: string;
};

/**
 * Phase 4.7 — live AI activity feed + current website (polls shared Execution Summary).
 */
export function ExecutionLiveFeed({ projectId, className }: Props) {
  const { data: s } = useExecutionSummary(projectId, 1_500);
  if (!s) return null;

  const active =
    s.running > 0 ||
    s.waitingHuman > 0 ||
    s.campaignState === 'Running' ||
    s.campaignState === 'Starting' ||
    s.campaignState === 'Waiting Human';

  if (!active && !s.executionComplete) return null;

  if (s.executionComplete && s.total > 0) {
    return (
      <Card className={cn('rounded-2xl border-emerald-500/30 bg-emerald-500/[0.04]', className)}>
        <CardContent className="pt-5 space-y-3">
          <p className="text-base font-semibold">Campaign Finished</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Submitted</p>
              <p className="text-xl font-semibold tabular-nums">{s.completed}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Waiting Human</p>
              <p className="text-xl font-semibold tabular-nums">{s.waitingHuman}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Skipped</p>
              <p className="text-xl font-semibold tabular-nums">{s.skipped}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Failed</p>
              <p className="text-xl font-semibold tabular-nums">{s.failed}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Estimated Verification Time · {s.estimatedVerificationTime}
          </p>
        </CardContent>
      </Card>
    );
  }

  const feed =
    s.activityFeed.length > 0
      ? s.activityFeed
      : s.currentWebsite
        ? [{ website: s.currentWebsite, stage: s.currentStep || 'Working', at: '' }]
        : [];

  return (
    <div className={cn('space-y-3', className)}>
      {(s.currentWebsite || s.running > 0) && (
        <Card className="rounded-2xl border-border/40">
          <CardContent className="pt-5 space-y-2 text-sm">
            <p className="font-medium">Current Website</p>
            <p className="text-base font-semibold">{s.currentWebsite || 'Working…'}</p>
            <p className="text-muted-foreground">
              <span className="text-foreground/70">Current Step</span> ·{' '}
              {s.currentStep || 'Working'}
            </p>
            <div className="flex flex-wrap gap-4 text-muted-foreground tabular-nums">
              <span>
                <span className="text-foreground/70">Elapsed</span> ·{' '}
                {formatElapsed(s.currentElapsedMs)}
              </span>
              {s.etaSeconds > 0 ? (
                <span>
                  <span className="text-foreground/70">Estimated Remaining</span> ·{' '}
                  {formatEta(s.etaSeconds)}
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}

      {feed.length > 0 ? (
        <Card className="rounded-2xl border-border/40">
          <CardContent className="pt-5 pb-4">
            <p className="text-sm font-medium mb-3 flex items-center gap-2">
              <span aria-hidden>🤖</span> AI Activity
            </p>
            <ol className="space-y-2">
              {feed.slice(0, 8).map((row, i) => (
                <li key={`${row.website}-${row.stage}-${i}`} className="text-sm">
                  <p className="font-medium">{row.stage}</p>
                  <p className="text-muted-foreground text-xs">{row.website}</p>
                  {i < Math.min(feed.length, 8) - 1 ? (
                    <p className="text-muted-foreground text-xs py-0.5" aria-hidden>
                      ↓
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
