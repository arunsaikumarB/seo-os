import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useImageGenerationReadiness } from '@/components/images/image-generation-readiness';

type Summary = {
  generated?: number;
  queued?: number;
  approved?: number;
  rejected?: number;
  todaysImages?: number;
  bestProvider?: string;
  providerHealth?: Array<{ key: string; status: string; latencyMs?: number }>;
};

export function ImageProviderMissionWidget({
  projectId,
  summary,
}: {
  projectId: string;
  summary?: Summary | null;
}) {
  const readiness = useImageGenerationReadiness(projectId);
  const data = readiness.data?.data;

  if (readiness.isLoading && !summary) return <Skeleton className="h-24 w-full" />;

  const provider =
    data?.providers.find((p) => p.key === data.defaultProviderKey) ?? data?.providers[0];
  const health =
    summary?.providerHealth?.find((p) => p.key === provider?.key) ??
    (provider
      ? { key: provider.key, status: provider.health.status, latencyMs: provider.health.latencyMs }
      : null);

  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Provider</p>
          <p className="font-medium capitalize">
            {provider?.displayName ?? summary?.bestProvider ?? '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Health</p>
          <p className="font-medium capitalize flex items-center gap-2">
            {health?.status ?? 'unknown'}
            <Badge
              className={
                data?.imageGenerationReady
                  ? 'bg-emerald-500/15 text-emerald-700 text-[10px]'
                  : 'bg-amber-500/15 text-amber-700 text-[10px]'
              }
            >
              {data?.overallStatus ?? '…'}
            </Badge>
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Latency</p>
          <p className="font-medium tabular-nums">
            {health?.latencyMs != null ? `${health.latencyMs} ms` : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Queue / Jobs</p>
          <p className="font-medium tabular-nums">
            {summary?.queued ?? 0} / {data?.activeJobs ?? 0}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Generated Today</p>
          <p className="font-medium tabular-nums">{summary?.todaysImages ?? summary?.generated ?? 0}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Rejected</p>
          <p className="font-medium tabular-nums">{summary?.rejected ?? 0}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Ready</p>
          <p className="font-medium tabular-nums">{summary?.approved ?? 0}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Readiness</p>
          <p className="font-medium tabular-nums">{data?.readinessScore ?? 0}%</p>
        </div>
      </div>
      {!data?.imageGenerationReady && data?.primaryBlocker && (
        <p className="text-xs text-amber-700">{data.primaryBlocker.reason}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link to={`/projects/${projectId}/backlink-builder/image-studio`}>Image Studio</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/projects/${projectId}/providers`}>Provider Settings</Link>
        </Button>
      </div>
    </div>
  );
}
