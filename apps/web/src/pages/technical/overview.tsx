import { useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Download,
  Play,
  Shield,
  Sparkles,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Activity,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageTransition, StaggerGrid, StaggerItem } from '@/components/demo/page-transition';
import { AnimatedCounter } from '@/components/demo/animated-counter';
import { useApi } from '@/hooks/use-api';
import { useAuth } from '@/providers/auth-provider';
import { useAppStore } from '@/stores/app-store';
import { useDemoMode } from '@/hooks/use-demo-mode';
import { DonutChart, TrendAreaChart, NamedBarChart } from '@/components/analytics/charts';
import { getApiErrorMessage } from '@/lib/api';
import { resolveDemoApi } from '@/demo/resolver';

function getApiBase(): string {
  const configured = import.meta.env.VITE_API_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (import.meta.env.DEV) return 'http://localhost:3001';
  return '';
}

type Summary = {
  healthScore: number;
  criticalIssues: number;
  warnings: number;
  passedChecks: number;
  crawlQueue: number;
  fixProgress: number;
  scores: {
    overall: number;
    performance: number;
    seo: number;
    accessibility: number;
    content: number;
    security: number;
    technical: number;
  } | null;
  healthTrend: Array<{ date: string; value: number }>;
  issueBreakdown: Array<{ name: string; value: number }>;
  agents: Array<{ id: string; displayName: string; description: string }>;
  latestAudit: { id: string; status: string; health_score?: number; created_at: string } | null;
  recentAudits: Array<{ id: string; status: string; health_score?: number; created_at: string; target_url?: string }>;
};

type Issue = {
  id: string;
  title: string;
  module: string;
  severity: string;
  status: string;
  business_impact?: string;
  seo_impact?: string;
  explanation?: string;
  recommended_fix?: string;
  estimated_fix_minutes?: number;
  confidence_score?: number;
  suggested_fix?: Record<string, unknown>;
  page_url?: string;
};

export function TechnicalSeoOverviewPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const { getAccessToken } = useAuth();
  const orgId = useAppStore((s) => s.currentOrgId);
  const { isDemoMode } = useDemoMode();
  const queryClient = useQueryClient();
  const [targetUrl, setTargetUrl] = useState('https://example.com');
  const [mode, setMode] = useState<'full' | 'incremental' | 'quick'>('full');
  const [selected, setSelected] = useState<Issue | null>(null);

  const summary = useQuery({
    queryKey: ['technical-seo-summary', projectId],
    queryFn: () => request<{ data: Summary }>(`/v1/projects/${projectId}/technical-seo/summary`),
    enabled: !!projectId,
    refetchInterval: 15_000,
  });

  const issues = useQuery({
    queryKey: ['technical-seo-issues', projectId],
    queryFn: () => request<{ data: Issue[] }>(`/v1/projects/${projectId}/technical-seo/issues`),
    enabled: !!projectId,
  });

  const modules = useQuery({
    queryKey: ['technical-seo-modules', projectId],
    queryFn: () =>
      request<{ data: Array<{ id: string; label: string }> }>(
        `/v1/projects/${projectId}/technical-seo/modules`
      ),
    enabled: !!projectId,
  });

  const startAudit = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/technical-seo/audits`, {
        method: 'POST',
        body: JSON.stringify({ targetUrl, mode }),
      }),
    onSuccess: () => {
      toast.success('Technical audit queued');
      queryClient.invalidateQueries({ queryKey: ['technical-seo-summary', projectId] });
      queryClient.invalidateQueries({ queryKey: ['technical-seo-issues', projectId] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Audit failed to start')),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      request(`/v1/projects/${projectId}/technical-seo/issues/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      toast.success('Issue updated');
      queryClient.invalidateQueries({ queryKey: ['technical-seo-issues', projectId] });
      queryClient.invalidateQueries({ queryKey: ['technical-seo-summary', projectId] });
    },
  });

  async function download(format: 'csv' | 'xlsx' | 'json' | 'pdf') {
    try {
      const path = `/v1/projects/${projectId}/technical-seo/export?format=${format}`;
      let blob: Blob;
      if (isDemoMode) {
        const payload = resolveDemoApi(path, 'GET');
        blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      } else {
        const token = await getAccessToken();
        const res = await fetch(`${getApiBase()}${path}`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(orgId ? { 'X-Org-Id': orgId } : {}),
          },
        });
        if (!res.ok) throw new Error(await res.text());
        blob = await res.blob();
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `technical-seo-issues.${format === 'xlsx' ? 'csv' : format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Export failed'));
    }
  }

  const data = summary.data?.data;
  const issueRows = issues.data?.data ?? [];
  const scoreBars = useMemo(() => {
    if (!data?.scores) return [];
    return Object.entries(data.scores).map(([name, value]) => ({ name, value: Number(value) }));
  }, [data?.scores]);

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Wrench className="h-6 w-6" /> Technical SEO Engine
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Detect · explain · prioritize · recommend · generate fixes · track progress
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['csv', 'xlsx', 'json', 'pdf'] as const).map((f) => (
            <Button key={f} variant="outline" size="sm" onClick={() => download(f)}>
              <Download className="h-3 w-3 mr-1" /> {f.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Run site audit</CardTitle>
          <CardDescription>Full, incremental, or quick — powered by Browser Intelligence + AI rules</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 items-center">
          <Input
            className="max-w-md"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://yoursite.com"
          />
          <div className="flex gap-1">
            {(['full', 'incremental', 'quick'] as const).map((m) => (
              <Button
                key={m}
                size="sm"
                variant={mode === m ? 'default' : 'outline'}
                onClick={() => setMode(m)}
              >
                {m}
              </Button>
            ))}
          </div>
          <Button disabled={startAudit.isPending} onClick={() => startAudit.mutate()}>
            <Play className="h-4 w-4 mr-1" /> Start audit
          </Button>
        </CardContent>
      </Card>

      {summary.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : data ? (
        <>
          <StaggerGrid className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StaggerItem>
              <Kpi
                label="Website Health"
                value={data.healthScore}
                icon={<Shield className="h-4 w-4" />}
              />
            </StaggerItem>
            <StaggerItem>
              <Kpi
                label="Critical Issues"
                value={data.criticalIssues}
                icon={<AlertTriangle className="h-4 w-4" />}
              />
            </StaggerItem>
            <StaggerItem>
              <Kpi label="Warnings" value={data.warnings} icon={<Activity className="h-4 w-4" />} />
            </StaggerItem>
            <StaggerItem>
              <Kpi
                label="Passed Checks"
                value={data.passedChecks}
                icon={<CheckCircle2 className="h-4 w-4" />}
              />
            </StaggerItem>
          </StaggerGrid>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Health trend</CardTitle>
              </CardHeader>
              <CardContent className="h-56">
                <TrendAreaChart data={data.healthTrend} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Issue breakdown</CardTitle>
              </CardHeader>
              <CardContent className="h-56">
                <DonutChart data={data.issueBreakdown} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Score dimensions</CardTitle>
                <CardDescription>
                  Crawl queue {data.crawlQueue} · Fix progress {data.fixProgress}%
                </CardDescription>
              </CardHeader>
              <CardContent className="h-56">
                <NamedBarChart data={scoreBars} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4" /> AI agents
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(data.agents ?? []).map((a) => (
                  <div key={a.id} className="rounded-lg border p-2.5">
                    <p className="text-sm font-medium">{a.displayName}</p>
                    <p className="text-xs text-muted-foreground">{a.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Audit timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data.recentAudits ?? []).slice(0, 8).map((a) => (
                <div key={a.id} className="flex items-center justify-between text-sm border-b last:border-0 py-2">
                  <div>
                    <p className="font-mono text-xs">{a.id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">{a.target_url ?? '—'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>{a.status}</Badge>
                    <span className="text-muted-foreground text-xs">
                      {a.health_score != null ? `Score ${a.health_score}` : '—'}
                    </span>
                  </div>
                </div>
              ))}
              {(data.recentAudits ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No audits yet — start one above.</p>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Issues</CardTitle>
            <CardDescription>AI severity, impact, and recommended fixes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[28rem] overflow-auto">
            {issues.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              issueRows.map((issue) => (
                <button
                  key={issue.id}
                  type="button"
                  className="w-full text-left rounded-lg border p-3 hover:bg-muted/40 transition"
                  onClick={() => setSelected(issue)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{issue.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {issue.module} · ~{issue.estimated_fix_minutes ?? '?'}m · conf{' '}
                        {issue.confidence_score ?? '—'}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Badge className="text-[10px]">{issue.severity}</Badge>
                      <Badge className="text-[10px]">{issue.status}</Badge>
                    </div>
                  </div>
                </button>
              ))
            )}
            {!issues.isLoading && issueRows.length === 0 && (
              <p className="text-sm text-muted-foreground">No issues yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">AI Fix Assistant</CardTitle>
            <CardDescription>
              {(modules.data?.data ?? []).length} modules · select an issue
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!selected ? (
              <p className="text-muted-foreground">Select an issue to view impact and suggested fixes.</p>
            ) : (
              <>
                <p className="font-medium">{selected.title}</p>
                <p>
                  <span className="text-muted-foreground">Why it matters: </span>
                  {selected.explanation}
                </p>
                <p>
                  <span className="text-muted-foreground">Business: </span>
                  {selected.business_impact}
                </p>
                <p>
                  <span className="text-muted-foreground">SEO: </span>
                  {selected.seo_impact}
                </p>
                <p>
                  <span className="text-muted-foreground">Fix: </span>
                  {selected.recommended_fix}
                </p>
                {selected.suggested_fix && Object.keys(selected.suggested_fix).length > 0 && (
                  <pre className="text-[11px] bg-muted/50 rounded-md p-2 overflow-auto max-h-40">
                    {JSON.stringify(selected.suggested_fix, null, 2)}
                  </pre>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateStatus.mutate({ id: selected.id, status: 'in_progress' })}
                  >
                    In progress
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => updateStatus.mutate({ id: selected.id, status: 'fixed' })}
                  >
                    Mark fixed
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => updateStatus.mutate({ id: selected.id, status: 'ignored' })}
                  >
                    Ignore
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}

function Kpi({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span className="flex items-center gap-1">
            {icon}
            {label}
          </span>
        </div>
        <p className="text-2xl font-semibold">
          <AnimatedCounter value={value} />
        </p>
      </CardContent>
    </Card>
  );
}
