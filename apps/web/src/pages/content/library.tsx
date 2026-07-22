import { useMemo, useState, Fragment } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, Download, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageTransition } from '@/components/demo/page-transition';
import { useApi } from '@/hooks/use-api';
import { OpportunitySelector } from '@/components/opportunities/opportunity-selector';
import { AiActivityCard, AiLoadingState } from '@/components/workflow/ai-activity-card';
import { ImageIntelligencePanel } from '@/pages/content/image-intelligence';
import { cn } from '@/lib/utils';

type ReviewRow = {
  id: string;
  website: string;
  generationStatus: string | null;
  qualityScore: number | null;
  lastError: string | null;
  packageStatus: string | null;
  imageStatus: string | null;
  metadataStatus: string | null;
  videoMetadataStatus: string | null;
  schemaStatus: string | null;
  retryCount: number;
};

type GenBoard = {
  progress: {
    approved: number;
    queued: number;
    generating: number;
    completed: number;
    failed: number;
    needsReview: number;
    waiting: number;
    percent: number;
    active: boolean;
  };
  estimates: {
    websites: number;
    durationLabel: string;
    tokensLabel: string;
    imagesLabel: string;
    costLabel: string;
    isDefaultEstimate: boolean;
    concurrency: number;
  };
  eta: string | null;
  current: Array<{ id: string; website: string; stage: string }>;
  reviewQueue: ReviewRow[];
  dashboardCard: {
    title: string;
    approved: number;
    completed: number;
    generating: number;
    waiting: number;
    failed: number;
    needsReview: number;
    eta: string | null;
  };
};

type ContentPackRow = {
  id: string;
  opportunity_id?: string;
  backlink_type: string;
  status: string;
  pack: Record<string, unknown>;
  opportunities?: { id: string; title: string; domain: string } | null;
};

type BulkAction =
  | 'generate_all'
  | 'generate_selected'
  | 'retry_failed'
  | 'retry_missing_images'
  | 'retry_missing_metadata'
  | 'retry_missing_videos'
  | 'approve_selected'
  | 'approve_all'
  | 'reject_selected'
  | 'delete_packages'
  | 'export_packages';

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
      <PreviewField label="Article / body" value={pack.body} />
      <PreviewField label="Images" value={pack.imageMetadata} />
      <PreviewField label="Metadata" value={pack.requiredFields} />
      <PreviewField label="Internal links" value={pack.internalLinks} />
      <PreviewField label="External links" value={pack.externalLinks ?? pack.suggestedLinks} />
    </div>
  );
}

export function ContentLibraryPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const boardQ = useQuery({
    queryKey: ['content-generation', projectId],
    queryFn: () =>
      request<{ data: GenBoard }>(
        `/v1/projects/${projectId}/backlink-builder/automation/content-generation`
      ),
    enabled: !!projectId,
    refetchInterval: (q) => (q.state.data?.data?.progress?.active ? 2_000 : 8_000),
  });

  const packsQ = useQuery({
    queryKey: ['content-packs', projectId],
    queryFn: () =>
      request<{ data: ContentPackRow[] }>(
        `/v1/projects/${projectId}/backlink-builder/content-packs`
      ),
    enabled: !!projectId,
    refetchInterval: boardQ.data?.data?.progress?.active ? 4_000 : false,
  });

  const board = boardQ.data?.data;
  const progress = board?.progress;
  const reviewQueue = board?.reviewQueue ?? [];
  const packList = packsQ.data?.data ?? [];

  const packByOpp = useMemo(() => {
    const map = new Map<string, ContentPackRow>();
    for (const p of packList) {
      const oid = p.opportunity_id ?? p.opportunities?.id;
      if (oid) map.set(oid, p);
    }
    return map;
  }, [packList]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['content-generation', projectId] });
    queryClient.invalidateQueries({ queryKey: ['content-packs', projectId] });
    queryClient.invalidateQueries({ queryKey: ['campaign-health', projectId] });
    queryClient.invalidateQueries({ queryKey: ['approved-opportunities', projectId] });
  };

  const bulk = useMutation({
    mutationFn: async ({ action, itemIds }: { action: BulkAction; itemIds?: string[] }) => {
      const res = await request<{
        data: {
          message?: string;
          queued?: number;
          skipped?: number;
          succeeded?: number;
          skipReasons?: string[];
          packages?: ContentPackRow[];
        };
      }>(`/v1/projects/${projectId}/backlink-builder/automation/content-generation/bulk`, {
        method: 'POST',
        body: JSON.stringify({ action, itemIds: itemIds ?? [...selected] }),
      });
      return { action, ...res.data };
    },
    onSuccess: (data) => {
      invalidate();
      setSelected(new Set());
      if (data.action === 'export_packages' && data.packages) {
        const blob = new Blob([JSON.stringify(data.packages, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `content-packages-${projectId.slice(0, 8)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
      const skipped = data.skipped ?? 0;
      const reason =
        skipped > 0 && data.skipReasons?.length
          ? ` · ${skipped} skipped (${data.skipReasons[0]})`
          : skipped > 0
            ? ` · ${skipped} skipped`
            : '';
      toast.success((data.message ?? 'Done') + reason);
    },
    onError: (e: Error) => toast.error(e.message || 'Action failed'),
  });

  const generateEverything = useMutation({
    mutationFn: async () => {
      const res = await request<{ data: { message?: string; queued?: number; skipped?: number } }>(
        `/v1/projects/${projectId}/backlink-builder/automation/content-generation/generate`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      return res.data;
    },
    onSuccess: (data) => {
      invalidate();
      toast.success(data.message ?? 'Generation queued');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to start generation'),
  });

  const allReviewSelected =
    reviewQueue.length > 0 && reviewQueue.every((r) => selected.has(r.id));

  const toggleAllReview = () => {
    if (allReviewSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(reviewQueue.map((r) => r.id)));
  };

  const dash = board?.dashboardCard;
  const estimates = board?.estimates;
  const active = Boolean(progress?.active);
  const approvedCount = progress?.approved ?? 0;

  return (
    <PageTransition className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Sparkles className="h-6 w-6" /> Content Studio
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          One click generates packages for every approved website. You only review exceptions.
        </p>
      </div>

      {boardQ.isLoading ? (
        <AiLoadingState message="AI is loading generation status…" />
      ) : dash ? (
        <Card className="rounded-2xl border-border/40 shadow-sm">
          <CardContent className="pt-4 space-y-1">
            <p className="text-sm font-medium">{dash.title}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              Approved {dash.approved} · Completed {dash.completed} · Generating {dash.generating} ·
              Waiting {dash.waiting} · Failed {dash.failed} · Needs Review {dash.needsReview}
              {dash.eta ? ` · ETA ${dash.eta}` : ''}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {active && progress ? (
        <AiActivityCard
          title="AI is generating packages…"
          percent={Math.round(progress.percent)}
          current={
            board?.current?.[0]
              ? `${board.current[0].website} — ${board.current[0].stage}`
              : 'Working…'
          }
          next={
            board?.current && board.current.length > 1
              ? board.current
                  .slice(1, 4)
                  .map((c) => c.website)
                  .join(', ')
              : undefined
          }
          eta={board?.eta ?? 'estimating…'}
          items={[
            { label: `Completed ${progress.completed}`, state: progress.completed > 0 ? 'done' : 'queued' },
            { label: `Failed ${progress.failed}`, state: progress.failed > 0 ? 'active' : 'queued' },
            {
              label: `Needs Review ${progress.needsReview}`,
              state: progress.needsReview > 0 ? 'active' : 'queued',
            },
            {
              label: `Remaining ${progress.queued + progress.generating}`,
              state: progress.queued + progress.generating > 0 ? 'active' : 'done',
            },
          ]}
        />
      ) : (
        <Card className="rounded-2xl border-border/40 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Generate Packages</CardTitle>
            <CardDescription className="tabular-nums">
              {approvedCount} websites
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {estimates ? (
              <dl className="grid gap-2 sm:grid-cols-2 text-sm">
                <div className="flex justify-between gap-4 border-b border-border/40 py-1">
                  <dt className="text-muted-foreground">Estimated Time</dt>
                  <dd className="tabular-nums font-medium">{estimates.durationLabel}</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-border/40 py-1">
                  <dt className="text-muted-foreground">Estimated Tokens</dt>
                  <dd className="tabular-nums font-medium">{estimates.tokensLabel}</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-border/40 py-1">
                  <dt className="text-muted-foreground">Estimated Images</dt>
                  <dd className="tabular-nums font-medium">{estimates.imagesLabel}</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-border/40 py-1">
                  <dt className="text-muted-foreground">Estimated Cost</dt>
                  <dd className="tabular-nums font-medium">{estimates.costLabel}</dd>
                </div>
              </dl>
            ) : null}
            {estimates?.isDefaultEstimate ? (
              <p className="text-xs text-muted-foreground">
                Estimates use defaults until enough generations complete (rolling averages).
              </p>
            ) : null}
            <Button
              size="lg"
              className="w-full sm:w-auto"
              disabled={
                generateEverything.isPending || approvedCount === 0 || bulk.isPending
              }
              onClick={() => generateEverything.mutate()}
            >
              Generate Everything
            </Button>
            {approvedCount === 0 ? (
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
      )}

      <Card className="rounded-2xl border-border/40 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Review Queue</CardTitle>
          <CardDescription>
            Only Needs Review and Failed packages. Auto-approved items stay in Campaign Health.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['generate_selected', 'Generate Selected'],
                ['generate_all', 'Generate All'],
                ['retry_failed', 'Retry Failed'],
                ['retry_missing_images', 'Retry Missing Images'],
                ['retry_missing_metadata', 'Retry Missing Metadata'],
                ['retry_missing_videos', 'Retry Missing Videos'],
                ['approve_selected', 'Approve Selected'],
                ['approve_all', 'Approve All'],
                ['reject_selected', 'Reject Selected'],
                ['export_packages', 'Export Packages'],
                ['delete_packages', 'Delete Packages'],
              ] as const
            ).map(([action, label]) => (
              <Button
                key={action}
                size="sm"
                variant={action.startsWith('approve') ? 'default' : 'outline'}
                disabled={bulk.isPending || (action.includes('selected') && selected.size === 0 && action !== 'export_packages')}
                onClick={() => bulk.mutate({ action })}
              >
                {action === 'export_packages' ? (
                  <>
                    <Download className="h-3.5 w-3.5 mr-1" /> {label}
                  </>
                ) : (
                  label
                )}
              </Button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/40">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all in review queue"
                      checked={allReviewSelected}
                      onChange={toggleAllReview}
                    />
                  </th>
                  <th className="px-3 py-2.5 font-medium">Website</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Quality</th>
                  <th className="px-3 py-2.5 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {reviewQueue.map((row) => {
                  const pack = packByOpp.get(row.id);
                  const open = expandedId === row.id;
                  return (
                    <Fragment key={row.id}>
                      <tr className="border-t border-border/40">
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selected.has(row.id)}
                            onChange={() => {
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(row.id)) next.delete(row.id);
                                else next.add(row.id);
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td className="px-3 py-3 font-medium">{row.website}</td>
                        <td className="px-3 py-3">
                          <Badge className="text-[10px]">{row.generationStatus}</Badge>
                        </td>
                        <td className="px-3 py-3 tabular-nums">
                          {row.qualityScore ?? '—'}
                          {row.lastError ? (
                            <p className="text-[10px] text-muted-foreground max-w-[220px] truncate">
                              {row.lastError}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 text-right space-x-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!pack}
                            onClick={() => {
                              setExpandedId(open ? null : row.id);
                              setShowTechnical(false);
                            }}
                          >
                            {open ? 'Hide' : 'Preview'}
                          </Button>
                          {row.generationStatus === 'Needs Review' ? (
                            <Button
                              size="sm"
                              onClick={() =>
                                bulk.mutate({ action: 'approve_selected', itemIds: [row.id] })
                              }
                            >
                              Approve
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              bulk.mutate({ action: 'generate_selected', itemIds: [row.id] })
                            }
                          >
                            Regenerate
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              bulk.mutate({ action: 'reject_selected', itemIds: [row.id] })
                            }
                          >
                            Reject
                          </Button>
                        </td>
                      </tr>
                      {open && pack ? (
                        <tr className="border-t border-border/30 bg-muted/10">
                          <td colSpan={5} className="px-3 py-4 space-y-3">
                            <ContentPackPreview pack={pack.pack ?? {}} />
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
                                    Schema:{' '}
                                    {JSON.stringify(
                                      pack.pack?.schemaJsonLd ?? pack.pack?.schema ?? null,
                                      null,
                                      2
                                    )}
                                  </p>
                                  <p>{JSON.stringify(pack.pack, null, 2)}</p>
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {reviewQueue.length === 0 ? (
              <p className="text-sm text-muted-foreground p-6">
                No exceptions — review queue is empty.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

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
            Manual tools — search/select website, Image Studio, Video Studio, re-analyze.
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
