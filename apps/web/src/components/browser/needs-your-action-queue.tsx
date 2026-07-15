import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';

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

type Props = {
  projectId: string;
  /** Highlight a job when already on Assistant */
  activeJobId?: string | null;
  compact?: boolean;
  className?: string;
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

function formatElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function NeedsYourActionQueue({
  projectId,
  activeJobId,
  compact,
  className,
}: Props) {
  const q = useInterventions(projectId);
  const items = q.data?.data.items ?? [];
  const count = q.data?.data.count ?? items.length;

  if (q.isLoading) {
    return <Skeleton className={`h-24 w-full ${className ?? ''}`} />;
  }

  return (
    <Card className={className ?? (count > 0 ? 'border-amber-500/40 bg-amber-500/5' : undefined)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {count > 0 ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : null}
          Needs Your Action
          {count > 0 ? (
            <Badge className="text-[10px] bg-amber-500/20 text-amber-800 border-transparent">
              {count}
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription>
          {count > 0
            ? 'AI paused for login, CAPTCHA, MFA, or verification — other websites keep running.'
            : 'No websites need you right now. AI is handling the queue.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">All clear.</p>
        ) : (
          items.map((item) => (
            <div
              key={item.jobId}
              className={`rounded-md border px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 justify-between ${
                activeJobId === item.jobId ? 'ring-1 ring-amber-500' : 'bg-background/80'
              }`}
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{item.website}</p>
                <p className="text-xs text-amber-800 dark:text-amber-200">{item.reason}</p>
                {!compact ? (
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                    {item.instruction}
                  </p>
                ) : null}
                <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                  Waiting for User · {formatElapsed(item.elapsedMs)}
                  {item.autoResumePending ? ' · Resuming…' : ''}
                </p>
              </div>
              <Button size="sm" asChild className="shrink-0">
                <Link
                  to={`/projects/${projectId}/backlink-builder/browser-assistant?jobId=${item.jobId}`}
                >
                  {item.cta || 'Open'}
                  <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                </Link>
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/** Friendly Action Required card for a single intervention (Execution Center). */
export function ActionRequiredCard({
  projectId,
  item,
}: {
  projectId: string;
  item: InterventionItem;
}) {
  return (
    <Card className="border-amber-500/50 bg-gradient-to-br from-amber-500/10 to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Action Required
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Website</p>
          <p className="font-medium">{item.website}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Reason</p>
          <p className="font-medium text-amber-800 dark:text-amber-200">{item.reason}</p>
        </div>
        <p className="text-muted-foreground">{item.instruction}</p>
        <p className="text-xs text-muted-foreground">
          AI has completed everything possible. You only finish this one step.
        </p>
        <Button asChild>
          <Link
            to={`/projects/${projectId}/backlink-builder/browser-assistant?jobId=${item.jobId}`}
          >
            Open Browser Assistant
            <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
