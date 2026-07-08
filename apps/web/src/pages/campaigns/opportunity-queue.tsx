import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { ListChecks, Sparkles } from 'lucide-react';

type Opportunity = {
  id: string;
  title: string;
  score: number;
  opportunity_type: string;
  queue_status: string;
  ai_recommendation?: string;
  priority: number;
};

export function OpportunityQueuePage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const queue = useQuery({
    queryKey: ['opportunity-queue', projectId],
    queryFn: () =>
      request<{ data: Opportunity[] }>(
        `/v1/projects/${projectId}/campaigns/queue/opportunities?queueStatus=pending_review`
      ),
    enabled: !!projectId,
  });

  const enrich = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/campaigns/queue/enrich`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['opportunity-queue', projectId] }),
  });

  const review = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      request(`/v1/projects/${projectId}/campaigns/queue/opportunities/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['opportunity-queue', projectId] }),
  });

  const bulkReview = useMutation({
    mutationFn: (action: 'approve' | 'reject') =>
      request(`/v1/projects/${projectId}/campaigns/queue/bulk-review`, {
        method: 'POST',
        body: JSON.stringify({ opportunityIds: [...selected], action }),
      }),
    onSuccess: () => {
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['opportunity-queue', projectId] });
    },
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const items = queue.data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ListChecks className="h-6 w-6" /> Opportunity Queue
          </h1>
          <p className="text-muted-foreground">Review, prioritize, and approve discovered opportunities</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => enrich.mutate()} disabled={enrich.isPending}>
          <Sparkles className="h-3 w-3 mr-1" /> AI Recommendations
        </Button>
      </div>

      {selected.size > 0 && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => bulkReview.mutate('approve')}>
            Approve {selected.size} selected
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulkReview.mutate('reject')}>
            Reject {selected.size} selected
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {items.map((opp) => (
          <Card key={opp.id}>
            <CardContent className="pt-4 flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.has(opp.id)}
                onChange={() => toggle(opp.id)}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium">{opp.title}</p>
                  <Badge className="text-[10px]">Score {opp.score}</Badge>
                  <Badge className="text-[10px] capitalize">{opp.opportunity_type.replace(/_/g, ' ')}</Badge>
                </div>
                {opp.ai_recommendation && (
                  <p className="text-xs text-muted-foreground mt-1">{opp.ai_recommendation}</p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="outline" onClick={() => review.mutate({ id: opp.id, action: 'approve' })}>
                  Approve
                </Button>
                <Button size="sm" variant="ghost" onClick={() => review.mutate({ id: opp.id, action: 'reject' })}>
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">No opportunities pending review. Run discovery first.</p>
        )}
      </div>
    </div>
  );
}
