import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { useAuth } from '@/providers/auth-provider';
import { getApiErrorMessage, getApiUrl } from '@/lib/api';
import { useAppStore } from '@/stores/app-store';
import { toast } from 'sonner';
import { PageTransition } from '@/components/demo/page-transition';
import { AiActivityCard } from '@/components/workflow/ai-activity-card';
import { isSuccessfulImportRecord } from '@/lib/import-success';
import { Upload, FileSpreadsheet, FileText, Link2, Sheet, Download } from 'lucide-react';

type ImportResult = {
  importId: string;
  stats: { total: number; valid: number; duplicates: number; invalid: number };
  pipeline?: { queued?: boolean; status?: string; jobId?: string | null } | null;
  message?: string;
  provisionalLanes?: {
    automatable: number;
    manual: number;
    samples?: Array<{ url: string; lane: string; reason: string | null }>;
    note?: string;
  };
};

type ImportRecord = {
  id: string;
  source_type: string;
  file_name?: string;
  status: string;
  total_rows: number;
  valid_rows: number;
  opportunities_created: number;
  created_at: string;
  metadata?: {
    classificationSummary?: {
      imported: number;
      classified: number;
      byType: Array<{ id: string; label: string; count: number }>;
      samples?: Array<{
        domain: string;
        type: string;
        label?: string;
        confidence: number;
        reason: string;
        queue: string;
        agent: string;
      }>;
    };
    provisionalLanes?: {
      automatable: number;
      manual: number;
      samples?: Array<{ url: string; lane: string; reason: string | null }>;
      note?: string;
    };
  };
};

const SOURCE_TYPES = [
  { id: 'url_list', label: 'Paste URLs', icon: Link2 },
  { id: 'csv', label: 'CSV', icon: FileSpreadsheet },
  { id: 'excel', label: 'Excel', icon: FileSpreadsheet },
  { id: 'txt', label: 'TXT', icon: FileText },
  { id: 'manual', label: 'Manual', icon: Upload },
] as const;

const ACTIVE_STATUSES = new Set(['analyzing', 'generating', 'queued', 'running']);

export function BacklinkImportPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const { getAccessToken } = useAuth();
  const orgId = useAppStore((s) => s.currentOrgId);
  const markStepComplete = useAppStore((s) => s.markStepComplete);
  const queryClient = useQueryClient();
  const [sourceType, setSourceType] = useState<string>('url_list');
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState<string | undefined>();

  const history = useQuery({
    queryKey: ['backlink-imports', projectId],
    queryFn: () =>
      request<{ data: ImportRecord[] }>(
        `/v1/projects/${projectId}/backlink-builder/automation/imports`
      ),
    enabled: !!projectId,
    refetchInterval: (q) => {
      const rows = q.state.data?.data ?? [];
      return rows.some((r) => ACTIVE_STATUSES.has(String(r.status))) ? 4000 : false;
    },
  });

  /** Phase 6.3.1 — confirmed / mixed Automation split (active CSM cohort) */
  const laneBoard = useQuery({
    queryKey: ['manual-submissions', projectId],
    queryFn: () =>
      request<{
        data: {
          counts: {
            automatable: number;
            manual: number;
            active: number;
            confidence: 'provisional' | 'confirmed' | 'mixed';
            assisted?: number;
            assistedReady?: number;
            assistedCheckFields?: number;
            assistedNeedsPerson?: number;
            manualOffline?: number;
          };
          items: Array<{ id: string; website: string; reason: string; url: string | null }>;
          assisted?: {
            assisted: number;
            ready: number;
            checkFields: number;
            needsPerson: number;
            conservationOk: boolean;
          } | null;
        };
      }>(`/v1/projects/${projectId}/backlink-builder/manual-submissions`),
    enabled: !!projectId,
    refetchInterval: () => {
      const rows = history.data?.data ?? [];
      const busy = rows.some((r) => ACTIVE_STATUSES.has(String(r.status)));
      return busy ? 4000 : 15_000;
    },
  });

  const importMutation = useMutation({
    mutationFn: () =>
      request<{ data: ImportResult }>(
        `/v1/projects/${projectId}/backlink-builder/automation/import`,
        {
          method: 'POST',
          body: JSON.stringify({ sourceType, content, fileName, runPipeline: true }),
        }
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['backlink-imports', projectId] });
      queryClient.invalidateQueries({ queryKey: ['automation-summary', projectId] });
      queryClient.invalidateQueries({ queryKey: ['manual-submissions', projectId] });
      if (res.data.stats.valid > 0) {
        markStepComplete(projectId, 'import-websites');
      }
      const p = res.data.provisionalLanes;
      toast.success(
        p
          ? `Imported ${res.data.stats.valid} — provisional Auto ${p.automatable} · Manual ${p.manual}`
          : `Imported ${res.data.stats.valid} websites — AI is reviewing them now`
      );
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Import failed')),
  });

  const downloadManualExcel = async () => {
    const token = await getAccessToken();
    const base = getApiUrl();
    const res = await fetch(
      `${base}/v1/projects/${projectId}/reports/manual-links.xlsx?format=xlsx`,
      {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(orgId ? { 'X-Org-Id': orgId } : {}),
        },
      }
    );
    if (!res.ok) {
      toast.error('Download failed');
      return;
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'manual-submissions.xlsx';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const isExcel = /\.xlsx?$/i.test(file.name);
    if (isExcel) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (result instanceof ArrayBuffer) {
          const bytes = new Uint8Array(result);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
          setContent(btoa(binary));
          setSourceType('excel');
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setContent(String(reader.result ?? ''));
      if (file.name.endsWith('.csv')) setSourceType('csv');
      else if (file.name.endsWith('.txt')) setSourceType('txt');
      else setSourceType('url_list');
    };
    reader.readAsText(file);
  };

  const latest = history.data?.data?.[0];
  const importRows = history.data?.data ?? [];
  const hasSuccessfulImport = importRows.some((r) => isSuccessfulImportRecord(r));
  const pipelineBusy =
    importMutation.isPending ||
    (latest != null && ACTIVE_STATUSES.has(String(latest.status)));

  const checklistItems = (() => {
    if (!hasSuccessfulImport && !pipelineBusy) {
      return [
        { label: 'Validate URLs', state: 'queued' as const },
        { label: 'Study websites', state: 'queued' as const },
        { label: 'Group by type', state: 'queued' as const },
        { label: 'Ready to approve', state: 'queued' as const },
      ];
    }
    if (pipelineBusy && !hasSuccessfulImport) {
      return [
        { label: 'Validate URLs', state: 'active' as const },
        { label: 'Study websites', state: 'queued' as const },
        { label: 'Group by type', state: 'queued' as const },
        { label: 'Ready to approve', state: 'queued' as const },
      ];
    }
    if (pipelineBusy) {
      return [
        { label: 'Validate URLs', state: 'done' as const },
        { label: 'Study websites', state: 'active' as const },
        { label: 'Group by type', state: 'queued' as const },
        { label: 'Ready to approve', state: 'queued' as const },
      ];
    }
    const classified = latest?.metadata?.classificationSummary;
    const classifiedDone =
      classified != null && Number(classified.classified ?? classified.imported ?? 0) > 0;
    return [
      { label: 'Validate URLs', state: 'done' as const },
      { label: 'Study websites', state: 'done' as const },
      {
        label: 'Group by type',
        state: classifiedDone ? ('done' as const) : ('queued' as const),
      },
      {
        label: 'Ready to approve',
        state: classifiedDone ? ('done' as const) : ('queued' as const),
      },
    ];
  })();

  const provisionalFromImport =
    importMutation.data?.data?.provisionalLanes ??
    latest?.metadata?.provisionalLanes ??
    null;
  const confirmedCounts = laneBoard.data?.data.counts;
  const showConfirmedSplit =
    confirmedCounts != null &&
    (confirmedCounts.automatable > 0 || confirmedCounts.manual > 0 || confirmedCounts.active > 0);
  const splitConfidence = showConfirmedSplit
    ? pipelineBusy
      ? 'mixed'
      : confirmedCounts.confidence
    : provisionalFromImport
      ? 'provisional'
      : null;
  const displayAuto = showConfirmedSplit
    ? confirmedCounts.automatable
    : (provisionalFromImport?.automatable ?? 0);
  const displayManualTotal = showConfirmedSplit
    ? confirmedCounts.manual
    : (provisionalFromImport?.manual ?? 0);
  const assistedCount = confirmedCounts?.assisted ?? 0;
  const displayManualOffline =
    confirmedCounts?.manualOffline ?? Math.max(0, displayManualTotal - assistedCount);
  const displayManual = displayManualTotal;
  const showAutomationSplit =
    provisionalFromImport != null || showConfirmedSplit;

  return (
    <PageTransition className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Upload className="h-6 w-6" /> Import Websites
        </h1>
        <p className="text-muted-foreground mt-1">
          Paste, CSV, Excel, or Sheets. AI validates, deduplicates, and studies each website.
        </p>
      </div>

      {(pipelineBusy || importMutation.isPending) && (
        <AiActivityCard
          title="AI is inspecting websites"
          percent={importMutation.isPending ? 40 : pipelineBusy ? 68 : 0}
          current={importMutation.isPending ? 'Validating URLs' : 'Analyzing forms'}
          next={importMutation.isPending ? 'Checking robots.txt' : 'Grouping opportunities'}
          eta="~1 min"
          items={[
            { label: 'Homepage', state: importMutation.isPending ? 'active' : 'done' },
            { label: 'Navigation', state: importMutation.isPending ? 'queued' : 'done' },
            { label: 'Forms', state: pipelineBusy && !importMutation.isPending ? 'active' : 'queued' },
            { label: 'Robots.txt', state: 'queued' },
            { label: 'Metadata', state: 'queued' },
          ]}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Import Source</CardTitle>
            <CardDescription>
              Import starts AI review automatically — you do not need to run anything else.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {SOURCE_TYPES.map((t) => (
                <Button
                  key={t.id}
                  size="sm"
                  variant={sourceType === t.id ? 'default' : 'outline'}
                  onClick={() => setSourceType(t.id)}
                >
                  <t.icon className="h-3.5 w-3.5 mr-1" /> {t.label}
                </Button>
              ))}
            </div>

            <textarea
              className="flex min-h-[200px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono"
              placeholder={
                sourceType === 'excel'
                  ? 'Upload an .xlsx file (URL column preferred) — binary is sent securely to the API'
                  : `https://example.com\nhttps://another-site.org\n...`
              }
              value={
                sourceType === 'excel' && content.length > 200
                  ? `[Excel file loaded: ${fileName ?? 'workbook.xlsx'}]`
                  : content
              }
              onChange={(e) => {
                if (sourceType !== 'excel') setContent(e.target.value);
              }}
              readOnly={sourceType === 'excel' && content.length > 200}
            />

            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".csv,.txt,.xlsx,.xls"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <Button size="sm" variant="outline" asChild>
                  <span>
                    <Upload className="h-3.5 w-3.5 mr-1" /> Upload File
                  </span>
                </Button>
              </label>
              <Button
                size="sm"
                disabled={!content.trim() || importMutation.isPending}
                onClick={() => importMutation.mutate()}
              >
                {importMutation.isPending ? 'Importing…' : 'Import & continue'}
              </Button>
            </div>
            {pipelineBusy && (
              <p className="text-xs text-muted-foreground">
                AI is reviewing in the background. Opportunity counts appear when review finishes.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <AiActivityCard
            title="After you import"
            percent={null}
            current={
              !hasSuccessfulImport && !pipelineBusy
                ? 'Waiting for your first import'
                : pipelineBusy
                  ? 'Validate & deduplicate'
                  : 'Import complete'
            }
            next={
              hasSuccessfulImport
                ? 'AI Review → Approve'
                : 'Paste URLs and click Import & continue'
            }
            items={checklistItems}
          />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Sheet className="h-4 w-4" /> Google Sheets
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <p className="text-muted-foreground">
                Connect Google when ready — paste or CSV works now.
              </p>
              <Button size="sm" variant="outline" disabled>
                Connect Google Sheets
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {showAutomationSplit && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">Automation split</CardTitle>
                <CardDescription className="mt-1">
                  {splitConfidence === 'provisional'
                    ? 'Provisional — URL heuristic only. Finalizes after AI review / crawl.'
                    : splitConfidence === 'mixed'
                      ? 'Updating — review still running; counts move Auto → Manual when gates are found.'
                      : 'Confirmed — Truth Engine / site profile findings on the active campaign cohort.'}
                  {confirmedCounts?.active != null ? (
                    <> · Active cohort {confirmedCounts.active}</>
                  ) : null}
                </CardDescription>
              </div>
              <Badge className="text-[10px] capitalize shrink-0">
                {splitConfidence}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p>
                  ✅ Automatable:{' '}
                  <span className="font-semibold tabular-nums">{displayAuto}</span>
                  <span className="text-muted-foreground"> — will run end-to-end automatically</span>
                </p>
                <p>
                  ✋ Manual:{' '}
                  <span className="font-semibold tabular-nums">{displayManual}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    — need you (CAPTCHA / Login / Cloudflare / Unsupported)
                  </span>
                </p>
                {showConfirmedSplit && assistedCount > 0 ? (
                  <p>
                    📋 Assisted Manual:{' '}
                    <span className="font-semibold tabular-nums">{assistedCount}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      — Ready {confirmedCounts?.assistedReady ?? 0} · Check{' '}
                      {confirmedCounts?.assistedCheckFields ?? 0} · Needs person{' '}
                      {confirmedCounts?.assistedNeedsPerson ?? 0}
                      {displayManualOffline > 0
                        ? ` · Offline Excel ${displayManualOffline}`
                        : ''}
                    </span>
                    {' · '}
                    <Link
                      className="underline-offset-2 hover:underline"
                      to={`/projects/${projectId}/backlink-builder/assisted-manual`}
                    >
                      Open worklist
                    </Link>
                  </p>
                ) : null}
              </div>
              {displayManual > 0 && (
                <Button size="sm" variant="outline" onClick={() => void downloadManualExcel()}>
                  <Download className="h-3.5 w-3.5 mr-1" /> Download Manual Excel
                </Button>
              )}
            </div>
            {!showConfirmedSplit && provisionalFromImport?.samples?.length ? (
              <ul className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
                {provisionalFromImport.samples.map((s) => (
                  <li key={s.url} className="truncate">
                    {s.lane === 'manual' ? 'Manual' : 'Auto'} — {s.url}
                    {s.reason ? ` (${s.reason})` : ''}
                  </li>
                ))}
              </ul>
            ) : null}
            {showConfirmedSplit && displayManual > 0 && (laneBoard.data?.data.items?.length ?? 0) > 0 ? (
              <ul className="text-xs text-muted-foreground space-y-1 max-h-40 overflow-y-auto border-t border-border/40 pt-2">
                {(laneBoard.data?.data.items ?? []).slice(0, 12).map((row) => (
                  <li key={row.id} className="truncate">
                    {row.reason} — {row.website}
                    {row.url ? ` · ${row.url}` : ''}
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      )}

      {latest?.metadata?.classificationSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI found opportunities</CardTitle>
            <CardDescription>
              {latest.metadata.classificationSummary.classified} of{' '}
              {latest.metadata.classificationSummary.imported} websites reviewed ·{' '}
              <Link
                className="underline underline-offset-2"
                to={`/projects/${projectId}/backlink-builder/classification`}
              >
                Open AI Review
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(latest.metadata.classificationSummary.byType ?? []).map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between border-b border-border/50 py-1.5 last:border-0 text-sm"
              >
                <span className="font-medium">{row.label}</span>
                <span className="tabular-nums font-semibold">{row.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(history.data?.data ?? []).map((imp) => (
              <div
                key={imp.id}
                className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{imp.file_name ?? `${imp.source_type} import`}</p>
                  <p className="text-xs text-muted-foreground">
                    {imp.valid_rows}/{imp.total_rows} valid · {imp.opportunities_created}{' '}
                    opportunities · {new Date(imp.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Badge
                  className={`text-[10px] capitalize ${
                    ACTIVE_STATUSES.has(imp.status)
                      ? 'animate-pulse'
                      : ''
                  }`}
                >
                  {ACTIVE_STATUSES.has(imp.status)
                    ? 'AI reviewing'
                    : imp.status === 'completed'
                      ? 'Ready'
                      : imp.status}
                </Badge>
              </div>
            ))}
            {!history.data?.data?.length && (
              <p className="text-muted-foreground text-sm">
                No imports yet. Paste URLs above to get started.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </PageTransition>
  );
}
