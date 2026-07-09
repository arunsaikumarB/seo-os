import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { toast } from 'sonner';
import { BacklinkBuilderNav } from '@/components/backlink-builder/backlink-builder-widget';
import { PageTransition } from '@/components/demo/page-transition';
import { Upload, FileSpreadsheet, FileText, Link2, Play, ArrowRight } from 'lucide-react';

type ImportResult = {
  importId: string;
  stats: { total: number; valid: number; duplicates: number; invalid: number };
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
};

const SOURCE_TYPES = [
  { id: 'url_list', label: 'Paste URLs', icon: Link2 },
  { id: 'csv', label: 'CSV', icon: FileSpreadsheet },
  { id: 'txt', label: 'TXT', icon: FileText },
  { id: 'manual', label: 'Manual', icon: Upload },
] as const;

export function BacklinkImportPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();
  const [sourceType, setSourceType] = useState<string>('url_list');
  const [content, setContent] = useState('');
  const [lastImportId, setLastImportId] = useState<string | null>(null);

  const history = useQuery({
    queryKey: ['backlink-imports', projectId],
    queryFn: () =>
      request<{ data: ImportRecord[] }>(
        `/v1/projects/${projectId}/backlink-builder/automation/imports`
      ),
    enabled: !!projectId,
  });

  const importMutation = useMutation({
    mutationFn: () =>
      request<{ data: ImportResult }>(
        `/v1/projects/${projectId}/backlink-builder/automation/import`,
        {
          method: 'POST',
          body: JSON.stringify({ sourceType, content }),
        }
      ),
    onSuccess: (res) => {
      toast.success(`Imported ${res.data.stats.valid} valid URLs`);
      setLastImportId(res.data.importId);
      queryClient.invalidateQueries({ queryKey: ['backlink-imports', projectId] });
    },
    onError: () => toast.error('Import failed'),
  });

  const runPipeline = useMutation({
    mutationFn: (importId: string) =>
      request(`/v1/projects/${projectId}/backlink-builder/automation/imports/${importId}/run`, {
        method: 'POST',
      }),
    onSuccess: () => {
      toast.success('Automation pipeline started');
      queryClient.invalidateQueries({ queryKey: ['automation-summary', projectId] });
    },
    onError: () => toast.error('Pipeline failed'),
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setContent(String(reader.result ?? ''));
      if (file.name.endsWith('.csv')) setSourceType('csv');
      else if (file.name.endsWith('.txt')) setSourceType('txt');
      else setSourceType('url_list');
    };
    reader.readAsText(file);
  };

  return (
    <PageTransition className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <BacklinkBuilderNav />
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Upload className="h-6 w-6" /> Import Opportunities
        </h1>
        <p className="text-muted-foreground mt-1">
          Import websites via CSV, Excel, TXT, or pasted URL list. URLs are validated, deduplicated,
          and queued for analysis.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Import Source</CardTitle>
            <CardDescription>Select format and paste or upload your website list</CardDescription>
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
              placeholder={`https://example.com\nhttps://another-site.org\n...`}
              value={content}
              onChange={(e) => setContent(e.target.value)}
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
                Validate & Import
              </Button>
              {lastImportId && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={runPipeline.isPending}
                  onClick={() => runPipeline.mutate(lastImportId)}
                >
                  <Play className="h-3.5 w-3.5 mr-1" /> Run Automation Pipeline
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">What happens next</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2 text-muted-foreground">
            <p>1. URLs validated & deduplicated</p>
            <p>2. Each domain analyzed (niche, DR, pages)</p>
            <p>3. AI classifies backlink type & scores</p>
            <p>4. Content generated with brand voice</p>
            <p>5. Queued for human approval</p>
            <p className="text-xs italic pt-2 border-t">
              The platform assists execution — it does not guarantee backlinks on third-party sites.
            </p>
          </CardContent>
        </Card>
      </div>

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
                  <Badge className="text-[10px] capitalize">{imp.status}</Badge>
                  {imp.status === 'validated' && (
                    <Button size="sm" variant="outline" onClick={() => runPipeline.mutate(imp.id)}>
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
