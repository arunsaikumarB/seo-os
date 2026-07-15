import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KanbanSquare } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { PageTransition } from '@/components/demo/page-transition';
import { QUEUE_STAGES } from './queue-constants';
import {
  OpportunitySelector,
  type SelectedOpportunity,
} from '@/components/opportunities/opportunity-selector';

type SubItem = {
  id: string;
  queue_stage?: string;
  opportunities?: { id: string; title?: string; domain?: string; opportunity_type?: string };
};

export function SubmissionQueuePage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const qc = useQueryClient();
  const [historyOppId, setHistoryOppId] = useState<string | null>(null);
  const [historyLabel, setHistoryLabel] = useState<string | null>(null);
  const [selectedOpp, setSelectedOpp] = useState<SelectedOpportunity | null>(null);
  const handleSelectOpp = useCallback((opp: SelectedOpportunity | null) => {
    setSelectedOpp(opp);
  }, []);

  const board = useQuery({
    queryKey: ['v11-queue', projectId],
    queryFn: () =>
      request<{ data: { columns: Record<string, SubItem[]> } }>(
        `/v1/projects/${projectId}/backlink-builder/queue?view=kanban`
      ),
    enabled: !!projectId,
  });

  const history = useQuery({
    queryKey: ['v11-queue-history', projectId, historyOppId],
    queryFn: () =>
      request<{
        data: Array<{ to_stage: string; from_stage?: string; note?: string; created_at: string }>;
      }>(`/v1/projects/${projectId}/backlink-builder/queue/${historyOppId}/history`),
    enabled: !!projectId && !!historyOppId,
  });

  const move = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      request(`/v1/projects/${projectId}/backlink-builder/submissions/${id}/stage`, {
        method: 'PATCH',
        body: JSON.stringify({ stage }),
      }),
    onSuccess: () => {
      toast.success('Stage updated');
      qc.invalidateQueries({ queryKey: ['v11-queue', projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns = useMemo(() => {
    const raw = board.data?.data.columns ?? {};
    if (!selectedOpp) return raw;
    const filtered: Record<string, SubItem[]> = {};
    for (const stage of QUEUE_STAGES) {
      filtered[stage] = (raw[stage] ?? []).filter((item) => {
        const opp = item.opportunities;
        return (
          opp?.id === selectedOpp.id ||
          opp?.domain?.toLowerCase() === selectedOpp.domain?.toLowerCase() ||
          opp?.title?.toLowerCase() === selectedOpp.website.toLowerCase()
        );
      });
    }
    return filtered;
  }, [board.data?.data.columns, selectedOpp]);

  return (
    <PageTransition className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <KanbanSquare className="h-6 w-6" /> Submission Queue
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Production workflow Kanban — approve before external submission.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Focus website</CardTitle>
          <CardDescription>
            Filter the queue by approved website. Leave empty to see all cards.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OpportunitySelector
            projectId={projectId}
            selectedId={selectedOpp?.id ?? null}
            onSelect={handleSelectOpp}
            mode="content"
            showTable={false}
            showRequiredFields={false}
            allowClear
            label="Website filter"
          />
        </CardContent>
      </Card>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {QUEUE_STAGES.map((stage) => (
          <Card key={stage} className="min-w-[220px] shrink-0">
            <CardHeader className="py-3">
              <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
                {stage.replace(/_/g, ' ')} ({(columns[stage] ?? []).length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[60vh] overflow-auto">
              {(columns[stage] ?? []).map((item) => (
                <div key={item.id} className="rounded border p-2 text-sm space-y-2">
                  <button
                    type="button"
                    className="text-left w-full font-medium hover:underline"
                    onClick={() => {
                      setHistoryOppId(item.opportunities?.id ?? null);
                      setHistoryLabel(
                        item.opportunities?.title ?? item.opportunities?.domain ?? 'Submission'
                      );
                    }}
                  >
                    {item.opportunities?.title ?? 'Submission'}
                  </button>
                  <p className="text-xs text-muted-foreground">{item.opportunities?.domain}</p>
                  <div className="flex gap-1 flex-wrap">
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/projects/${projectId}/backlink-builder/tracking?submission=${item.id}`}>
                        Preview
                      </Link>
                    </Button>
                    {stage === 'awaiting_review' && (
                      <Button size="sm" onClick={() => move.mutate({ id: item.id, stage: 'approved' })}>
                        Approve
                      </Button>
                    )}
                    {stage === 'prepared' && (
                      <Button size="sm" onClick={() => move.mutate({ id: item.id, stage: 'submitted' })}>
                        Mark submitted
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {historyOppId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">History / Timeline</CardTitle>
            {historyLabel && (
              <CardDescription>{historyLabel}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {(history.data?.data ?? []).map((e, i) => (
              <div key={i} className="flex gap-2 text-sm border-b py-2">
                <Badge className="text-[10px]">{e.from_stage ?? '—'} → {e.to_stage}</Badge>
                <span className="text-muted-foreground">{e.note}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(e.created_at).toLocaleString()}
                </span>
              </div>
            ))}
            {(history.data?.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No events yet.</p>
            )}
          </CardContent>
        </Card>
      )}
    </PageTransition>
  );
}
