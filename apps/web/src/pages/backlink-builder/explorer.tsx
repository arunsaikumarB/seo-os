import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import { toast } from 'sonner';
import { BacklinkBuilderHero } from '@/components/backlink-builder/backlink-builder-widget';
import { OpportunityTable } from '@/components/backlink-builder/opportunity-table';
import { BACKLINK_CATEGORIES, type BacklinkOpportunity } from '@/components/backlink-builder/types';
import { Filter, Sparkles } from 'lucide-react';

export function BacklinkExplorerPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');
  const [minScore, setMinScore] = useState('');
  const [pipelineStage, setPipelineStage] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (type) params.set('type', type);
  if (minScore) params.set('minScore', minScore);
  if (pipelineStage) params.set('pipelineStage', pipelineStage);
  if (search) params.set('search', search);
  params.set('limit', '50');

  const opportunities = useQuery({
    queryKey: ['backlink-explorer', projectId, category, type, minScore, pipelineStage, search],
    queryFn: () =>
      request<{ data: BacklinkOpportunity[] }>(
        `/v1/projects/${projectId}/backlink-builder/opportunities?${params.toString()}`
      ),
    enabled: !!projectId,
  });

  const bulk = useMutation({
    mutationFn: (body: { opportunityIds: string[]; action: string; stage?: string }) =>
      request<{
        data: {
          results: Array<{ id: string; status: string }>;
          errors: Array<{ id: string; message: string }>;
        };
      }>(`/v1/projects/${projectId}/backlink-builder/opportunities/bulk`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (res, vars) => {
      const { results = [], errors = [] } = res.data ?? {};
      if (errors.length) {
        toast.error(
          `${errors.length} failed${results.length ? `, ${results.length} succeeded` : ''}: ${errors[0]?.message ?? 'Unknown error'}`
        );
      } else if (vars.action === 'approve') {
        toast.success(
          `Approved ${results.length} — moved to Submission Queue with linked drafts`
        );
      } else {
        toast.success('Bulk action completed');
      }
      queryClient.invalidateQueries({ queryKey: ['backlink-explorer', projectId] });
      queryClient.invalidateQueries({ queryKey: ['opportunity-queue', projectId] });
      queryClient.invalidateQueries({ queryKey: ['submissions', projectId] });
      setSelected(new Set());
    },
    onError: (err: Error) =>
      toast.error(err.message || 'Bulk action failed — items left in previous state'),
  });

  const approveOne = useCallback(
    (id: string) => {
      bulk.mutate({ opportunityIds: [id], action: 'approve' });
    },
    [bulk]
  );

  const rejectOne = useCallback(
    (id: string) => {
      bulk.mutate({ opportunityIds: [id], action: 'reject' });
    },
    [bulk]
  );

  const data = opportunities.data?.data ?? [];

  return (
    <div className="space-y-6">
      <BacklinkBuilderHero
        title="Opportunity Explorer"
        subtitle="Primary workspace — discover, score, approve, and assign every backlink opportunity."
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setType('');
            }}
          >
            <option value="">All categories</option>
            {BACKLINK_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={pipelineStage}
            onChange={(e) => setPipelineStage(e.target.value)}
          >
            <option value="">All stages</option>
            {[
              'discovered',
              'qualified',
              'approved',
              'campaign_ready',
              'outreach',
              'negotiation',
              'won',
              'lost',
              'verified',
            ].map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Min score"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
          />
          <input
            placeholder="Type filter"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value)}
          />
          {selected.size > 0 && (
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => bulk.mutate({ opportunityIds: [...selected], action: 'approve' })}
              >
                Approve ({selected.size})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => bulk.mutate({ opportunityIds: [...selected], action: 'reject' })}
              >
                Reject
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <OpportunityTable
        projectId={projectId}
        data={data}
        selected={selected}
        onSelect={(id, checked) => {
          const next = new Set(selected);
          if (checked) next.add(id);
          else next.delete(id);
          setSelected(next);
        }}
        onSelectAll={(checked) => setSelected(checked ? new Set(data.map((d) => d.id)) : new Set())}
        onApprove={approveOne}
        onReject={rejectOne}
        search={search}
        onSearchChange={setSearch}
      />

      <Card className="border-primary/10 bg-primary/5">
        <CardContent className="pt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          AI continuously scores opportunities, predicts reply rates, and suggests outreach
          strategy. Use bulk approve for high-score items (75+).
        </CardContent>
      </Card>
    </div>
  );
}
