import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Database,
  HardDrive,
  HeartPulse,
  Layers,
  Plug,
  RefreshCw,
  Server,
  Shield,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';

type OpsHealth = {
  status: string;
  latencyMs: number;
  checks: Record<string, string>;
  metrics: {
    uptimeSec: number;
    requests: number;
    errors: number;
    avgMs: number;
    errorRate?: number;
    successRate?: number;
    pendingJobs?: number;
  };
  queues?: Record<string, number>;
  memory?: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
  providerFramework?: { healthy: number; offline: number; warning: number };
  environment?: { nodeEnv: string; workersEnabled: boolean; providerMode: string };
  version?: string;
};

function statusTone(status?: string) {
  if (status === 'ok' || status === 'healthy' || status === 'configured') return 'text-emerald-600';
  if (status === 'degraded' || status === 'warning' || status === 'missing') return 'text-amber-600';
  if (status === 'down' || status === 'critical') return 'text-destructive';
  return 'text-muted-foreground';
}

export function DiagnosticsPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();

  const ops = useQuery({
    queryKey: ['ops-health'],
    queryFn: async () => {
      // Public ops endpoint — no project scope required
      const base = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? '';
      const res = await fetch(`${base}/ops/health`);
      if (!res.ok) throw new Error(`Ops health HTTP ${res.status}`);
      const json = (await res.json()) as { data: OpsHealth };
      return json.data;
    },
    refetchInterval: 30_000,
  });

  const flags = useQuery({
    queryKey: ['feature-flags-diag'],
    queryFn: () => request<{ data: Record<string, boolean> }>('/v1/feature-flags'),
  });

  const d = ops.data;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <HeartPulse className="h-6 w-6" /> System Diagnostics
          </h1>
          <p className="text-muted-foreground">
            Enterprise health for API, workers, queues, providers, database, and environment.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={ops.isFetching}
          onClick={() => ops.refetch()}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
        </Button>
      </div>

      {ops.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : ops.isError ? (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">
            Unable to load ops health. Check API connectivity and try again.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {(
              [
                ['Status', d?.status],
                ['Latency', `${d?.latencyMs ?? '—'} ms`],
                ['Success rate', `${d?.metrics?.successRate ?? '—'}%`],
                ['Pending jobs', d?.metrics?.pendingJobs ?? 0],
              ] as const
            ).map(([label, value]) => (
              <Card key={label}>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`text-xl font-semibold capitalize ${statusTone(String(value))}`}>
                    {String(value)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Server className="h-4 w-4" /> Subsystem checks
              </CardTitle>
              <CardDescription>
                Version {d?.version ?? '—'} · env {d?.environment?.nodeEnv ?? '—'} · workers{' '}
                {d?.environment?.workersEnabled ? 'on' : 'off'}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-3 text-sm">
              {Object.entries(d?.checks ?? {}).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="capitalize flex items-center gap-2">
                    {key === 'database' ? (
                      <Database className="h-3.5 w-3.5" />
                    ) : key === 'storage' ? (
                      <HardDrive className="h-3.5 w-3.5" />
                    ) : key === 'queue' || key === 'workers' ? (
                      <Layers className="h-3.5 w-3.5" />
                    ) : key === 'encryption' || key === 'sentry' ? (
                      <Shield className="h-3.5 w-3.5" />
                    ) : (
                      <Activity className="h-3.5 w-3.5" />
                    )}
                    {key}
                  </span>
                  <Badge className={`text-[10px] capitalize ${statusTone(value)}`}>{value}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Queues</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {Object.entries(d?.queues ?? {}).length === 0 ? (
                  <p className="text-muted-foreground">No queue depths reported.</p>
                ) : (
                  Object.entries(d?.queues ?? {}).map(([q, n]) => (
                    <div key={q} className="flex justify-between rounded-md border px-3 py-2">
                      <span>{q}</span>
                      <span className="tabular-nums font-medium">{n}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Memory & providers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  RSS {d?.memory?.rssMb ?? '—'} MB · Heap {d?.memory?.heapUsedMb ?? '—'} /{' '}
                  {d?.memory?.heapTotalMb ?? '—'} MB
                </p>
                <p className="flex items-center gap-2">
                  <Plug className="h-3.5 w-3.5" />
                  Providers healthy {d?.providerFramework?.healthy ?? 0} · offline{' '}
                  {d?.providerFramework?.offline ?? 0} · warning{' '}
                  {d?.providerFramework?.warning ?? 0}
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  {projectId && (
                    <>
                      <Button size="sm" variant="outline" asChild>
                        <Link to={`/projects/${projectId}/providers`}>Providers</Link>
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <Link to={`/projects/${projectId}/mission-control`}>Mission Control</Link>
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Feature flags</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1">
              {Object.entries(flags.data?.data ?? {})
                .slice(0, 40)
                .map(([k, v]) => (
                  <Badge key={k} className="text-[10px]">
                    {k}:{v ? 'on' : 'off'}
                  </Badge>
                ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
