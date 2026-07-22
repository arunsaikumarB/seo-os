/**
 * AI Review — confidence-based triage (Phase 2).
 * Reuses existing Card/Badge/Button styling; data from CSM via /ai-review.
 */
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import { PageTransition } from '@/components/demo/page-transition';
import { AiActivityCard, AiLoadingState } from '@/components/workflow/ai-activity-card';
import { cn } from '@/lib/utils';

type AiReviewItem = {
  id: string;
  website: string;
  domain: string | null;
  confidenceScore: number | null;
  reviewTier: string | null;
  reviewDecision: string | null;
  approvedBy: string | null;
  classification: string | null;
  classificationLabel: string | null;
  canApprove: boolean;
  reason: string | null;
};

type AiReviewBoard = {
  summary: {
    imported: number;
    approved: number;
    rejected: number;
    needsClassification: number;
    unsupported: number;
    duplicate: number;
    dead: number;
    pending: number;
    invariantOk: boolean;
  };
  tiers: {
    autoApproved: AiReviewItem[];
    recommended: AiReviewItem[];
    needsClassification: AiReviewItem[];
    userApproved: AiReviewItem[];
    rejected: AiReviewItem[];
    unsupported: AiReviewItem[];
    duplicate: AiReviewItem[];
    dead: AiReviewItem[];
  };
};

type FilterKey =
  | 'recommended'
  | 'needsClassification'
  | 'autoApproved'
  | 'rejected'
  | 'unsupported'
  | 'duplicate'
  | 'dead'
  | 'all';

export function ClassificationDashboardPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FilterKey>('recommended');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openAuto, setOpenAuto] = useState(false);

  const board = useQuery({
    queryKey: ['ai-review', projectId],
    queryFn: () =>
      request<{ data: AiReviewBoard }>(
        `/v1/projects/${projectId}/backlink-builder/automation/ai-review`
      ),
    enabled: !!projectId,
    refetchInterval: 5_000,
  });

  const types = useQuery({
    queryKey: ['classification-types'],
    queryFn: () =>
      request<{ data: Array<{ id: string; displayName: string }> }>(
        `/v1/projects/${projectId}/backlink-builder/automation/classification/types`
      ),
    enabled: !!projectId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ai-review', projectId] });
    qc.invalidateQueries({ queryKey: ['classification-analytics', projectId] });
    qc.invalidateQueries({ queryKey: ['bee-execution-progress', projectId] });
    qc.invalidateQueries({ queryKey: ['campaign-health', projectId] });
  };

  const bulk = useMutation({
    mutationFn: (payload: {
      action: 'approve' | 'reject' | 'unsupported' | 'outreach' | 'retry_analysis';
      itemIds: string[];
    }) =>
      request<{
        data: {
          succeeded: number;
          skipped: number;
          skipReasons: string[];
          errors: string[];
        };
      }>(`/v1/projects/${projectId}/backlink-builder/automation/ai-review/bulk`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (res, vars) => {
      const d = res.data;
      const parts = [`${d.succeeded} ${vars.action === 'approve' ? 'approved' : vars.action}`];
      if (d.skipped) {
        parts.push(
          `${d.skipped} skipped${
            d.skipReasons[0]?.includes('classification')
              ? ' — need classification first'
              : ''
          }`
        );
      }
      if (d.errors.length) parts.push(`${d.errors.length} errors`);
      toast.success(parts.join(', '));
      setSelected(new Set());
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const classify = useMutation({
    mutationFn: (payload: { opportunityId: string; classificationId: string }) =>
      request(
        `/v1/projects/${projectId}/backlink-builder/automation/ai-review/${payload.opportunityId}/classify`,
        {
          method: 'POST',
          body: JSON.stringify({ classificationId: payload.classificationId }),
        }
      ),
    onSuccess: () => {
      toast.success('Type saved — Approve / Reject unlocked');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data = board.data?.data;
  const summary = data?.summary;
  const stillScanning = board.isFetching && (summary?.imported ?? 0) === 0;

  const visibleItems = useMemo(() => {
    if (!data) return [];
    switch (filter) {
      case 'recommended':
        return data.tiers.recommended;
      case 'needsClassification':
        return data.tiers.needsClassification;
      case 'autoApproved':
        return data.tiers.autoApproved;
      case 'rejected':
        return data.tiers.rejected;
      case 'unsupported':
        return data.tiers.unsupported;
      case 'duplicate':
        return data.tiers.duplicate;
      case 'dead':
        return data.tiers.dead;
      default:
        return [
          ...data.tiers.recommended,
          ...data.tiers.needsClassification,
          ...data.tiers.autoApproved,
          ...data.tiers.userApproved,
          ...data.tiers.rejected,
          ...data.tiers.unsupported,
          ...data.tiers.duplicate,
          ...data.tiers.dead,
        ];
    }
  }, [data, filter]);

  const allVisibleSelected =
    visibleItems.length > 0 && visibleItems.every((i) => selected.has(i.id));

  const toggleAll = () => {
    if (allVisibleSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(visibleItems.map((i) => i.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <PageTransition className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Sparkles className="h-6 w-6" /> AI Review
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          High confidence is auto-approved. Confirm recommendations or classify uncertain sites.
        </p>
      </div>

      {stillScanning || board.isLoading ? (
        <AiActivityCard
          title="AI is reviewing websites"
          percent={35}
          current="Detecting opportunity type"
          next="Scoring confidence & tier"
          eta="~1 min"
          items={[
            { label: 'Homepage', state: 'done' },
            { label: 'Navigation', state: 'done' },
            { label: 'Forms', state: 'active' },
            { label: 'Metadata', state: 'queued' },
          ]}
        />
      ) : null}

      {board.isLoading ? (
        <AiLoadingState message="AI is studying imported websites…" />
      ) : summary ? (
        <>
          <Card className="rounded-2xl border-border/40 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Import summary</CardTitle>
              <CardDescription>
                Live from Campaign State Manager
                {!summary.invariantOk ? (
                  <span className="text-red-600 ml-2">· invariant mismatch — check Campaign Health</span>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
              <span>Imported: {summary.imported}</span>
              <span>Approved: {summary.approved}</span>
              <span>Rejected: {summary.rejected}</span>
              <span>Needs Classification: {summary.needsClassification}</span>
              <span>Unsupported: {summary.unsupported}</span>
              <span>Duplicate: {summary.duplicate}</span>
              <span>Dead: {summary.dead}</span>
              <span>Pending Analysis: {summary.pending}</span>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            {(
              [
                ['recommended', 'Recommended', data?.tiers.recommended.length ?? 0],
                [
                  'needsClassification',
                  'Needs Classification',
                  data?.tiers.needsClassification.length ?? 0,
                ],
                ['autoApproved', 'Auto-Approved', data?.tiers.autoApproved.length ?? 0],
                ['rejected', 'Rejected', data?.tiers.rejected.length ?? 0],
                ['unsupported', 'Unsupported', data?.tiers.unsupported.length ?? 0],
                ['duplicate', 'Duplicate', data?.tiers.duplicate.length ?? 0],
                ['dead', 'Dead', data?.tiers.dead.length ?? 0],
              ] as const
            ).map(([key, label, count]) => (
              <Button
                key={key}
                size="sm"
                variant={filter === key ? 'default' : 'outline'}
                onClick={() => {
                  setFilter(key);
                  setSelected(new Set());
                }}
              >
                {label}
                <Badge className="ml-1.5 text-[10px] tabular-nums">{count}</Badge>
              </Button>
            ))}
          </div>

          {selected.size > 0 ? (
            <Card className="rounded-2xl border-border/40">
              <CardContent className="pt-4 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium tabular-nums mr-2">
                  {selected.size} selected
                </span>
                <Button
                  size="sm"
                  disabled={bulk.isPending}
                  onClick={() =>
                    bulk.mutate({ action: 'approve', itemIds: [...selected] })
                  }
                >
                  Approve Selected
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulk.isPending}
                  onClick={() =>
                    bulk.mutate({ action: 'reject', itemIds: [...selected] })
                  }
                >
                  Reject Selected
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulk.isPending}
                  onClick={() =>
                    bulk.mutate({ action: 'outreach', itemIds: [...selected] })
                  }
                >
                  Move to Outreach
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulk.isPending}
                  onClick={() =>
                    bulk.mutate({ action: 'unsupported', itemIds: [...selected] })
                  }
                >
                  Mark Unsupported
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulk.isPending}
                  onClick={() =>
                    bulk.mutate({ action: 'retry_analysis', itemIds: [...selected] })
                  }
                >
                  Retry Analysis
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {filter === 'autoApproved' || (data?.tiers.autoApproved.length ?? 0) > 0 ? (
            <Card className="rounded-2xl border-border/40">
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-left"
                onClick={() => setOpenAuto((v) => !v)}
              >
                <span className="text-sm font-medium">
                  Auto-Approved ({data?.tiers.autoApproved.length ?? 0})
                </span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform',
                    openAuto && 'rotate-180'
                  )}
                />
              </button>
              {openAuto || filter === 'autoApproved' ? (
                <CardContent className="border-t space-y-2 pt-3">
                  {(data?.tiers.autoApproved ?? []).map((item) => (
                    <ReviewRow
                      key={item.id}
                      item={item}
                      selected={selected.has(item.id)}
                      onToggle={() => toggleOne(item.id)}
                      types={types.data?.data ?? []}
                      onClassify={(classificationId) =>
                        classify.mutate({ opportunityId: item.id, classificationId })
                      }
                      recommend
                      auto
                    />
                  ))}
                </CardContent>
              ) : null}
            </Card>
          ) : null}

          <Card className="rounded-2xl border-border/40 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base capitalize">
                  {filter === 'needsClassification' ? 'Needs Classification' : filter}
                </CardTitle>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    disabled={visibleItems.length === 0}
                  />
                  Select All ({visibleItems.length})
                </label>
              </div>
              <CardDescription>
                {filter === 'recommended'
                  ? 'AI recommends approval — confirm or reject'
                  : filter === 'needsClassification'
                    ? 'Choose a website type before Approve is available'
                    : 'Review decisions'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {visibleItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No items in this view.</p>
              ) : (
                visibleItems.map((item) => (
                  <ReviewRow
                    key={item.id}
                    item={item}
                    selected={selected.has(item.id)}
                    onToggle={() => toggleOne(item.id)}
                    types={types.data?.data ?? []}
                    onClassify={(classificationId) =>
                      classify.mutate({ opportunityId: item.id, classificationId })
                    }
                    recommend={filter === 'recommended'}
                    onApprove={() => bulk.mutate({ action: 'approve', itemIds: [item.id] })}
                    onReject={() => bulk.mutate({ action: 'reject', itemIds: [item.id] })}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </PageTransition>
  );
}

function ReviewRow(props: {
  item: AiReviewItem;
  selected: boolean;
  onToggle: () => void;
  types: Array<{ id: string; displayName: string }>;
  onClassify: (id: string) => void;
  recommend?: boolean;
  auto?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const { item } = props;
  const needsClass =
    item.reviewDecision === 'Needs Classification' ||
    item.reviewTier === 'needs_classification';

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2 border-b border-border/30 last:border-0">
      <div className="flex items-start gap-2 min-w-0">
        <input
          type="checkbox"
          className="mt-1"
          checked={props.selected}
          onChange={props.onToggle}
          aria-label={`Select ${item.website}`}
        />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{item.website}</p>
          <p className="text-[11px] text-muted-foreground">
            {item.confidenceScore != null ? `${item.confidenceScore}%` : '—'}
            {item.classificationLabel || item.classification
              ? ` · ${item.classificationLabel || item.classification}`
              : ''}
            {props.recommend ? ' · AI recommends approval' : ''}
            {props.auto ? ` · auto` : ''}
            {item.approvedBy ? ` · by ${item.approvedBy}` : ''}
            {item.reason ? ` · ${item.reason.slice(0, 48)}` : ''}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {needsClass ? (
          <select
            className="h-8 rounded border px-2 text-xs"
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              props.onClassify(v);
              e.target.value = '';
            }}
          >
            <option value="">Choose website type…</option>
            {props.types
              .filter((t) => t.id !== 'unknown')
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName}
                </option>
              ))}
          </select>
        ) : item.canApprove && props.onApprove ? (
          <>
            <Button size="sm" variant="outline" onClick={props.onApprove}>
              Approve
            </Button>
            <Button size="sm" variant="ghost" onClick={props.onReject}>
              Reject
            </Button>
          </>
        ) : (
          <Badge className="text-[10px]">{item.reviewDecision ?? item.reviewTier ?? '—'}</Badge>
        )}
      </div>
    </div>
  );
}
