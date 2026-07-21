import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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

type Analytics = {
  imported: number;
  classified: number;
  unknown: number;
  byType: Array<{ id: string; label: string; count: number }>;
  snapshot: {
    directories: number;
    guestPosts: number;
    articles: number;
    images: number;
    videos: number;
    profiles: number;
    forums: number;
    qa: number;
    unknown: number;
  };
};

type QueueGroup = {
  queue: string;
  label: string;
  count: number;
  items: Array<{
    id: string;
    domain: string;
    website: string;
    type: string;
    confidence: number;
    reason: string;
    agent: string;
    score: number | null;
  }>;
};

const GROUPS: Array<{ key: keyof Analytics['snapshot']; label: string }> = [
  { key: 'directories', label: 'Directories' },
  { key: 'guestPosts', label: 'Guest Posts' },
  { key: 'forums', label: 'Forums' },
  { key: 'images', label: 'Images' },
  { key: 'videos', label: 'Videos' },
  { key: 'articles', label: 'Resource Pages' },
  { key: 'profiles', label: 'Profiles' },
  { key: 'qa', label: 'Q&A' },
  { key: 'unknown', label: 'Unknown' },
];

export function ClassificationDashboardPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const qc = useQueryClient();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);

  const analytics = useQuery({
    queryKey: ['classification-analytics', projectId],
    queryFn: () =>
      request<{ data: Analytics }>(
        `/v1/projects/${projectId}/backlink-builder/automation/classification/analytics`
      ),
    enabled: !!projectId,
    refetchInterval: 8_000,
  });

  const queues = useQuery({
    queryKey: ['classification-queues', projectId],
    queryFn: () =>
      request<{ data: { queues: QueueGroup[]; analytics: Analytics } }>(
        `/v1/projects/${projectId}/backlink-builder/automation/classification/queues`
      ),
    enabled: !!projectId,
    refetchInterval: 8_000,
  });

  const types = useQuery({
    queryKey: ['classification-types'],
    queryFn: () =>
      request<{ data: Array<{ id: string; displayName: string }> }>(
        `/v1/projects/${projectId}/backlink-builder/automation/classification/types`
      ),
    enabled: !!projectId && showTechnical,
  });

  const correct = useMutation({
    mutationFn: (payload: { opportunityId: string; fromType: string; toType: string }) =>
      request(
        `/v1/projects/${projectId}/backlink-builder/automation/classification/opportunities/${payload.opportunityId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            fromType: payload.fromType,
            toType: payload.toType,
            reason: 'Manual override from classification dashboard',
          }),
        }
      ),
    onSuccess: () => {
      toast.success('Updated — AI will remember this');
      qc.invalidateQueries({ queryKey: ['classification-analytics', projectId] });
      qc.invalidateQueries({ queryKey: ['classification-queues', projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const a = analytics.data?.data;
  const snap = a?.snapshot;
  const classified = a?.classified ?? 0;
  const stillScanning = analytics.isFetching && classified === 0;

  const queueByLabel = (label: string) =>
    (queues.data?.data.queues ?? []).find(
      (q) => q.label.toLowerCase().includes(label.toLowerCase().split(' ')[0].toLowerCase())
    );

  return (
    <PageTransition className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Sparkles className="h-6 w-6" /> AI Review
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          AI found opportunities and grouped them by type.
        </p>
      </div>

      {stillScanning || analytics.isLoading ? (
        <AiActivityCard
          title="AI is reviewing websites"
          percent={classified > 0 && a?.imported ? Math.round((classified / a.imported) * 100) : 35}
          current="Detecting opportunity type"
          next="Scoring difficulty & fit"
          eta="~1 min"
          items={[
            { label: 'Homepage', state: 'done' },
            { label: 'Navigation', state: 'done' },
            { label: 'Forms', state: 'active' },
            { label: 'Metadata', state: 'queued' },
          ]}
        />
      ) : null}

      {analytics.isLoading ? (
        <AiLoadingState message="AI is studying imported websites…" />
      ) : (
        <>
          <Card className="rounded-2xl border-border/40 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">AI Found</CardTitle>
              <CardDescription>
                <span className="text-2xl font-semibold tabular-nums text-foreground">
                  {classified}
                </span>{' '}
                opportunities · grouped by type
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {GROUPS.map(({ key, label }) => {
                const count = snap?.[key] ?? 0;
                if (count === 0 && key !== 'unknown') return null;
                const open = openGroup === key;
                const group = queueByLabel(label);
                return (
                  <div key={key} className="rounded-xl border border-border/50 overflow-hidden">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-muted/40"
                      onClick={() => setOpenGroup(open ? null : key)}
                    >
                      <span className="text-sm font-medium">{label}</span>
                      <span className="flex items-center gap-2">
                        <Badge className="tabular-nums text-[10px]">{count}</Badge>
                        <ChevronDown
                          className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')}
                        />
                      </span>
                    </button>
                    {open ? (
                      <div className="border-t border-border/40 px-3 py-2 space-y-2 bg-muted/20">
                        {(group?.items ?? []).length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2">
                            {count} sites in this group — open Approve Opportunities to decide.
                          </p>
                        ) : (
                          group!.items.slice(0, 12).map((item) => (
                            <div
                              key={item.id}
                              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2 border-b border-border/30 last:border-0"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{item.website}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  Difficulty · {item.score != null ? item.score : '—'}
                                  {item.reason ? ` · ${item.reason.slice(0, 60)}` : ''}
                                </p>
                              </div>
                              <Button size="sm" variant="outline" asChild>
                                <Link to={`/projects/${projectId}/campaigns/queue`}>
                                  Approve
                                </Link>
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setShowTechnical((v) => !v)}
            >
              {showTechnical ? 'Hide' : 'Show'} Technical Details
            </Button>
            {showTechnical ? (
              <Card className="mt-2 border-dashed">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Advanced · queues & overrides</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  {(queues.data?.data.queues ?? []).map((q) => (
                    <div key={q.queue}>
                      <p className="font-medium mb-2">
                        {q.label} <Badge className="text-[10px] ml-1">{q.count}</Badge>
                      </p>
                      <ul className="space-y-2">
                        {q.items.slice(0, 5).map((item) => (
                          <li key={item.id} className="flex flex-wrap gap-2 items-center text-xs">
                            <span className="font-medium">{item.website}</span>
                            <span className="text-muted-foreground">
                              {item.type} · {item.confidence}% · {item.agent || '—'}
                            </span>
                            <select
                              className="h-7 rounded border px-1"
                              defaultValue=""
                              onChange={(e) => {
                                const toType = e.target.value;
                                if (!toType) return;
                                correct.mutate({
                                  opportunityId: item.id,
                                  fromType: item.type,
                                  toType,
                                });
                                e.target.value = '';
                              }}
                            >
                              <option value="">Override…</option>
                              {(types.data?.data ?? []).map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.displayName}
                                </option>
                              ))}
                            </select>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </>
      )}
    </PageTransition>
  );
}
