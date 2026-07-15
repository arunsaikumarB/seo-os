import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import {
  FileBarChart,
  Plus,
  Play,
  Download,
  Mail,
  Share2,
  Palette,
  Clock,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageTransition, StaggerGrid, StaggerItem } from '@/components/demo/page-transition';
import { useApi } from '@/hooks/use-api';
import { useAuth } from '@/providers/auth-provider';
import { useAppStore } from '@/stores/app-store';
import { getApiErrorMessage } from '@/lib/api';
import { toast } from 'sonner';
import {
  OpportunitySelector,
  type SelectedOpportunity,
} from '@/components/opportunities/opportunity-selector';

type ReportTypeMeta = { type: string; label: string; description: string };
type ReportRow = {
  id: string;
  title: string;
  report_type: string;
  status: string;
  schedule: string;
  updated_at: string;
  next_run_at?: string | null;
};
type RunRow = {
  id: string;
  report_id: string;
  status: string;
  progress: number;
  created_at: string;
  executive_summary?: {
    narrative?: string;
    highlights?: string[];
    recommendations?: string[];
    risks?: string[];
    nextActions?: string[];
  };
};

function apiBase() {
  const configured = import.meta.env.VITE_API_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (import.meta.env.DEV) return 'http://localhost:3001';
  return '';
}

export function ReportsLibraryPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const { getAccessToken } = useAuth();
  const orgId = useAppStore((s) => s.currentOrgId);
  const qc = useQueryClient();
  const [selectedType, setSelectedType] = useState('executive');
  const [schedule, setSchedule] = useState('manual');
  const [brandName, setBrandName] = useState('Agency Brand');
  const [primaryColor, setPrimaryColor] = useState('#0d9488');
  const [emailTo, setEmailTo] = useState('');
  const [selectedOpp, setSelectedOpp] = useState<SelectedOpportunity | null>(null);
  const handleSelectOpp = useCallback((opp: SelectedOpportunity | null) => {
    setSelectedOpp(opp);
  }, []);

  const types = useQuery({
    queryKey: ['report-types', projectId],
    queryFn: () =>
      request<{ data: ReportTypeMeta[] }>(`/v1/projects/${projectId}/reports/types`),
    enabled: !!projectId,
  });
  const reports = useQuery({
    queryKey: ['reports', projectId],
    queryFn: () =>
      request<{ data: ReportRow[] }>(`/v1/projects/${projectId}/reports`),
    enabled: !!projectId,
  });
  const summary = useQuery({
    queryKey: ['reports-summary', projectId],
    queryFn: () =>
      request<{
        data: {
          totalReports: number;
          scheduled: number;
          readyCount: number;
          failedCount: number;
          queue: unknown[];
        };
      }>(`/v1/projects/${projectId}/reports/summary`),
    enabled: !!projectId,
    refetchInterval: 20_000,
  });
  const runs = useQuery({
    queryKey: ['report-runs', projectId],
    queryFn: () =>
      request<{ data: RunRow[] }>(`/v1/projects/${projectId}/reports/runs`),
    enabled: !!projectId,
    refetchInterval: 10_000,
  });

  const createReport = useMutation({
    mutationFn: () => {
      const typeLabel =
        types.data?.data.find((t) => t.type === selectedType)?.label ?? selectedType;
      const title = selectedOpp
        ? `${typeLabel} — ${selectedOpp.website}`
        : undefined;
      return request<{ data: ReportRow }>(`/v1/projects/${projectId}/reports`, {
        method: 'POST',
        body: JSON.stringify({
          reportType: selectedType,
          schedule,
          title,
        }),
      });
    },
    onSuccess: () => {
      toast.success(
        selectedOpp
          ? `Report created for ${selectedOpp.website}`
          : 'Report created'
      );
      void qc.invalidateQueries({ queryKey: ['reports', projectId] });
      void qc.invalidateQueries({ queryKey: ['reports-summary', projectId] });
    },
  });

  const saveBrand = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/reports/brands`, {
        method: 'POST',
        body: JSON.stringify({
          name: brandName,
          primaryColor,
          secondaryColor: '#0369a1',
          coverTitle: 'Executive Intelligence Report',
          footerText: 'Confidential — SEO OS Reports',
          agencyName: brandName,
          isDefault: true,
        }),
      }),
    onSuccess: () => toast.success('White-label brand saved'),
  });

  const generate = useMutation({
    mutationFn: (reportId: string) =>
      request(`/v1/projects/${projectId}/reports/${reportId}/generate`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Report generation started');
      void qc.invalidateQueries({ queryKey: ['report-runs', projectId] });
      void qc.invalidateQueries({ queryKey: ['reports-summary', projectId] });
    },
  });

  async function download(runId: string, format: string) {
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `${apiBase()}/v1/projects/${projectId}/reports/runs/${runId}/export?format=${format}`,
        {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(orgId ? { 'X-Org-Id': orgId } : {}),
          },
        }
      );
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report.${format === 'pptx' ? 'pptx' : format === 'pdf' ? 'pdf' : format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Export failed'));
    }
  }

  const emailRun = useMutation({
    mutationFn: (runId: string) =>
      request(`/v1/projects/${projectId}/reports/runs/${runId}/email`, {
        method: 'POST',
        body: JSON.stringify({ recipient: emailTo }),
      }),
    onSuccess: () => toast.success('Report emailed via outreach provider'),
  });

  const shareRun = useMutation({
    mutationFn: (runId: string) =>
      request(`/v1/projects/${projectId}/reports/runs/${runId}/share`, { method: 'POST' }),
    onSuccess: () => toast.success('Shared internally'),
  });

  const latestReady = (runs.data?.data ?? []).find((r) => r.status === 'ready');
  const s = summary.data?.data;

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <FileBarChart className="h-6 w-6" /> Reports
          </h1>
          <p className="text-muted-foreground">
            Backlink operations Excel exports and executive report library
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={async () => {
              try {
                const token = await getAccessToken();
                const res = await fetch(
                  `${apiBase()}/v1/projects/${projectId}/reports/backlink-ops.xlsx`,
                  {
                    headers: {
                      ...(token ? { Authorization: `Bearer ${token}` } : {}),
                      ...(orgId ? { 'X-Org-Id': orgId } : {}),
                    },
                  }
                );
                if (!res.ok) throw new Error(await res.text());
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'backlink-operations.xlsx';
                a.click();
                URL.revokeObjectURL(url);
              } catch (err) {
                toast.error(getApiErrorMessage(err, 'Excel export failed'));
              }
            }}
          >
            Download Backlink Ops Excel
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${projectId}/analytics/overview`}>Open Analytics</Link>
          </Button>
        </div>
      </div>

      <StaggerGrid className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Reports', value: s?.totalReports ?? 0, icon: FileBarChart },
          { label: 'Scheduled', value: s?.scheduled ?? 0, icon: Clock },
          { label: 'Ready runs', value: s?.readyCount ?? 0, icon: CheckCircle2 },
          { label: 'Failed', value: s?.failedCount ?? 0, icon: AlertTriangle },
        ].map((card) => (
          <StaggerItem key={card.label}>
            <Card>
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className="text-2xl font-semibold">{card.value}</p>
                </div>
                <card.icon className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </StaggerItem>
        ))}
      </StaggerGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4" /> Create report
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(types.data?.data ?? []).map((t) => (
                <Button
                  key={t.type}
                  size="sm"
                  variant={selectedType === t.type ? 'default' : 'outline'}
                  onClick={() => setSelectedType(t.type)}
                >
                  {t.label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {['manual', 'on_demand', 'weekly', 'monthly', 'quarterly'].map((sch) => (
                <Button
                  key={sch}
                  size="sm"
                  variant={schedule === sch ? 'default' : 'outline'}
                  onClick={() => setSchedule(sch)}
                >
                  {sch}
                </Button>
              ))}
            </div>
            <OpportunitySelector
              projectId={projectId}
              selectedId={selectedOpp?.id ?? null}
              onSelect={handleSelectOpp}
              mode="content"
              showTable={false}
              showRequiredFields={false}
              allowClear
              label="Focus website (optional)"
              emptyMessage="No approved opportunities available. Approve websites in Opportunity Queue first — or create a project-wide report without a website focus."
            />
            <Button onClick={() => createReport.mutate()} disabled={createReport.isPending}>
              Create {selectedType.replace(/_/g, ' ')} report
              {selectedOpp ? ` — ${selectedOpp.website}` : ''}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-4 w-4" /> White label
            </CardTitle>
            <CardDescription>Logo colors, cover, footer, agency info</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Agency name" />
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground">Primary</label>
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-8 w-12 cursor-pointer"
              />
              <span className="text-xs font-mono">{primaryColor}</span>
            </div>
            <Button variant="outline" onClick={() => saveBrand.mutate()}>
              Save brand defaults
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Report library</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {reports.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (reports.data?.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-6">No reports yet — create one above.</p>
          ) : (
            (reports.data?.data ?? []).map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 py-3 last:border-0"
              >
                <div>
                  <p className="font-medium">{r.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {r.report_type} · {r.schedule} · {r.status}
                    {r.next_run_at ? ` · next ${new Date(r.next_run_at).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge className="text-[10px]">{r.status}</Badge>
                  <Button size="sm" variant="outline" onClick={() => generate.mutate(r.id)}>
                    <Play className="h-3 w-3 mr-1" /> Generate
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Runs & delivery</CardTitle>
          <CardDescription>Progress, exports (PDF/PPT/CSV/Excel/JSON), email, share</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(runs.data?.data ?? []).slice(0, 8).map((run) => (
            <div key={run.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Run {run.id.slice(0, 8)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {run.status} · {run.progress}% · {new Date(run.created_at).toLocaleString()}
                  </p>
                </div>
                <Badge className="text-[10px]">{run.status}</Badge>
              </div>
              {run.status === 'ready' && run.executive_summary?.narrative && (
                <p className="text-xs text-muted-foreground">{run.executive_summary.narrative}</p>
              )}
              {run.status === 'ready' && (
                <div className="flex flex-wrap gap-2">
                  {['pdf', 'pptx', 'csv', 'xlsx', 'json'].map((fmt) => (
                    <Button key={fmt} size="sm" variant="outline" onClick={() => download(run.id, fmt)}>
                      <Download className="h-3 w-3 mr-1" /> {fmt.toUpperCase()}
                    </Button>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => shareRun.mutate(run.id)}>
                    <Share2 className="h-3 w-3 mr-1" /> Share
                  </Button>
                </div>
              )}
            </div>
          ))}

          {latestReady && (
            <div className="flex flex-wrap gap-2 items-center pt-2">
              <Input
                className="max-w-xs"
                placeholder="email@client.com"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
              />
              <Button
                size="sm"
                disabled={!emailTo}
                onClick={() => emailRun.mutate(latestReady.id)}
              >
                <Mail className="h-3 w-3 mr-1" /> Email latest PDF
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </PageTransition>
  );
}
