import { useCallback, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { ArrowLeft } from 'lucide-react';
import {
  OpportunitySelector,
  type SelectedOpportunity,
} from '@/components/opportunities/opportunity-selector';

export function CampaignDetailPage() {
  const { projectId = '', campaignId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();
  const [selectedOpp, setSelectedOpp] = useState<SelectedOpportunity | null>(null);
  const handleSelectOpp = useCallback((opp: SelectedOpportunity | null) => {
    setSelectedOpp(opp);
  }, []);

  const campaign = useQuery({
    queryKey: ['campaign', projectId, campaignId],
    queryFn: () =>
      request<{ data: Record<string, unknown> }>(
        `/v1/projects/${projectId}/campaigns/${campaignId}`
      ),
    enabled: !!projectId && !!campaignId,
  });

  const timeline = useQuery({
    queryKey: ['campaign-timeline', projectId, campaignId],
    queryFn: () =>
      request<{ data: Array<Record<string, unknown>> }>(
        `/v1/projects/${projectId}/campaigns/${campaignId}/timeline`
      ),
    enabled: !!projectId && !!campaignId,
  });

  const updateStatus = useMutation({
    mutationFn: (status: string) =>
      request(`/v1/projects/${projectId}/campaigns/${campaignId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign', projectId, campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaigns', projectId] });
    },
  });

  const attach = useMutation({
    mutationFn: () => {
      if (!selectedOpp) throw new Error('Select an approved website first');
      return request(`/v1/projects/${projectId}/campaigns/${campaignId}/opportunities`, {
        method: 'POST',
        body: JSON.stringify({ opportunityIds: [selectedOpp.id] }),
      });
    },
    onSuccess: () => {
      toast.success(`Attached ${selectedOpp?.website ?? 'website'} to campaign`);
      queryClient.invalidateQueries({ queryKey: ['campaign', projectId, campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaign-timeline', projectId, campaignId] });
      queryClient.invalidateQueries({ queryKey: ['backlink-campaign-associations', projectId] });
      queryClient.invalidateQueries({ queryKey: ['approved-opportunities', projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const c = campaign.data?.data;
  const plan = c?.plan as Record<string, unknown> | undefined;
  const phases =
    (plan?.phases as Array<{ name: string; durationWeeks: number; actions: string[] }>) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/projects/${projectId}/campaigns`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">{String(c?.name ?? 'Campaign')}</h1>
          <p className="text-muted-foreground capitalize">
            {String(c?.campaign_type ?? '').replace(/_/g, ' ')}
          </p>
        </div>
        <Badge className="ml-auto">{String(c?.status ?? 'draft').replace(/_/g, ' ')}</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {c?.status === 'draft' && (
          <Button size="sm" onClick={() => updateStatus.mutate('pending_approval')}>
            Submit for Launch Approval
          </Button>
        )}
        {c?.status === 'active' && (
          <Button size="sm" variant="outline" onClick={() => updateStatus.mutate('paused')}>
            Pause
          </Button>
        )}
        {c?.status === 'paused' && (
          <Button size="sm" onClick={() => updateStatus.mutate('active')}>
            Resume
          </Button>
        )}
        {(c?.status === 'active' || c?.status === 'paused') && (
          <Button size="sm" variant="outline" onClick={() => updateStatus.mutate('completed')}>
            Mark Complete
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Number(c?.progress ?? 0)}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground mt-2">{Number(c?.progress ?? 0)}% complete</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attach approved website</CardTitle>
          <CardDescription>
            Select by website name — opportunity context loads automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <OpportunitySelector
            projectId={projectId}
            selectedId={selectedOpp?.id ?? null}
            onSelect={handleSelectOpp}
            mode="content"
            showTable={false}
          />
          <Button disabled={!selectedOpp || attach.isPending} onClick={() => attach.mutate()}>
            Attach
            {selectedOpp ? ` ${selectedOpp.website}` : ' website'}
          </Button>
        </CardContent>
      </Card>

      {plan && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI Campaign Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>{String(plan.summary ?? '')}</p>
            {phases.map((phase) => (
              <div key={phase.name} className="rounded-md border p-3">
                <p className="font-medium">
                  {phase.name} ({phase.durationWeeks}w)
                </p>
                <ul className="list-disc pl-4 text-muted-foreground mt-1">
                  {phase.actions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaign Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(timeline.data?.data ?? []).map((evt) => (
            <div key={String(evt.id)} className="rounded-md border px-3 py-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-medium">{String(evt.title)}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(String(evt.created_at)).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{String(evt.event_type)}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
