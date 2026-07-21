import { useCallback, useMemo, useRef, useState, Fragment } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, Download, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { PageTransition } from '@/components/demo/page-transition';
import { useApi } from '@/hooks/use-api';
import {
  OpportunitySelector,
  useApprovedOpportunities,
  type SelectedOpportunity,
} from '@/components/opportunities/opportunity-selector';
import { AiActivityCard, AiLoadingState } from '@/components/workflow/ai-activity-card';
import { ImageIntelligencePanel } from '@/pages/content/image-intelligence';
import { cn } from '@/lib/utils';

type ContentPackRow = {
  id: string;
  opportunity_id?: string;
  backlink_type: string;
  status: string;
  pack: Record<string, unknown>;
  updated_at: string;
  opportunities?: { id: string; title: string; domain: string; opportunity_type: string } | null;
};

type KeywordMode = 'auto' | 'manual' | 'csv';

type GenOptions = {
  articles: boolean;
  listings: boolean;
  images: boolean;
  videoMetadata: boolean;
  metadata: boolean;
  outreachEmails: boolean;
};

type BatchProgress = {
  running: boolean;
  index: number;
  total: number;
  currentWebsite: string;
  currentTask: string;
  done: number;
  failed: number;
  needsReview: number;
  startedAt: number;
};

type CsvRow = { website: string; primary: string; secondary: string };

const REVIEW_THRESHOLD = 70;

function packQuality(pack: Record<string, unknown> | undefined): number | null {
  const q = pack?.quality as { overall?: number } | undefined;
  return typeof q?.overall === 'number' ? q.overall : null;
}

function packNeedsReview(row: ContentPackRow): boolean {
  if (row.status === 'failed' || row.status === 'rejected') return false;
  if (row.status === 'draft' || row.status === 'needs_review') return true;
  const overall = packQuality(row.pack);
  return overall != null && overall < REVIEW_THRESHOLD && row.status !== 'ready';
}

function packIsReady(row: ContentPackRow): boolean {
  if (row.status === 'ready') return true;
  const overall = packQuality(row.pack);
  return overall != null && overall >= REVIEW_THRESHOLD && row.status !== 'failed';
}

function PreviewField({ label, value }: { label: string; value: unknown }) {
  if (value == null || value === '') return null;
  const text =
    typeof value === 'string'
      ? value
      : Array.isArray(value)
        ? JSON.stringify(value, null, 2)
        : typeof value === 'object'
          ? JSON.stringify(value, null, 2)
          : String(value);
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm whitespace-pre-wrap break-words">{text}</p>
    </div>
  );
}

function ContentPackPreview({ pack }: { pack: Record<string, unknown> }) {
  const mode = String(pack.studioMode ?? '');
  return (
    <div className="grid gap-3 sm:grid-cols-2 rounded-md border p-3 bg-muted/20">
      {(mode === 'directory' || mode === 'profile') && (
        <>
          <PreviewField label="Business name" value={pack.businessName} />
          <PreviewField label="Short description" value={pack.shortDescription} />
          <PreviewField label="Long description" value={pack.longDescription} />
        </>
      )}
      {(mode === 'guest_post' || mode === 'article' || mode === 'resource' || !mode) && (
        <>
          <PreviewField label="SEO title" value={pack.seoTitle ?? pack.title} />
          <PreviewField label="Meta description" value={pack.metaDescription} />
          <PreviewField label="Excerpt" value={pack.excerpt} />
        </>
      )}
      <PreviewField label="Body" value={pack.body} />
    </div>
  );
}

function parseCsv(text: string): CsvRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^website\b/i.test(line))
    .map((line) => {
      const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
      return {
        website: parts[0] ?? '',
        primary: parts[1] ?? '',
        secondary: parts[2] ?? '',
      };
    })
    .filter((r) => r.website);
}

export function ContentLibraryPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();

  const [keywordMode, setKeywordMode] = useState<KeywordMode>('auto');
  const [primaryKeyword, setPrimaryKeyword] = useState('');
  const [secondaryKeywords, setSecondaryKeywords] = useState('');
  const [brand, setBrand] = useState('');
  const [location, setLocation] = useState('');
  const [csvText, setCsvText] = useState('');
  const [options, setOptions] = useState<GenOptions>({
    articles: true,
    listings: true,
    images: true,
    videoMetadata: true,
    metadata: true,
    outreachEmails: true,
  });
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [batchComplete, setBatchComplete] = useState(false);
  const [clientFailedIds, setClientFailedIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [listFilter, setListFilter] = useState<'needs_review' | 'all' | 'ready' | 'failed'>(
    'needs_review'
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const cancelRef = useRef(false);

  const approvedQ = useApprovedOpportunities(projectId);
  const approved = approvedQ.data?.data ?? [];

  const packsQ = useQuery({
    queryKey: ['content-packs', projectId],
    queryFn: () =>
      request<{ data: ContentPackRow[] }>(`/v1/projects/${projectId}/backlink-builder/content-packs`),
    enabled: !!projectId,
    refetchInterval: progress?.running ? 4_000 : false,
  });
  const packList = packsQ.data?.data ?? [];

  const packByOpp = useMemo(() => {
    const map = new Map<string, ContentPackRow>();
    for (const p of packList) {
      const oid = p.opportunity_id ?? p.opportunities?.id;
      if (oid) map.set(oid, p);
    }
    return map;
  }, [packList]);

  const readyToGenerate = useMemo(() => {
    return approved.filter((o) => {
      const pack = packByOpp.get(o.id);
      if (!pack) return true;
      if (clientFailedIds.has(o.id)) return true;
      return pack.status === 'failed';
    });
  }, [approved, packByOpp, clientFailedIds]);

  const stats = useMemo(() => {
    let generated = 0;
    let needsReview = 0;
    let failed = clientFailedIds.size;
    for (const p of packList) {
      if (p.status === 'failed' || p.status === 'rejected') failed += 1;
      else if (packNeedsReview(p)) needsReview += 1;
      else if (packIsReady(p)) generated += 1;
    }
    return { generated, needsReview, failed };
  }, [packList, clientFailedIds]);

  const visiblePacks = useMemo(() => {
    return packList.filter((p) => {
      if (listFilter === 'all') return true;
      if (listFilter === 'ready') return packIsReady(p);
      if (listFilter === 'failed') return p.status === 'failed' || p.status === 'rejected';
      return packNeedsReview(p);
    });
  }, [packList, listFilter]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['content-packs', projectId] });
    queryClient.invalidateQueries({ queryKey: ['approved-opportunities', projectId] });
  };

  const autoApproveIfStrong = async (pack: ContentPackRow) => {
    const overall = packQuality(pack.pack);
    if (overall != null && overall >= REVIEW_THRESHOLD) {
      await request(`/v1/projects/${projectId}/backlink-builder/content-packs/${pack.id}`, {
        method: 'PUT',
        body: JSON.stringify({ pack: pack.pack, status: 'ready' }),
      });
      return 'ready' as const;
    }
    return 'needs_review' as const;
  };

  const generateOne = async (opp: SelectedOpportunity) => {
    const res = await request<{ data: ContentPackRow }>(
      `/v1/projects/${projectId}/backlink-builder/opportunities/${opp.id}/content-pack`,
      { method: 'POST', body: JSON.stringify({}) }
    );
    const outcome = await autoApproveIfStrong(res.data);
    return { pack: res.data, outcome };
  };

  const runBatch = useCallback(
    async (targets: SelectedOpportunity[]) => {
      if (targets.length === 0) {
        toast.message('Nothing to generate — all approved sites already have packages');
        return;
      }
      cancelRef.current = false;
      setBatchComplete(false);
      const startedAt = Date.now();
      let done = 0;
      let failed = 0;
      let needsReview = 0;
      const nextFailed = new Set(clientFailedIds);

      setProgress({
        running: true,
        index: 0,
        total: targets.length,
        currentWebsite: targets[0]?.website ?? '',
        currentTask: 'Starting…',
        done: 0,
        failed: 0,
        needsReview: 0,
        startedAt,
      });

      for (let i = 0; i < targets.length; i++) {
        if (cancelRef.current) break;
        const opp = targets[i]!;
        setProgress({
          running: true,
          index: i + 1,
          total: targets.length,
          currentWebsite: opp.website,
          currentTask: options.articles ? 'Generating article & listing package' : 'Generating package',
          done,
          failed,
          needsReview,
          startedAt,
        });
        try {
          const { outcome } = await generateOne(opp);
          nextFailed.delete(opp.id);
          done += 1;
          if (outcome === 'needs_review') needsReview += 1;
        } catch {
          failed += 1;
          nextFailed.add(opp.id);
        }
        setProgress({
          running: true,
          index: i + 1,
          total: targets.length,
          currentWebsite: opp.website,
          currentTask: 'Saving package',
          done,
          failed,
          needsReview,
          startedAt,
        });
      }

      setClientFailedIds(nextFailed);
      setProgress((p) => (p ? { ...p, running: false } : null));
      setBatchComplete(true);
      setListFilter('needs_review');
      invalidate();
      toast.success(
        `Batch complete · ${done} generated · ${needsReview} need review · ${failed} failed`
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, options.articles, clientFailedIds]
  );

  const setPackStatus = useMutation({
    mutationFn: async ({
      ids,
      status,
    }: {
      ids: string[];
      status: string;
    }) => {
      for (const id of ids) {
        const row = packList.find((p) => p.id === id);
        if (!row) continue;
        await request(`/v1/projects/${projectId}/backlink-builder/content-packs/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ pack: row.pack, status }),
        });
      }
    },
    onSuccess: () => {
      invalidate();
      setSelected(new Set());
      toast.success('Updated packages');
    },
    onError: (e: Error) => toast.error(e.message || 'Update failed'),
  });

  const selectedPacks = packList.filter((p) => selected.has(p.id));
  const allVisibleSelected =
    visiblePacks.length > 0 && visiblePacks.every((p) => selected.has(p.id));

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(visiblePacks.map((p) => p.id)));
  };

  const exportSelected = () => {
    const rows = selectedPacks.length ? selectedPacks : visiblePacks;
    if (!rows.length) {
      toast.message('Nothing to export');
      return;
    }
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `content-packages-${projectId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const regenerateMedia = async (kind: 'image' | 'video') => {
    const opps = selectedPacks
      .map((p) => p.opportunity_id ?? p.opportunities?.id)
      .filter(Boolean) as string[];
    if (!opps.length) {
      toast.message('Select packages first');
      return;
    }
    try {
      for (const opportunityId of opps) {
        await request(
          `/v1/projects/${projectId}/backlink-builder/opportunities/${opportunityId}/media-briefs`,
          { method: 'POST', body: JSON.stringify({ kind }) }
        );
      }
      toast.success(kind === 'image' ? 'Image regeneration queued' : 'Video metadata queued');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Regenerate failed');
    }
  };

  const etaLabel = (() => {
    if (!progress?.running || progress.done === 0) return '~calculating';
    const elapsed = (Date.now() - progress.startedAt) / 1000;
    const per = elapsed / Math.max(progress.done, 1);
    const remaining = Math.max(0, progress.total - progress.index);
    const secs = Math.round(per * remaining);
    if (secs < 60) return `~${secs}s`;
    return `~${Math.ceil(secs / 60)} min`;
  })();

  const percent = progress
    ? Math.round((Math.min(progress.index, progress.total) / Math.max(progress.total, 1)) * 100)
    : 0;

  const csvRows = useMemo(() => parseCsv(csvText), [csvText]);

  return (
    <PageTransition className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Sparkles className="h-6 w-6" /> Generate Content
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          One click — AI builds packages for every approved website. You only review exceptions.
        </p>
      </div>

      {approvedQ.isLoading ? (
        <AiLoadingState message="AI is loading approved websites…" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ['Approved Websites', approved.length],
              ['Ready to Generate', readyToGenerate.length],
              ['Packages', packList.length],
            ] as const
          ).map(([label, value]) => (
            <Card key={label} className="rounded-2xl border-border/40 shadow-sm">
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold tabular-nums mt-1">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="rounded-2xl border-border/40 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Keywords</CardTitle>
          <CardDescription>AI uses these across the whole batch</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['auto', 'Auto'],
                ['manual', 'Manual'],
                ['csv', 'CSV Import'],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                size="sm"
                variant={keywordMode === id ? 'default' : 'outline'}
                onClick={() => setKeywordMode(id)}
              >
                {label}
              </Button>
            ))}
          </div>
          {keywordMode === 'auto' ? (
            <p className="text-sm text-muted-foreground">
              AI extracts keywords from homepage, title, headings, products, services, and categories.
            </p>
          ) : null}
          {keywordMode === 'manual' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Primary Keyword</Label>
                <Input
                  value={primaryKeyword}
                  onChange={(e) => setPrimaryKeyword(e.target.value)}
                  placeholder="e.g. organic dog food"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Secondary Keywords</Label>
                <Input
                  value={secondaryKeywords}
                  onChange={(e) => setSecondaryKeywords(e.target.value)}
                  placeholder="Comma-separated"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Brand</Label>
                <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
            </div>
          ) : null}
          {keywordMode === 'csv' ? (
            <div className="space-y-2">
              <Label>Website, Primary Keyword, Secondary Keyword</Label>
              <textarea
                className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs"
                placeholder={`example.com, primary kw, secondary kw\nanother.org, ...`}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
              />
              <p className="text-xs text-muted-foreground tabular-nums">
                {csvRows.length} row{csvRows.length === 1 ? '' : 's'} mapped
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/40 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Generation Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            {(
              [
                ['articles', 'Articles'],
                ['listings', 'Business Listings'],
                ['images', 'Images'],
                ['videoMetadata', 'Video Metadata'],
                ['metadata', 'Metadata'],
                ['outreachEmails', 'Outreach Emails'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 rounded-lg border border-border/40 px-3 py-2">
                <input
                  type="checkbox"
                  checked={options[key]}
                  onChange={(e) => setOptions((o) => ({ ...o, [key]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>
          <Button
            size="lg"
            className="w-full sm:w-auto"
            disabled={progress?.running || readyToGenerate.length === 0 || approved.length === 0}
            onClick={() => runBatch(readyToGenerate)}
          >
            {progress?.running
              ? 'Generating…'
              : `Generate All Packages${readyToGenerate.length ? ` (${readyToGenerate.length})` : ''}`}
          </Button>
          {approved.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Approve websites first in{' '}
              <Link className="underline" to={`/projects/${projectId}/campaigns/queue`}>
                Approve Opportunities
              </Link>
              .
            </p>
          ) : null}
        </CardContent>
      </Card>

      {progress?.running ? (
        <AiActivityCard
          title="AI Progress"
          percent={percent}
          current={progress.currentWebsite}
          next={progress.currentTask}
          eta={etaLabel}
          items={[
            { label: 'Completed', state: progress.done > 0 ? 'done' : 'queued' },
            { label: 'Needs review', state: progress.needsReview > 0 ? 'active' : 'queued' },
            { label: 'Failed', state: progress.failed > 0 ? 'active' : 'queued' },
            {
              label: 'Remaining',
              state: progress.index < progress.total ? 'active' : 'done',
            },
          ]}
        />
      ) : null}

      {progress && !progress.running ? (
        <div className="text-xs text-muted-foreground px-1">
          Last batch · {progress.done} done · {progress.needsReview} review · {progress.failed} failed
        </div>
      ) : null}

      {(batchComplete || packList.length > 0) && !progress?.running ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ['Generated', stats.generated, 'ready' as const],
              ['Needs Review', stats.needsReview, 'needs_review' as const],
              ['Failed', stats.failed, 'failed' as const],
            ] as const
          ).map(([label, value, filter]) => (
            <button
              key={label}
              type="button"
              onClick={() => setListFilter(filter)}
              className={cn(
                'rounded-2xl border border-border/40 bg-card px-4 py-4 text-left shadow-sm transition-colors',
                listFilter === filter && 'ring-1 ring-primary'
              )}
            >
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold tabular-nums mt-1">{value}</p>
            </button>
          ))}
        </div>
      ) : null}

      {packList.length > 0 ? (
        <Card className="rounded-2xl border-border/40 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">
                  {listFilter === 'needs_review'
                    ? 'Needs Review'
                    : listFilter === 'ready'
                      ? 'Generated'
                      : listFilter === 'failed'
                        ? 'Failed'
                        : 'All packages'}
                </CardTitle>
                <CardDescription>
                  Strong packages are auto-approved. Review only exceptions.
                </CardDescription>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setListFilter('all')}>
                Show all
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={selected.size === 0 || setPackStatus.isPending}
                onClick={() => setPackStatus.mutate({ ids: [...selected], status: 'ready' })}
              >
                Approve All
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={selected.size === 0 || setPackStatus.isPending}
                onClick={() => setPackStatus.mutate({ ids: [...selected], status: 'rejected' })}
              >
                Reject All
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={progress?.running}
                onClick={() => {
                  const ids = new Set(
                    selectedPacks.map((p) => p.opportunity_id ?? p.opportunities?.id).filter(Boolean)
                  );
                  const targets = approved.filter((o) => ids.has(o.id));
                  if (targets.length) runBatch(targets);
                  else toast.message('Select packages whose websites should regenerate');
                }}
              >
                Generate Selected
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={progress?.running || readyToGenerate.filter((o) => clientFailedIds.has(o.id) || packByOpp.get(o.id)?.status === 'failed').length === 0}
                onClick={() =>
                  runBatch(
                    readyToGenerate.filter(
                      (o) => clientFailedIds.has(o.id) || packByOpp.get(o.id)?.status === 'failed'
                    )
                  )
                }
              >
                Retry Failed
              </Button>
              <Button size="sm" variant="outline" onClick={() => regenerateMedia('image')}>
                Regenerate Images
              </Button>
              <Button size="sm" variant="outline" onClick={() => regenerateMedia('video')}>
                Regenerate Metadata
              </Button>
              <Button size="sm" variant="outline" onClick={exportSelected}>
                <Download className="h-3.5 w-3.5 mr-1" /> Export Packages
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={selected.size === 0 || setPackStatus.isPending}
                onClick={() => setPackStatus.mutate({ ids: [...selected], status: 'rejected' })}
              >
                Delete Selected
              </Button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border/40">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 w-10">
                      <input
                        type="checkbox"
                        aria-label="Select all visible"
                        checked={allVisibleSelected}
                        onChange={toggleAllVisible}
                      />
                    </th>
                    <th className="px-3 py-2.5 font-medium">Website</th>
                    <th className="px-3 py-2.5 font-medium">Type</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePacks.map((p) => {
                    const open = expandedId === p.id;
                    const website = p.opportunities?.title ?? p.opportunities?.domain ?? p.backlink_type;
                    const statusLabel = packNeedsReview(p)
                      ? 'Needs review'
                      : packIsReady(p)
                        ? 'Ready'
                        : p.status;
                    return (
                      <Fragment key={p.id}>
                        <tr className="border-t border-border/40">
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={selected.has(p.id)}
                              onChange={() => {
                                setSelected((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(p.id)) next.delete(p.id);
                                  else next.add(p.id);
                                  return next;
                                });
                              }}
                            />
                          </td>
                          <td className="px-3 py-3 font-medium">{website}</td>
                          <td className="px-3 py-3 capitalize">
                            {p.backlink_type.replace(/_/g, ' ')}
                          </td>
                          <td className="px-3 py-3">
                            <Badge className="text-[10px] capitalize">{statusLabel}</Badge>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setExpandedId(open ? null : p.id);
                                setShowTechnical(false);
                              }}
                            >
                              {open ? 'Hide' : 'Review'}
                            </Button>
                          </td>
                        </tr>
                        {open ? (
                          <tr className="border-t border-border/30 bg-muted/10">
                            <td colSpan={5} className="px-3 py-4 space-y-3">
                              <ContentPackPreview pack={p.pack ?? {}} />
                              <div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-muted-foreground"
                                  onClick={() => setShowTechnical((v) => !v)}
                                >
                                  <ChevronDown
                                    className={cn(
                                      'h-4 w-4 mr-1 transition-transform',
                                      showTechnical && 'rotate-180'
                                    )}
                                  />
                                  Technical Details
                                </Button>
                                {showTechnical ? (
                                  <div className="mt-2 rounded-lg border border-dashed p-3 space-y-2 text-xs font-mono whitespace-pre-wrap break-all">
                                    <p>
                                      SEO Score:{' '}
                                      {String(
                                        (p.pack?.quality as { seoScore?: number } | undefined)
                                          ?.seoScore ?? '—'
                                      )}
                                    </p>
                                    <p>
                                      Schema:{' '}
                                      {JSON.stringify(
                                        p.pack?.schemaJsonLd ?? p.pack?.schema ?? null,
                                        null,
                                        2
                                      )}
                                    </p>
                                    <p>
                                      Internal:{' '}
                                      {JSON.stringify(p.pack?.internalLinks ?? [], null, 2)}
                                    </p>
                                    <p>
                                      External:{' '}
                                      {JSON.stringify(
                                        p.pack?.externalLinks ?? p.pack?.suggestedLinks ?? [],
                                        null,
                                        2
                                      )}
                                    </p>
                                    <p>{JSON.stringify(p.pack, null, 2)}</p>
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    setPackStatus.mutate({ ids: [p.id], status: 'ready' })
                                  }
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setPackStatus.mutate({ ids: [p.id], status: 'rejected' })
                                  }
                                >
                                  Reject
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {visiblePacks.length === 0 ? (
                <p className="text-sm text-muted-foreground p-6">
                  {listFilter === 'needs_review'
                    ? 'No packages need review — everything was auto-approved.'
                    : 'No packages in this view.'}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? 'Hide' : 'Show'} Advanced
        </Button>
      </div>

      {showAdvanced ? (
        <div className="space-y-4 rounded-2xl border border-dashed p-4">
          <p className="text-sm text-muted-foreground">
            Manual tools — single-site generate, Image Studio, Video Studio, and re-analyze.
          </p>
          <OpportunitySelector
            projectId={projectId}
            selectedId={null}
            onSelect={() => undefined}
            mode="content"
            showTable
            allowClear
            label="Search / select website (advanced)"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link to={`/projects/${projectId}/backlink-builder/image-studio`}>Image Studio</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to={`/projects/${projectId}/backlink-builder/video-studio`}>Video Studio</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to={`/projects/${projectId}/outreach/studio`}>Outreach drafts</Link>
            </Button>
          </div>
          <ImageIntelligencePanel embedded />
        </div>
      ) : null}
    </PageTransition>
  );
}
