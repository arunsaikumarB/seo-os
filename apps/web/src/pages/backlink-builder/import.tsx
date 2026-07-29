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
import { isSuccessfulImportRecord } from '@/lib/import-success';
import { Upload, FileSpreadsheet, FileText, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AdvancedTools } from '@/components/workflow/advanced-tools';

const IMPORT_TARGET_OPTIONS = [
  {
    id: 'web2_article',
    label: 'Web 2.0 / Blog / Articles',
    description: 'Medium, Blogger, free blogs, article & guest-post sites',
  },
  {
    id: 'directory',
    label: 'Directories / Citations / Profiles',
    description: 'Business listings, citations, profile pages',
  },
  {
    id: 'community',
    label: 'Forums / Q&A / Community',
    description: 'Forums, Q&A, Reddit, Quora, bookmarks',
  },
  {
    id: 'media',
    label: 'PDF / Image / Video',
    description: 'Document, infographic, video, podcast',
  },
  {
    id: 'outreach',
    label: 'Outreach / Resource / PR',
    description: 'Resource pages, broken links, digital PR',
  },
] as const;

type TargetFamilyId = (typeof IMPORT_TARGET_OPTIONS)[number]['id'];

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
    targetFamilies?: string[];
    targetFamilyLabels?: string[];
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
  const [targetFamilies, setTargetFamilies] = useState<TargetFamilyId[]>(['web2_article']);

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

  const toggleFamily = (id: TargetFamilyId) => {
    setTargetFamilies((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  };

  const importMutation = useMutation({
    mutationFn: () =>
      request<{ data: ImportResult }>(
        `/v1/projects/${projectId}/backlink-builder/automation/import`,
        {
          method: 'POST',
          body: JSON.stringify({
            sourceType,
            content,
            fileName,
            runPipeline: true,
            targetFamilies,
          }),
        }
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['backlink-imports', projectId] });
      queryClient.invalidateQueries({ queryKey: ['automation-summary', projectId] });
      queryClient.invalidateQueries({ queryKey: ['manual-submissions', projectId] });
      queryClient.invalidateQueries({ queryKey: ['workflow-progress', projectId] });
      const p = res.data.provisionalLanes;
      toast.success(
        p
          ? `Imported ${res.data.stats.valid} — content-ready sites go to Assisted Manual`
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

  return (
    <PageTransition className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Upload className="h-6 w-6" /> Import Websites
        </h1>
        <p className="text-muted-foreground mt-1">
          Select the opportunity types you are importing first, then paste URLs / upload a file.
          AI studies each site and flags anything unrelated to your selection.
        </p>
      </div>

      {(pipelineBusy || importMutation.isPending) && (
        <AiActivityCard
          title="AI is studying websites"
          percent={importMutation.isPending ? 40 : 68}
          current={importMutation.isPending ? 'Validating URLs' : 'Analyzing & grouping'}
          next="Continue to AI Review when ready"
          eta={null}
          items={checklistItems}
        />
      )}

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="text-base">Import Source</CardTitle>
          <CardDescription>
            Choose opportunity types, then paste or upload. AI reviews automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">1. What are you importing?</p>
              <p className="text-xs text-muted-foreground">
                Pick one or more. Sites that do not match are marked unrelated in AI Review.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {IMPORT_TARGET_OPTIONS.map((opt) => {
                  const on = targetFamilies.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleFamily(opt.id)}
                      className={cn(
                        'rounded-lg border px-3 py-2.5 text-left transition-colors',
                        on
                          ? 'border-primary bg-primary/10'
                          : 'border-border/60 hover:border-border'
                      )}
                    >
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{opt.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">2. Import source</p>
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
                disabled={
                  !content.trim() || importMutation.isPending || targetFamilies.length === 0
                }
                onClick={() => importMutation.mutate()}
              >
                {importMutation.isPending ? 'Importing…' : 'Import & continue'}
              </Button>
            </div>
            {pipelineBusy && (
              <p className="text-xs text-muted-foreground">
                AI is reviewing in the background. Open AI Review when ready.
              </p>
            )}
          </CardContent>
        </Card>

      {hasSuccessfulImport && !pipelineBusy ? (
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to={`/projects/${projectId}/backlink-builder/classification`}>
              Continue to AI Review →
            </Link>
          </Button>
        </div>
      ) : null}

      {history.data?.data && history.data.data.length > 0 ? (
        <AdvancedTools>
          <p className="text-sm font-medium mb-2">Import history</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {history.data.data.slice(0, 5).map((row) => (
              <li key={row.id} className="flex flex-wrap gap-2 tabular-nums">
                <Badge className="capitalize text-[10px]">
                  {row.status}
                </Badge>
                <span>{row.valid_rows} URLs</span>
                <span>{new Date(row.created_at).toLocaleString()}</span>
                {row.metadata?.targetFamilyLabels?.length ? (
                  <span>{row.metadata.targetFamilyLabels.join(', ')}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </AdvancedTools>
      ) : null}
    </PageTransition>
  );
}
