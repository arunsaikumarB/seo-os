import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Plug, RefreshCw, Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';

export function IntegrationsMissionWidget({ projectId }: { projectId: string }) {
  const { request } = useApi();
  const q = useQuery({
    queryKey: ['integrations-summary', projectId],
    queryFn: () =>
      request<{
        data: {
          connectedCount: number;
          syncQueue: number;
          lastSyncAt: string | null;
          failedSyncs: number;
          apiHealth: { status: string; healthy: number; degraded: number; down: number };
        };
      }>(`/v1/projects/${projectId}/integrations/summary`),
    enabled: !!projectId,
    staleTime: 30_000,
    refetchInterval: 45_000,
  });

  const data = q.data?.data;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Plug className="h-4 w-4" /> Integrations
            </CardTitle>
            <CardDescription>Connected · sync queue · API health</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${projectId}/integrations/hub`}>Open Hub</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data ? (
          <p className="text-sm text-muted-foreground">Integrations unavailable</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat label="Connected" value={data.connectedCount} icon={<Plug className="h-3 w-3" />} />
              <Stat label="Sync queue" value={data.syncQueue} icon={<RefreshCw className="h-3 w-3" />} />
              <Stat label="Failed" value={data.failedSyncs} icon={<AlertTriangle className="h-3 w-3" />} />
              <Stat
                label="API health"
                value={data.apiHealth.healthy}
                icon={<Activity className="h-3 w-3" />}
                suffix={` · ${data.apiHealth.status}`}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Last sync:{' '}
              {data.lastSyncAt ? new Date(data.lastSyncAt).toLocaleString() : 'Never'}
            </p>
            <Badge className="text-[10px]">{data.apiHealth.status}</Badge>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  icon,
  suffix = '',
}: {
  label: string;
  value: number;
  icon?: ReactNode;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border p-2.5">
      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-lg font-semibold">
        {value}
        <span className="text-xs font-normal text-muted-foreground">{suffix}</span>
      </p>
    </div>
  );
}
