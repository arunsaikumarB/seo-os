import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { getApiErrorMessage } from '@/lib/api';
import { toast } from 'sonner';
import { PageTransition } from '@/components/demo/page-transition';
import { AiActivityCard } from '@/components/workflow/ai-activity-card';
import { Upload, FileSpreadsheet, FileText, Link2, Sheet } from 'lucide-react';

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
      const p = res.data.provisionalLanes;
      toast.success(
        p
          ? `Imported ${res.data.stats.valid} — provisional Auto ${p.automatable} · Manual ${p.manual}`
          : `Imported ${res.data.stats.valid} websites — AI is reviewing them now`
      );
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Import failed')),
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
    (latest != null && ACTIVE_STATUSES.has(String(latest.status)));

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
            current="Validate & deduplicate"
            next="AI Review → Approve"
            items={[
              { label: 'Validate URLs', state: 'done' },
              { label: 'Study websites', state: 'queued' },
              { label: 'Group by type', state: 'queued' },
              { label: 'Ready to approve', state: 'queued' },
            ]}
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

      {importMutation.data?.data?.provisionalLanes ? (
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Provisional Auto / Manual</CardTitle>
            <CardDescription>
              URL-only guess — crawl may move Auto → Manual if a gate is found. Manual Excel is
              available on Submit Backlinks.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>
              Automatable{' '}
              <span className="font-semibold tabular-nums">
                {importMutation.data.data.provisionalLanes.automatable}
              </span>
              {' · '}
              Manual{' '}
              <span className="font-semibold tabular-nums">
                {importMutation.data.data.provisionalLanes.manual}
              </span>
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
              {(importMutation.data.data.provisionalLanes.samples ?? []).map((s) => (
                <li key={s.url} className="truncate">
                  {s.lane === 'manual' ? 'Manual' : 'Auto'} — {s.url}
                  {s.reason ? ` (${s.reason})` : ''}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {latest?.metadata?.provisionalLanes && !importMutation.data?.data?.provisionalLanes ? (
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Latest import — provisional lanes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            Automatable {latest.metadata.provisionalLanes.automatable} · Manual{' '}
            {latest.metadata.provisionalLanes.manual}
          </CardContent>
        </Card>
      ) : null}

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
