import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Layers, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { PageTransition } from '@/components/demo/page-transition';
import { BacklinkBuilderNav } from '@/components/backlink-builder/backlink-builder-widget';

type Analytics = {
  imported: number;
  classified: number;
  unknown: number;
  avgConfidence: number;
  estimatedAccuracy: number;
  learningPatterns: number;
  byType: Array<{ id: string; label: string; count: number }>;
  byQueue: Array<{ queue: string; count: number }>;
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

export function ClassificationDashboardPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const qc = useQueryClient();

  const analytics = useQuery({
    queryKey: ['classification-analytics', projectId],
    queryFn: () =>
      request<{ data: Analytics }>(
        `/v1/projects/${projectId}/backlink-builder/automation/classification/analytics`
      ),
    enabled: !!projectId,
    refetchInterval: 12_000,
  });

  const queues = useQuery({
    queryKey: ['classification-queues', projectId],
    queryFn: () =>
      request<{ data: { queues: QueueGroup[]; analytics: Analytics } }>(
        `/v1/projects/${projectId}/backlink-builder/automation/classification/queues`
      ),
    enabled: !!projectId,
    refetchInterval: 12_000,
  });

  const types = useQuery({
    queryKey: ['classification-types'],
    queryFn: () =>
      request<{ data: Array<{ id: string; displayName: string }> }>(
        `/v1/projects/${projectId}/backlink-builder/automation/classification/types`
      ),
    enabled: !!projectId,
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
      toast.success('Classification updated — AI will learn from this correction');
      qc.invalidateQueries({ queryKey: ['classification-analytics', projectId] });
      qc.invalidateQueries({ queryKey: ['classification-queues', projectId] });
      qc.invalidateQueries({ queryKey: ['opportunity-queue', projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const a = analytics.data?.data;
  const snap = a?.snapshot;

  return (
    <PageTransition className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6" /> AI Review
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            AI found opportunities and grouped them by type. Continue when you are ready to approve.
          </p>
        </div>
        <BacklinkBuilderNav />
      </div>

      {analytics.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ['Imported', a?.imported],
                ['Reviewed', a?.classified],
                ['Still learning', a?.unknown],
              ] as const
            ).map(([label, value]) => (
              <Card key={label}>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-semibold tabular-nums">{value ?? 0}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {a?.classified != null
                  ? `AI found ${a.classified} opportunities`
                  : 'AI review summary'}
              </CardTitle>
              <CardDescription>Grouped by website type — ready for approval</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(a?.byType ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No classifications yet. Import URLs to start the AI scan.
                </p>
              ) : (
                (a?.byType ?? []).map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between border-b border-border/60 py-2 last:border-0"
                  >
                    <span className="text-sm font-medium">{row.label}</span>
                    <span className="tabular-nums font-semibold">{row.count}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {(
              [
                ['Directories', snap?.directories],
                ['Guest Posts', snap?.guestPosts],
                ['Articles', snap?.articles],
                ['Images', snap?.images],
                ['Videos', snap?.videos],
                ['Profiles', snap?.profiles],
                ['Forums', snap?.forums],
                ['Q&A', snap?.qa],
                ['Unknown', snap?.unknown],
              ] as const
            ).map(([label, n]) => (
              <Card key={label}>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-semibold tabular-nums">{n ?? 0}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4" /> Workflow queues
          </CardTitle>
          <CardDescription>
            Each classified group routes into its dedicated automation queue. Override type to teach the
            engine.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {queues.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (queues.data?.data.queues ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending classified opportunities.</p>
          ) : (
            (queues.data?.data.queues ?? []).map((q) => (
              <div key={q.queue} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium capitalize">{q.label}</h3>
                  <Badge className="text-[10px]">{q.count}</Badge>
                </div>
                <ul className="space-y-2">
                  {q.items.slice(0, 8).map((item) => (
                    <li
                      key={item.id}
                      className="rounded-md border px-3 py-2 text-sm flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{item.website}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {item.type} · {item.confidence}% · {item.reason || '—'}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Agent: {item.agent || '—'} · {item.domain}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          className="h-8 rounded-md border border-input bg-transparent px-2 text-xs max-w-[160px]"
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
                          <option value="">Override type…</option>
                          {(types.data?.data ?? []).map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.displayName}
                            </option>
                          ))}
                        </select>
                        <Button size="sm" variant="outline" asChild>
                          <Link to={`/projects/${projectId}/campaigns/queue`}>Queue</Link>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <Link to={`/projects/${projectId}/backlink-builder/import`}>Import URLs</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to={`/projects/${projectId}/campaigns/queue`}>Opportunity Queue</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to={`/projects/${projectId}/reports`}>Reports</Link>
        </Button>
      </div>
    </PageTransition>
  );
}
