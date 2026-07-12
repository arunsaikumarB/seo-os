import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, CheckCircle2, Gauge, ListTodo, Wrench } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';

type TechnicalSummary = {
  healthScore: number;
  criticalIssues: number;
  warnings: number;
  passedChecks: number;
  crawlQueue: number;
  fixProgress: number;
  healthTrend: Array<{ date: string; value: number }>;
  scores?: {
    overall: number;
    performance: number;
    seo: number;
    accessibility: number;
    content: number;
    security: number;
    technical: number;
  } | null;
};

export function TechnicalSeoMissionWidget({ projectId }: { projectId: string }) {
  const { request } = useApi();
  const q = useQuery({
    queryKey: ['technical-seo-summary', projectId],
    queryFn: () =>
      request<{ data: TechnicalSummary }>(`/v1/projects/${projectId}/technical-seo/summary`),
    enabled: !!projectId,
    staleTime: 30_000,
    refetchInterval: 45_000,
  });

  const data = q.data?.data;
  const trendDelta =
    data && data.healthTrend.length >= 2
      ? data.healthTrend[data.healthTrend.length - 1]!.value -
        data.healthTrend[data.healthTrend.length - 2]!.value
      : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4" /> Website Health
            </CardTitle>
            <CardDescription>Critical · warnings · crawl · fix progress</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${projectId}/technical/overview`}>Open Technical SEO</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data ? (
          <p className="text-sm text-muted-foreground">Technical SEO unavailable</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat
                label="Health"
                value={data.healthScore}
                icon={<Gauge className="h-3 w-3" />}
                suffix={trendDelta !== 0 ? ` ${trendDelta > 0 ? '↑' : '↓'}${Math.abs(trendDelta)}` : ''}
              />
              <Stat
                label="Critical"
                value={data.criticalIssues}
                icon={<AlertTriangle className="h-3 w-3" />}
              />
              <Stat label="Warnings" value={data.warnings} icon={<Activity className="h-3 w-3" />} />
              <Stat
                label="Passed"
                value={data.passedChecks}
                icon={<CheckCircle2 className="h-3 w-3" />}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <Badge className="gap-1">
                <ListTodo className="h-3 w-3" /> Crawl queue {data.crawlQueue}
              </Badge>
              <Badge className="gap-1">Fix progress {data.fixProgress}%</Badge>
              {data.scores && (
                <span className="text-muted-foreground">
                  Perf {data.scores.performance} · SEO {data.scores.seo} · A11y{' '}
                  {data.scores.accessibility} · Sec {data.scores.security}
                </span>
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
        {suffix}
      </p>
    </div>
  );
}
