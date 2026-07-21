import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { getApiErrorMessage } from '@/lib/api';
import { toast } from 'sonner';
import { BacklinkBuilderNav } from '@/components/backlink-builder/backlink-builder-widget';
import { PageTransition } from '@/components/demo/page-transition';
import { Upload, FileSpreadsheet, FileText, Link2, Play, ArrowRight, Sheet } from 'lucide-react';

type ImportResult = {
  importId: string;
  stats: { total: number; valid: number; duplicates: number; invalid: number };
  pipeline?: { queued?: boolean; status?: string; jobId?: string | null } | null;
  message?: string;
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
  const queryClient = useQueryClient();
  const [sourceType, setSourceType] = useState<string>('url_list');
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState<string | undefined>();
  const [lastImportId, setLastImportId] = useState<string | null>(null);

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
      const pipelineStarted = Boolean(res.data.pipeline);
      setLastImportId(res.data.importId);
      queryClient.invalidateQueries({ queryKey: ['backlink-imports', projectId] });
      queryClient.invalidateQueries({ queryKey: ['automation-summary', projectId] });
      if (pipelineStarted) {
        toast.success(
          `Imported ${res.data.stats.valid} URLs — automation pipeline started (classify & score)`
        );
      } else {
        toast.success(`Imported ${res.data.stats.valid} valid URLs`);
      }
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Import failed')),
  });

  const runPipeline = useMutation({
    mutationFn: (importId: string) =>
      request<{ data: { queued?: boolean; status?: string; message?: string } }>(
        `/v1/projects/${projectId}/backlink-builder/automation/imports/${importId}/run`,
        { method: 'POST' }
      ),
    onSuccess: (res) => {
      const status = res.data?.status ?? (res.data?.queued ? 'queued' : 'started');
      toast.success(
        status === 'already_active'
          ? 'Pipeline already running for this import'
          : 'Automation pipeline started — watch Import History for opportunity counts'
      );
      queryClient.invalidateQueries({ queryKey: ['backlink-imports', projectId] });
      queryClient.invalidateQueries({ queryKey: ['automation-summary', projectId] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Pipeline failed')),
  });

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
  const pipelineBusy =
    importMutation.isPending ||
    runPipeline.isPending ||
    (latest != null && ACTIVE_STATUSES.has(String(latest.status)));

  return (
    <PageTransition className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <BacklinkBuilderNav />
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Upload className="h-6 w-6" /> Import Websites
        </h1>
        <p className="text-muted-foreground mt-1">
          Paste, CSV, Excel, or Sheets. AI validates, deduplicates, and studies each website.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Import Source</CardTitle>
            <CardDescription>
              Validate & Import also starts the automation pipeline (analyze → classify → score →
              queue)
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
                {importMutation.isPending ? 'Importing…' : 'Validate & Import'}
              </Button>
              {(lastImportId || latest?.id) && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={runPipeline.isPending || pipelineBusy}
                  onClick={() => runPipeline.mutate(lastImportId ?? String(latest?.id))}
                >
                  <Play className="h-3.5 w-3.5 mr-1" />
                  {runPipeline.isPending ? 'Starting…' : 'Run Automation Pipeline'}
                </Button>
              )}
              <Button size="sm" variant="ghost" asChild>
                <Link to={`/projects/${projectId}/backlink-builder/automation`}>
                  View pipeline <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Link>
              </Button>
            </div>
            {pipelineBusy && (
              <p className="text-xs text-violet-600 dark:text-violet-300">
                Pipeline is running in the background. Import History refreshes automatically —
                opportunity counts appear when classify/score finishes (large imports can take a few
                minutes).
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">What happens next</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2 text-muted-foreground">
              <p>1. URLs validated & deduplicated</p>
              <p>2. AI scans homepage, nav, forms, robots, sitemap</p>
              <p>3. Classifies type + confidence + reason</p>
              <p>4. Groups into workflow queues & assigns agents</p>
              <p>5. Human approval in Opportunity Queue</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Sheet className="h-4 w-4" /> Google Sheets
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <p className="text-muted-foreground">
                Requires Google OAuth (V1.1). Live Sheets import is unavailable until credentials are
                configured.
              </p>
              <Button size="sm" variant="outline" disabled>
                Connect Google Sheets
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {latest?.metadata?.classificationSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Imported Websites — AI classification</CardTitle>
            <CardDescription>
              {latest.metadata.classificationSummary.classified} of{' '}
              {latest.metadata.classificationSummary.imported} inspected ·{' '}
              <Link
                className="underline underline-offset-2"
                to={`/projects/${projectId}/backlink-builder/classification`}
              >
                Open classification dashboard
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
            {(latest.metadata.classificationSummary.samples ?? []).slice(0, 5).length > 0 && (
              <div className="pt-2 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Sample reasons</p>
                {(latest.metadata.classificationSummary.samples ?? []).slice(0, 5).map((s) => (
                  <p key={`${s.domain}-${s.type}`} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{s.domain}</span> —{' '}
                    {s.label ?? s.type} ({s.confidence}%) · {s.reason}
                  </p>
                ))}
              </div>
            )}
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
                <div className="flex items-center gap-2">
                  <Badge
                    className={`text-[10px] capitalize ${
                      ACTIVE_STATUSES.has(imp.status) ? 'animate-pulse' : ''
                    }`}
                  >
                    {imp.status}
                  </Badge>
                  {['validated', 'failed', 'completed'].includes(imp.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={runPipeline.isPending}
                      onClick={() => runPipeline.mutate(imp.id)}
                    >
                      <Play className="h-3 w-3" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" asChild>
                    <Link to={`/projects/${projectId}/backlink-builder/automation`}>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
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
