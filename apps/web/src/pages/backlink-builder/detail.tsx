import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { toast } from 'sonner';
import { BacklinkBuilderNav } from '@/components/backlink-builder/backlink-builder-widget';
import { scoreBadgeClass, formatType } from '@/components/backlink-builder/types';
import { Sparkles, ArrowLeft, Plus } from 'lucide-react';

type OpportunityDetail = {
  id: string;
  title: string;
  score: number;
  opportunity_type: string;
  type_label?: string;
  category?: string;
  domain?: string;
  url?: string;
  queue_status?: string;
  verification_status?: string;
  ai_suggestion?: string;
  ai_recommendation?: string;
  score_tier?: string;
  status?: string;
};

type Campaign = { id: string; name: string };

export function BacklinkOpportunityDetailPage() {
  const { projectId = '', opportunityId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();
  const [campaignId, setCampaignId] = useState('');

  const detail = useQuery({
    queryKey: ['backlink-opportunity', projectId, opportunityId],
    queryFn: () =>
      request<{ data: OpportunityDetail }>(
        `/v1/projects/${projectId}/backlink-builder/opportunities/${opportunityId}`
      ),
    enabled: !!projectId && !!opportunityId,
  });

  const campaigns = useQuery({
    queryKey: ['campaigns', projectId],
    queryFn: () => request<{ data: Campaign[] }>(`/v1/projects/${projectId}/campaigns`),
    enabled: !!projectId,
  });

  const addToCampaign = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/backlink-builder/opportunities/${opportunityId}/add-to-campaign`, {
        method: 'POST',
        body: JSON.stringify({ campaignId }),
      }),
    onSuccess: () => {
      toast.success('Added to campaign');
      queryClient.invalidateQueries({ queryKey: ['backlink-opportunity', projectId, opportunityId] });
    },
    onError: () => toast.error('Failed to add to campaign'),
  });

  const opp = detail.data?.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/projects/${projectId}/backlink-builder/explorer`}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Explorer
          </Link>
        </Button>
        <BacklinkBuilderNav />
      </div>

      {detail.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : opp ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{opp.title}</CardTitle>
                  <CardDescription className="capitalize mt-1">
                    {opp.type_label ?? formatType(opp.opportunity_type)}
                    {opp.domain ? ` · ${opp.domain}` : ''}
                  </CardDescription>
                </div>
                <Badge className={scoreBadgeClass(opp.score)}>Score {opp.score}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs">Category</p>
                  <p className="capitalize">{opp.category?.replace(/_/g, ' ') ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Queue status</p>
                  <p className="capitalize">{opp.queue_status?.replace(/_/g, ' ') ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Verification</p>
                  <p className="capitalize">{opp.verification_status ?? 'pending'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Score tier</p>
                  <p className="capitalize">{opp.score_tier ?? '—'}</p>
                </div>
              </div>
              {opp.url && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">URL</p>
                  <a href={opp.url} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">
                    {opp.url}
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="border-primary/15 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> AI Suggestion
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {opp.ai_suggestion ?? opp.ai_recommendation ?? 'No AI suggestion yet.'}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Add to Campaign</CardTitle>
                <CardDescription>Attach this opportunity to an active campaign</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={campaignId}
                  onChange={(e) => setCampaignId(e.target.value)}
                >
                  <option value="">Select campaign</option>
                  {(campaigns.data?.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <Button
                  className="w-full"
                  disabled={!campaignId || addToCampaign.isPending}
                  onClick={() => addToCampaign.mutate()}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add to Campaign
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground">Opportunity not found.</p>
      )}
    </div>
  );
}
