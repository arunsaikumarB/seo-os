import { useEffect, useMemo, useRef, useState, Fragment } from 'react';
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
import { AiLoadingState } from '@/components/workflow/ai-activity-card';
import { AdvancedTools } from '@/components/workflow/advanced-tools';
import { ExceptionChip } from '@/components/workflow/exception-chip';
import { ImageIntelligencePanel } from '@/pages/content/image-intelligence';
import { useCampaignAiStatus } from '@/hooks/use-campaign-ai-status';
import { useWorkflow } from '@/hooks/use-workflow';
import { cn } from '@/lib/utils';

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

const CELEBRATION_KEY = (projectId: string) => `seo-os:gen-celebration:${projectId}`;

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
      <PreviewField label="Internal links" value={pack.internalLinks} />
      <PreviewField label="External links" value={pack.externalLinks ?? pack.suggestedLinks} />
    </div>
  );
}

export function ContentLibraryPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();
  const { continueHref } = useWorkflow(projectId);
  const {
    boardLoading,
    progress,
    generateState,
    estimates,
    eta,
    currentLabel,
    completed,
    remaining,
    percent,
    reviewQueue,
    generationAudit,
    needsReview,
    failed,
  } = useCampaignAiStatus(projectId);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);
  const [showEstimateDetails, setShowEstimateDetails] = useState(false);
  const [showAssets, setShowAssets] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const wasRunning = useRef(false);

  const packsQ = useQuery({
    queryKey: ['content-packs', projectId],
    queryFn: () =>
      request<{ data: ContentPackRow[] }>(
        `/v1/projects/${projectId}/backlink-builder/content-packs`
      ),
    enabled: !!projectId && (showAssets || selected.size > 0 || expandedId != null),
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

  // One-time celebration when run finishes (State B → C)
  useEffect(() => {
    if (generateState === 'running') {
      wasRunning.current = true;
      return;
    }
    if (generateState === 'complete' && wasRunning.current) {
      wasRunning.current = false;
      const key = CELEBRATION_KEY(projectId);
      const stamp = `${progress?.completed ?? 0}-${progress?.needsReview ?? 0}-${progress?.failed ?? 0}`;
      const prev = sessionStorage.getItem(key);
      if (prev !== stamp) {
        sessionStorage.setItem(key, stamp);
        setShowCelebration(true);
        toast.success('AI completed content generation.');
      }
    }
  }, [generateState, projectId, progress?.completed, progress?.needsReview, progress?.failed]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['content-generation', projectId] });
    queryClient.invalidateQueries({ queryKey: ['content-packs', projectId] });
    queryClient.invalidateQueries({ queryKey: ['campaign-health', projectId] });
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

  const startGeneration = useMutation({
    mutationFn: async () => {
      const res = await request<{ data: { message?: string } }>(
        `/v1/projects/${projectId}/backlink-builder/automation/content-generation/generate`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      return res.data;
    },
    onSuccess: (data) => {
      invalidate();
      toast.success(data.message ?? 'AI generation started');
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

  const approvedCount = progress?.approved ?? 0;
  const pkgCount = generationAudit?.packages.generated ?? progress?.completed ?? 0;
  const imgCount = generationAudit?.images.generated ?? pkgCount;
  const metaCount = generationAudit?.metadata.generated ?? pkgCount;
  const videoCount = generationAudit?.videoMetadata.generated ?? pkgCount;

  const reviewPanel = (
    <div className="overflow-x-auto rounded-xl border border-border/40">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2.5 w-10">
              <input
                type="checkbox"
                aria-label="Select all needing review"
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
                      onClick={() => {
                        setExpandedId(open ? null : row.id);
                        setShowTechnical(false);
                        setShowAssets(true);
                      }}
                    >
                      {open ? 'Hide' : 'Preview'}
                    </Button>
                    {row.generationStatus === 'Needs Review' ? (
                      <Button
                        size="sm"
                        variant="secondary"
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
    </div>
  );

  return (
    <PageTransition className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Sparkles className="h-6 w-6" /> Generate Content
        </h1>
        <p className="text-muted-foreground text-sm mt-1">AI Content Pipeline</p>
      </div>

      {boardLoading ? <AiLoadingState message="Loading…" /> : null}

      {/* —— State B: Running —— */}
      {generateState === 'running' ? (
        <Card className="rounded-2xl border-border/40 shadow-sm">
          <CardContent className="pt-5 space-y-3">
            <p className="font-medium text-sm">AI is generating…</p>
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(4, percent))}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Current: {currentLabel || 'Working…'}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              Remaining: {remaining}
              {eta ? ` · ETA: ${eta}` : ''}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* —— State C: Complete —— */}
      {generateState === 'complete' ? (
        <>
          {showCelebration ? (
            <Card className="rounded-2xl border-emerald-500/30 bg-emerald-500/5 shadow-sm">
              <CardContent className="pt-5 space-y-3">
                <p className="font-medium">AI completed content generation.</p>
                <p className="text-sm text-muted-foreground">
                  {pkgCount} packages created. Everything is ready.
                </p>
                {(needsReview > 0 || failed > 0) ? null : (
                  <Button asChild>
                    <Link to={continueHref}>Continue →</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-2xl border-border/40 shadow-sm">
              <CardContent className="pt-5 space-y-3">
                <p className="font-medium text-sm">Generation Complete</p>
                <p className="text-sm text-muted-foreground tabular-nums">
                  {pkgCount} packages · {imgCount} images · {metaCount} metadata · {videoCount}{' '}
                  video metadata
                </p>
                <ExceptionChip projectId={projectId}>{reviewPanel}</ExceptionChip>
                {needsReview === 0 && failed === 0 ? (
                  <Button asChild>
                    <Link to={continueHref}>Continue →</Link>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          )}
          {showCelebration && (needsReview > 0 || failed > 0) ? (
            <ExceptionChip projectId={projectId}>{reviewPanel}</ExceptionChip>
          ) : null}
        </>
      ) : null}

      {/* —— State A: Not started —— */}
      {generateState === 'idle' ? (
        <Card className="rounded-2xl border-border/40 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Generate Content</CardTitle>
            <CardDescription className="tabular-nums">
              {approvedCount} website{approvedCount === 1 ? '' : 's'} approved
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Estimated time: {estimates?.durationLabel ?? '~estimate'}
            </p>
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground -ml-2"
                onClick={() => setShowEstimateDetails((v) => !v)}
              >
                <ChevronDown
                  className={cn(
                    'h-4 w-4 mr-1 transition-transform',
                    showEstimateDetails && 'rotate-180'
                  )}
                />
                details
              </Button>
              {showEstimateDetails && estimates ? (
                <dl className="mt-2 grid gap-1 text-xs text-muted-foreground">
                  <div className="flex justify-between gap-4">
                    <dt>Tokens</dt>
                    <dd className="tabular-nums">{estimates.tokensLabel}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Images</dt>
                    <dd className="tabular-nums">{estimates.imagesLabel}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Cost</dt>
                    <dd className="tabular-nums">{estimates.costLabel}</dd>
                  </div>
                </dl>
              ) : null}
            </div>
            <Button
              size="lg"
              disabled={startGeneration.isPending || approvedCount === 0}
              onClick={() => startGeneration.mutate()}
            >
              Start AI Generation
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Empty approved — continue to AI Review */}
      {generateState === 'empty' && !boardLoading ? (
        <Card className="rounded-2xl border-border/40 shadow-sm">
          <CardContent className="pt-5 space-y-3">
            <p className="font-medium text-sm">Current: Generate Content</p>
            <p className="text-sm text-muted-foreground">
              Approve websites in AI Review first, then AI can generate packages.
            </p>
            <Button asChild>
              <Link to={`/projects/${projectId}/backlink-builder/classification`}>Continue →</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Layer 2 — Generated Assets summary (below fold on complete) */}
      {generateState === 'complete' && !showCelebration ? (
        <div className="pt-2 space-y-2">
          <p className="text-sm text-muted-foreground">
            Generated Assets — Images {imgCount} · Packages {pkgCount} · Metadata {metaCount} ·
            Videos {videoCount}
          </p>
          <Button size="sm" variant="outline" onClick={() => setShowAssets((v) => !v)}>
            {showAssets ? 'Hide Assets' : 'Open Assets →'}
          </Button>
          {showAssets ? (
            <div className="space-y-2 text-sm">
              <p>
                Images · {imgCount} Generated ·{' '}
                <Link
                  className="underline"
                  to={`/projects/${projectId}/backlink-builder/image-studio`}
                >
                  Open Gallery →
                </Link>
              </p>
              <p>
                Videos · {videoCount} Generated ·{' '}
                <Link
                  className="underline"
                  to={`/projects/${projectId}/backlink-builder/video-studio`}
                >
                  Open Gallery →
                </Link>
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Layer 3 — all demoted actions */}
      <AdvancedTools>
        <p className="text-sm text-muted-foreground">
          Retries, export, manual selection, studios, and diagnostics.
        </p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['generate_all', 'Start AI Generation'],
              ['generate_selected', 'Generate Selected'],
              ['retry_failed', 'Retry Failed'],
              ['retry_missing_images', 'Retry Images'],
              ['retry_missing_metadata', 'Retry Metadata'],
              ['retry_missing_videos', 'Retry Videos'],
              ['approve_all', 'Approve All'],
              ['approve_selected', 'Approve Selected'],
              ['reject_selected', 'Reject Selected'],
              ['export_packages', 'Export Packages'],
              ['delete_packages', 'Delete Packages'],
            ] as const
          ).map(([action, label]) => (
            <Button
              key={action}
              size="sm"
              variant="outline"
              disabled={bulk.isPending}
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
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to={`/projects/${projectId}/backlink-builder/image-studio`}>Image Studio</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to={`/projects/${projectId}/backlink-builder/video-studio`}>Video Studio</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to={`/projects/${projectId}/backlink-builder/campaign-health`}>
              Campaign Debug
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to={`/projects/${projectId}/diagnostics`}>Diagnostics</Link>
          </Button>
        </div>
        <OpportunitySelector
          projectId={projectId}
          selectedId={null}
          onSelect={() => undefined}
          mode="content"
          showTable
          allowClear
          label="Manual Search / Website Selector"
        />
        <ImageIntelligencePanel embedded />
        {completed > 0 || reviewQueue.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Needs Review (full list)</p>
            {reviewQueue.length > 0 ? reviewPanel : null}
          </div>
        ) : null}
      </AdvancedTools>
    </PageTransition>
  );
}
