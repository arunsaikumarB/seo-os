import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
  domain?: string | null;
  pipeline_stage?: string | null;
  metadata?: {
    submission_id?: string;
    content_studio_draft_id?: string;
    workflow?: {
      destination_stage?: string;
      submission_id?: string;
    };
  } | null;
};

type QueueFilter = 'pending_review' | 'approved';

export function OpportunityQueuePage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<QueueFilter>('pending_review');

  const invalidateDownstream = () => {
    queryClient.invalidateQueries({ queryKey: ['opportunity-queue', projectId] });
    queryClient.invalidateQueries({ queryKey: ['submissions', projectId] });
    queryClient.invalidateQueries({ queryKey: ['content-drafts', projectId] });
    queryClient.invalidateQueries({ queryKey: ['content-library', projectId] });
    queryClient.invalidateQueries({ queryKey: ['campaigns', projectId] });
    queryClient.invalidateQueries({ queryKey: ['pipeline', projectId] });
    queryClient.invalidateQueries({ queryKey: ['backlink-builder', projectId] });
  };

  const queue = useQuery({
    queryKey: ['opportunity-queue', projectId, filter],
    queryFn: () =>
      request<{ data: Opportunity[] }>(
        `/v1/projects/${projectId}/campaigns/queue/opportunities?queueStatus=${filter}`
      ),
    enabled: !!projectId,
  });

  const enrich = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/campaigns/queue/enrich`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('AI recommendations updated');
      queryClient.invalidateQueries({ queryKey: ['opportunity-queue', projectId] });
    },
    onError: (err: Error) => toast.error(err.message || 'Enrichment failed'),
  });

  const review = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      request(`/v1/projects/${projectId}/campaigns/queue/opportunities/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      }),
    onSuccess: (_data, vars) => {
      if (vars.action === 'approve') {
        toast.success('Approved — moved to Submission Queue with linked draft');
      } else {
        toast.success('Opportunity rejected');
      }
      invalidateDownstream();
    },
    onError: (err: Error) =>
      toast.error(err.message || 'Approval failed — item left in previous state'),
  });

  const bulkReview = useMutation({
    mutationFn: (action: 'approve' | 'reject') =>
      request<{
        data: {
          results: Opportunity[];
          errors: Array<{ id: string; message: string }>;
        };
      }>(`/v1/projects/${projectId}/campaigns/queue/bulk-review`, {
        method: 'POST',
        body: JSON.stringify({ opportunityIds: [...selected], action }),
      }),
    onSuccess: (res, action) => {
      const { results, errors } = res.data;
      setSelected(new Set());
      if (errors?.length) {
        toast.error(
          `${errors.length} failed${results.length ? `, ${results.length} succeeded` : ''}: ${errors[0]?.message ?? 'Unknown error'}`
        );
      } else if (action === 'approve') {
        toast.success(`Approved ${results.length} — moved to Submission Queue`);
      } else {
        toast.success(`Rejected ${results.length}`);
      }
      invalidateDownstream();
    },
    onError: (err: Error) =>
      toast.error(err.message || 'Bulk review failed — items left in previous state'),
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
  const isPending = filter === 'pending_review';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ListChecks className="h-6 w-6" /> Opportunity Queue
          </h1>
          <p className="text-muted-foreground">
            Review, prioritize, and approve discovered opportunities
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => enrich.mutate()}
          disabled={enrich.isPending}
        >
          <Sparkles className="h-3 w-3 mr-1" /> AI Recommendations
        </Button>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={isPending ? 'default' : 'outline'}
          onClick={() => {
            setFilter('pending_review');
            setSelected(new Set());
          }}
        >
          Pending
        </Button>
        <Button
          size="sm"
          variant={!isPending ? 'default' : 'outline'}
          onClick={() => {
            setFilter('approved');
            setSelected(new Set());
          }}
        >
          Approved
        </Button>
      </div>

      {isPending && selected.size > 0 && (
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => bulkReview.mutate('approve')}
            disabled={bulkReview.isPending || review.isPending}
          >
            Approve {selected.size} selected
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => bulkReview.mutate('reject')}
            disabled={bulkReview.isPending || review.isPending}
          >
            Reject {selected.size} selected
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {items.map((opp) => {
          const submissionId =
            opp.metadata?.workflow?.submission_id ?? opp.metadata?.submission_id;
          return (
            <Card key={opp.id}>
              <CardContent className="pt-4 flex items-start gap-3">
                {isPending && (
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(opp.id)}
                    onChange={() => toggle(opp.id)}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{opp.title}</p>
                    <Badge className="text-[10px]">Score {opp.score}</Badge>
                    <Badge className="text-[10px] capitalize">
                      {opp.opportunity_type.replace(/_/g, ' ')}
                    </Badge>
                    {!isPending && (
                      <>
                        <Badge className="text-[10px] capitalize">
                          {opp.pipeline_stage?.replace(/_/g, ' ') ?? 'campaign ready'}
                        </Badge>
                        {submissionId && (
                          <Badge className="text-[10px] border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                            Submission linked
                          </Badge>
                        )}
                      </>
                    )}
                  </div>
                  {opp.domain && (
                    <p className="text-xs text-muted-foreground mt-1">{opp.domain}</p>
                  )}
                  {opp.ai_recommendation && (
                    <p className="text-xs text-muted-foreground mt-1">{opp.ai_recommendation}</p>
                  )}
                  {!isPending && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Destination: Submission Queue · Campaign & Execution ready
                    </p>
                  )}
                </div>
                {isPending && (
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={review.isPending}
                      onClick={() => review.mutate({ id: opp.id, action: 'approve' })}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={review.isPending}
                      onClick={() => review.mutate({ id: opp.id, action: 'reject' })}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {isPending
              ? 'No opportunities pending review. Run discovery first.'
              : 'No approved opportunities yet. Approve from the Pending queue to hand them off.'}
          </p>
        )}
      </div>
    </div>
  );
}
