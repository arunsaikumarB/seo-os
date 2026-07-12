import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Lightbulb, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { TrendAreaChart } from '@/components/analytics/charts';
import { AnimatedCounter } from '@/components/demo/animated-counter';

type McAnalytics = {
  todaysPerformance: Record<string, number>;
  weeklyGrowth: Array<{ date: string; value: number }>;
  kpis: Array<{ key: string; label: string; value: number; unit?: string; deltaPct?: number }>;
  insights: Array<{ id: string; title: string; severity: string; recommendation?: string }>;
};

export function AnalyticsMissionWidget({ projectId }: { projectId: string }) {
  const { request } = useApi();
  const q = useQuery({
    queryKey: ['analytics-mc', projectId],
    queryFn: () =>
      request<{ data: McAnalytics }>(`/v1/projects/${projectId}/analytics/mission-control`),
    enabled: !!projectId,
    staleTime: 45_000,
    refetchInterval: 60_000,
  });

  const data = q.data?.data;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Executive Analytics
            </CardTitle>
            <CardDescription>Today · weekly growth · AI insights</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${projectId}/analytics/overview`}>Open Analytics</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !data ? (
          <p className="text-sm text-muted-foreground">Analytics unavailable</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(data.kpis ?? []).slice(0, 4).map((k) => (
                <div key={k.key} className="rounded-lg border p-2.5">
                  <p className="text-[10px] text-muted-foreground truncate">{k.label}</p>
                  <p className="text-lg font-semibold">
                    <AnimatedCounter value={k.value} suffix={k.unit ?? ''} />
                  </p>
                </div>
              ))}
            </div>

            <div>
              <p className="text-xs font-medium flex items-center gap-1 mb-2">
                <TrendingUp className="h-3 w-3" /> Weekly growth
              </p>
              <TrendAreaChart data={data.weeklyGrowth ?? []} height={160} />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium flex items-center gap-1">
                <Lightbulb className="h-3 w-3" /> Top insights
              </p>
              {(data.insights ?? []).slice(0, 3).map((ins) => (
                <div key={ins.id} className="flex items-start gap-2 text-xs">
                  <Badge className="text-[9px] shrink-0">{ins.severity}</Badge>
                  <span>{ins.title}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
