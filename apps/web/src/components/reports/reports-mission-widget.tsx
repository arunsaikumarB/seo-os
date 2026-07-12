import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileBarChart, Clock, AlertTriangle, ListChecks } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';

export function ReportsMissionWidget({ projectId }: { projectId: string }) {
  const { request } = useApi();
  const q = useQuery({
    queryKey: ['reports-summary', projectId],
    queryFn: () =>
      request<{
        data: {
          totalReports: number;
          scheduled: number;
          readyCount: number;
          failedCount: number;
          recentReady: Array<{ id: string; status: string; created_at: string }>;
          failed: Array<{ id: string; status: string }>;
          queue: Array<{ id: string; status: string }>;
        };
      }>(`/v1/projects/${projectId}/reports/summary`),
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
              <FileBarChart className="h-4 w-4" /> Reports
            </CardTitle>
            <CardDescription>Recent · scheduled · queue · failures</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${projectId}/reports/library`}>Open Reports</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data ? (
          <p className="text-sm text-muted-foreground">Reports unavailable</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat label="Library" value={data.totalReports} />
              <Stat label="Scheduled" value={data.scheduled} icon={<Clock className="h-3 w-3" />} />
              <Stat label="Queue" value={data.queue?.length ?? 0} icon={<ListChecks className="h-3 w-3" />} />
              <Stat
                label="Failed"
                value={data.failedCount}
                icon={<AlertTriangle className="h-3 w-3" />}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Recent ready</p>
              {(data.recentReady ?? []).slice(0, 3).map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <span className="font-mono">{r.id.slice(0, 8)}</span>
                  <Badge className="text-[9px]">{r.status}</Badge>
                </div>
              ))}
              {(data.recentReady ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">No ready runs yet</p>
              )}
            </div>
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
}: {
  label: string;
  value: number;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-lg border p-2.5">
      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
