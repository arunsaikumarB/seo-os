import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Lightbulb, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageTransition, StaggerGrid, StaggerItem } from '@/components/demo/page-transition';
import { AnimatedCounter } from '@/components/demo/animated-counter';
import { useApi } from '@/hooks/use-api';
import { useAuth } from '@/providers/auth-provider';
import { useAppStore } from '@/stores/app-store';
import { useDemoMode } from '@/hooks/use-demo-mode';
import { TrendAreaChart, TrendLineChart, DonutChart, NamedBarChart } from '@/components/analytics/charts';
import { getApiErrorMessage } from '@/lib/api';
import { resolveDemoApi } from '@/demo/resolver';

function getApiBase(): string {
  const configured = import.meta.env.VITE_API_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (import.meta.env.DEV) return 'http://localhost:3001';
  return '';
}

const DASHBOARDS = [
  { key: 'executive', label: 'Executive' },
  { key: 'seo', label: 'SEO' },
  { key: 'backlinks', label: 'Backlinks' },
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'workflows', label: 'Workflows' },
  { key: 'relationships', label: 'Relationships' },
  { key: 'outreach', label: 'Outreach' },
  { key: 'ai', label: 'AI Workforce' },
  { key: 'team', label: 'Team' },
  { key: 'system', label: 'System' },
] as const;

type Overview = {
  kpis: Array<{
    key: string;
    label: string;
    value: number;
    deltaPct?: number;
    unit?: string;
    trend?: 'up' | 'down' | 'flat';
  }>;
  growth: {
    today: Record<string, number>;
    weekly: Array<{ date: string; value: number }>;
    monthly: Array<{ date: string; value: number }>;
  };
  insights: Array<{
    id: string;
    category: string;
    severity: string;
    title: string;
    body: string;
    recommendation?: string;
    metricDeltaPct?: number;
  }>;
  forecasts: Array<{
    metric: string;
    current: number;
    projected30d: number;
    projected90d: number;
    confidence: number;
    unit?: string;
  }>;
};

export function AnalyticsOverviewPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const { getAccessToken } = useAuth();
  const orgId = useAppStore((s) => s.currentOrgId);
  const { isDemoMode } = useDemoMode();

  const overview = useQuery({
    queryKey: ['analytics-overview', projectId],
    queryFn: () =>
      request<{ data: Overview }>(`/v1/projects/${projectId}/analytics/overview`),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  async function download(format: 'csv' | 'xlsx' | 'json') {
    try {
      const path = `/v1/projects/${projectId}/analytics/export?dashboard=executive&format=${format}`;
      let text: string;
      if (isDemoMode) {
        text = JSON.stringify(resolveDemoApi(path, 'GET'), null, 2);
      } else {
        const token = await getAccessToken();
        const res = await fetch(`${getApiBase()}${path}`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(orgId ? { 'X-Org-Id': orgId } : {}),
          },
        });
        text = await res.text();
        if (!res.ok) throw new Error(text || 'Export failed');
      }
      const blob = new Blob([text], {
        type: format === 'json' ? 'application/json' : 'text/csv',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `executive-analytics.${format === 'xlsx' ? 'csv' : format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(getApiErrorMessage(err, 'Export failed'));
    }
  }

  const data = overview.data?.data;

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics & Insights</h1>
          <p className="text-muted-foreground">
            Measurement layer across SEO, campaigns, outreach, workflows, and AI workforce
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => download('csv')}>
            <Download className="h-3 w-3 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => download('xlsx')}>
            <Download className="h-3 w-3 mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => download('json')}>
            <Download className="h-3 w-3 mr-1" /> JSON
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {DASHBOARDS.map((d) => (
          <Button
            key={d.key}
            variant={d.key === 'executive' ? 'default' : 'outline'}
            size="sm"
            asChild
          >
            <Link to={`/projects/${projectId}/analytics/${d.key === 'executive' ? 'overview' : d.key}`}>
              {d.label}
            </Link>
          </Button>
        ))}
      </div>

      {overview.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : overview.isError ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            {getApiErrorMessage(overview.error, 'Failed to load analytics')}
          </CardContent>
        </Card>
      ) : (
        data && (
          <>
            <StaggerGrid className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data.kpis.map((kpi) => (
                <StaggerItem key={kpi.key}>
                  <Card className="transition-all hover:shadow-md">
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">{kpi.label}</p>
                      <div className="flex items-end justify-between gap-2 mt-1">
                        <p className="text-2xl font-semibold">
                          <AnimatedCounter value={kpi.value} suffix={kpi.unit ?? ''} />
                        </p>
                        {kpi.deltaPct != null && (
                          <span
                            className={`flex items-center text-[11px] ${
                              (kpi.deltaPct ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'
                            }`}
                          >
                            {(kpi.deltaPct ?? 0) >= 0 ? (
                              <ArrowUpRight className="h-3 w-3" />
                            ) : (
                              <ArrowDownRight className="h-3 w-3" />
                            )}
                            {Math.abs(kpi.deltaPct)}%
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </StaggerItem>
              ))}
            </StaggerGrid>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" /> Weekly Growth
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TrendAreaChart data={data.growth.weekly} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Monthly Growth</CardTitle>
                </CardHeader>
                <CardContent>
                  <TrendLineChart data={data.growth.monthly} color="#0369a1" />
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Lightbulb className="h-4 w-4" /> AI Insights
                  </CardTitle>
                  <CardDescription>Auto-generated recommendations from live module data</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.insights.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No insights yet — generate activity across modules.</p>
                  ) : (
                    data.insights.map((ins) => (
                      <div key={ins.id} className="border-b border-border/40 pb-3 last:border-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className="text-[10px]">{ins.severity}</Badge>
                          <span className="text-sm font-medium">{ins.title}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{ins.body}</p>
                        {ins.recommendation && (
                          <p className="text-xs mt-1 text-teal-700 dark:text-teal-400">
                            → {ins.recommendation}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Forecasts</CardTitle>
                  <CardDescription>30 / 90 day projections</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.forecasts.map((f) => (
                    <div key={f.metric} className="flex items-center justify-between gap-3 text-sm">
                      <div>
                        <p className="font-medium capitalize">{f.metric.replace(/_/g, ' ')}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Confidence {Math.round(f.confidence * 100)}%
                        </p>
                      </div>
                      <div className="text-right text-xs">
                        <div>Now {f.current}{f.unit ? ` ${f.unit}` : ''}</div>
                        <div className="text-muted-foreground">30d {f.projected30d}</div>
                        <div className="text-teal-700 dark:text-teal-400">90d {f.projected90d}</div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Today&apos;s Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(data.growth.today).map(([k, v]) => (
                    <div key={k} className="rounded-lg border p-3">
                      <p className="text-[11px] text-muted-foreground capitalize">
                        {k.replace(/([A-Z])/g, ' $1')}
                      </p>
                      <p className="text-xl font-semibold">{v}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )
      )}
    </PageTransition>
  );
}

export function AnalyticsDashboardPage({ dashboardKey }: { dashboardKey: string }) {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const key = dashboardKey === 'overview' ? 'executive' : dashboardKey;

  const q = useQuery({
    queryKey: ['analytics-dashboard', projectId, key],
    queryFn: () =>
      request<{ data: Record<string, unknown> }>(
        `/v1/projects/${projectId}/analytics/dashboards/${key}`
      ),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const data = q.data?.data ?? {};

  async function download(format: 'csv' | 'json') {
    const blob = new Blob([JSON.stringify({ dashboard: key, data }, null, 2)], {
      type: format === 'json' ? 'application/json' : 'text/csv',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${key}-analytics.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const trend =
    (data.growthTrend as Array<{ date: string; value: number }> | undefined) ??
    (data.runTrend as Array<{ date: string; value: number }> | undefined) ??
    (data.sendTrend as Array<{ date: string; value: number }> | undefined) ??
    (data.progressTrend as Array<{ date: string; value: number }> | undefined) ??
    (data.opportunityTrend as Array<{ date: string; value: number }> | undefined) ??
    (data.activityTrend as Array<{ date: string; value: number }> | undefined) ??
    (data.eventTrend as Array<{ date: string; value: number }> | undefined);

  const named =
    (data.byType as Array<{ name: string; value: number }> | undefined) ??
    (data.byStatus as Array<{ name: string; value: number }> | undefined) ??
    (data.topAgents as Array<{ name: string; value: number }> | undefined) ??
    (data.topDomains as Array<{ name: string; value: number }> | undefined) ??
    (data.actionsByActor as Array<{ name: string; value: number }> | undefined);

  const funnel = data.funnel as Array<{ name: string; value: number }> | undefined;

  const scalarEntries = Object.entries(data).filter(
    ([, v]) => typeof v === 'number' || typeof v === 'string'
  );

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight capitalize">
            {key.replace(/_/g, ' ')} Analytics
          </h1>
          <p className="text-muted-foreground">Deep dive dashboard for {key}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${projectId}/analytics/overview`}>Overview</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => download('csv')}>
            <Download className="h-3 w-3 mr-1" /> Export
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {DASHBOARDS.map((d) => (
          <Button
            key={d.key}
            variant={d.key === key || (d.key === 'executive' && key === 'executive') ? 'default' : 'outline'}
            size="sm"
            asChild
          >
            <Link to={`/projects/${projectId}/analytics/${d.key === 'executive' ? 'overview' : d.key}`}>
              {d.label}
            </Link>
          </Button>
        ))}
      </div>

      {q.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          <StaggerGrid className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {scalarEntries.slice(0, 8).map(([k, v]) => (
              <StaggerItem key={k}>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground capitalize">{k.replace(/([A-Z])/g, ' $1')}</p>
                    <p className="text-2xl font-semibold mt-1">
                      {typeof v === 'number' ? <AnimatedCounter value={v} /> : String(v)}
                    </p>
                  </CardContent>
                </Card>
              </StaggerItem>
            ))}
          </StaggerGrid>

          <div className="grid gap-4 lg:grid-cols-2">
            {trend && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <TrendLineChart data={trend} />
                </CardContent>
              </Card>
            )}
            {named && named.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  {named.length <= 6 ? (
                    <DonutChart data={named} />
                  ) : (
                    <NamedBarChart data={named} />
                  )}
                </CardContent>
              </Card>
            )}
            {funnel && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Funnel</CardTitle>
                </CardHeader>
                <CardContent>
                  <NamedBarChart data={funnel} />
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </PageTransition>
  );
}
