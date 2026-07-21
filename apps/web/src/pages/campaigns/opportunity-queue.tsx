import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { ListChecks, Sparkles } from 'lucide-react';
import { CurrentOpportunityBanner } from '@/components/opportunities/current-opportunity-banner';
import {
  useCurrentOpportunity,
  useCurrentOpportunityStore,
} from '@/hooks/use-current-opportunity';
import type { SelectedOpportunity } from '@/components/opportunities/opportunity-selector';

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
  monthly_traffic?: number | null;
  difficulty?: string | number | null;
  estimated_approval?: string | null;
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
  const navigate = useNavigate();
  const { request } = useApi();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<QueueFilter>('pending_review');
  const setSharedOpportunity = useCurrentOpportunityStore((s) => s.setOpportunity);
  useCurrentOpportunity(projectId);

  const invalidateDownstream = () => {
    queryClient.invalidateQueries({ queryKey: ['opportunity-queue', projectId] });
    queryClient.invalidateQueries({ queryKey: ['approved-opportunities', projectId] });
    queryClient.invalidateQueries({ queryKey: ['submissions', projectId] });
    queryClient.invalidateQueries({ queryKey: ['content-drafts', projectId] });
    queryClient.invalidateQueries({ queryKey: ['content-library', projectId] });
    queryClient.invalidateQueries({ queryKey: ['campaigns', projectId] });
    queryClient.invalidateQueries({ queryKey: ['pipeline', projectId] });
    queryClient.invalidateQueries({ queryKey: ['backlink-builder', projectId] });
  };

  const toShared = (row: Opportunity): SelectedOpportunity => ({
    id: row.id,
    website: row.title,
    domain: row.domain ?? null,
    title: row.title,
    score: row.score,
    opportunity_type: row.opportunity_type,
    status: 'approved',
    readiness: 'ready',
    pipeline_stage: row.pipeline_stage,
  });

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
        toast.success('Approved — ready to Generate Content');
        const row = (queue.data?.data ?? []).find((o) => o.id === vars.id);
        if (row) setSharedOpportunity(projectId, toShared(row));
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
        toast.success(`Approved ${results.length}`);
        const last = results[results.length - 1];
        if (last) setSharedOpportunity(projectId, toShared(last));
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

  const openWithWorkingSet = (row: Opportunity, dest: 'content' | 'execute') => {
    setSharedOpportunity(projectId, toShared(row));
    navigate(
      dest === 'content'
        ? `/projects/${projectId}/content/library`
        : `/projects/${projectId}/backlink-builder/execution`
    );
  };

  const items = queue.data?.data ?? [];
  const isPending = filter === 'pending_review';

  return (
    <div className="space-y-6">
      <CurrentOpportunityBanner projectId={projectId} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ListChecks className="h-6 w-6" /> Approve Opportunities
          </h1>
          <p className="text-muted-foreground">
            Approve or reject websites. AI already scored traffic, difficulty, and fit.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => enrich.mutate()}
          disabled={enrich.isPending}
        >
          <Sparkles className="h-3 w-3 mr-1" /> Refresh AI tips
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

      <div className="overflow-x-auto rounded-2xl border border-border/40 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              {isPending ? <th className="px-3 py-2.5 w-10" /> : null}
              <th className="px-3 py-2.5 font-medium">Website</th>
              <th className="px-3 py-2.5 font-medium">Opportunity Type</th>
              <th className="px-3 py-2.5 font-medium">Recommendation</th>
              <th className="px-3 py-2.5 font-medium">Difficulty</th>
              <th className="px-3 py-2.5 font-medium">Approval Chance</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium text-right">Next Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((opp) => (
              <tr key={opp.id} className="border-t border-border/40 hover:bg-muted/20">
                {isPending ? (
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(opp.id)}
                      onChange={() => toggle(opp.id)}
                      aria-label={`Select ${opp.title}`}
                    />
                  </td>
                ) : null}
                <td className="px-3 py-3">
                  <p className="font-medium">{opp.title}</p>
                  {opp.domain ? (
                    <p className="text-xs text-muted-foreground">{opp.domain}</p>
                  ) : null}
                </td>
                <td className="px-3 py-3 capitalize">
                  {opp.opportunity_type.replace(/_/g, ' ')}
                </td>
                <td className="px-3 py-3 text-muted-foreground max-w-[14rem] truncate">
                  {opp.ai_recommendation ?? (opp.score >= 70 ? 'Strong fit' : 'Review carefully')}
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                  {opp.difficulty != null ? String(opp.difficulty) : '—'}
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                  {opp.estimated_approval ?? '7–14 days'}
                </td>
                <td className="px-3 py-3">
                  <Badge className="text-[10px] capitalize">
                    {isPending
                      ? 'Pending'
                      : (opp.pipeline_stage ?? 'approved').replace(/_/g, ' ')}
                  </Badge>
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="flex flex-wrap justify-end gap-1">
                    {isPending ? (
                      <>
                        <Button
                          size="sm"
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
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openWithWorkingSet(opp, 'content')}
                        >
                          Generate
                        </Button>
                        <Button size="sm" onClick={() => openWithWorkingSet(opp, 'execute')}>
                          Submit
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground p-6">
            {isPending ? (
              <>
                No opportunities pending review.{' '}
                <Link className="text-primary underline" to={`/projects/${projectId}/backlink-builder/import`}>
                  Import websites
                </Link>{' '}
                first.
              </>
            ) : (
              'No approved opportunities yet. Approve from the Pending tab.'
            )}
          </p>
        ) : null}
      </div>
    </div>
  );
}
