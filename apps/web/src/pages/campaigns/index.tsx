import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useApi } from '@/hooks/use-api';
import { Link2, Plus, Sparkles } from 'lucide-react';

type Campaign = {
  id: string;
  name: string;
  campaign_type: string;
  status: string;
  progress: number;
};

type CampaignType = { id: string; display_name: string };

export function CampaignsPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [campaignType, setCampaignType] = useState('guest_post');
  const [goals, setGoals] = useState('Increase referring domains, Build topical authority');

  const campaigns = useQuery({
    queryKey: ['campaigns', projectId],
    queryFn: () => request<{ data: Campaign[] }>(`/v1/projects/${projectId}/campaigns`),
    enabled: !!projectId,
  });

  const types = useQuery({
    queryKey: ['campaign-types'],
    queryFn: () => request<{ data: CampaignType[] }>(`/v1/projects/${projectId}/campaigns/types`),
    enabled: !!projectId,
  });

  const create = useMutation({
    mutationFn: async () => {
      const planRes = await request<{ data: Record<string, unknown> }>(
        `/v1/projects/${projectId}/campaigns/plan`,
        {
          method: 'POST',
          body: JSON.stringify({
            campaignType,
            goals: goals
              .split(',')
              .map((g) => g.trim())
              .filter(Boolean),
          }),
        }
      );
      return request(`/v1/projects/${projectId}/campaigns`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          campaignType,
          plan: planRes.data,
          goals: goals
            .split(',')
            .map((g, i) => ({ id: String(i), label: g.trim() }))
            .filter((g) => g.label),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', projectId] });
      setName('');
    },
  });

  const statusBadge = (status: string) => {
    const variant =
      status === 'active'
        ? 'border-primary/30 text-primary'
        : status === 'pending_approval'
          ? 'border-amber-500/30 text-amber-600'
          : 'border-muted-foreground/30 text-muted-foreground';
    return <Badge className={variant}>{status.replace(/_/g, ' ')}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Link2 className="h-6 w-6" /> Campaigns
          </h1>
          <p className="text-muted-foreground">
            Turn discovered opportunities into structured campaigns
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${projectId}/campaigns/queue`}>Opportunity Queue</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${projectId}/campaigns/approvals`}>Approval Center</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Create Campaign
          </CardTitle>
          <CardDescription>
            AI planner generates a plan from project goals and SEO intelligence
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Input
            placeholder="Campaign name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={campaignType}
            onChange={(e) => setCampaignType(e.target.value)}
          >
            {(types.data?.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.display_name}
              </option>
            ))}
          </select>
          <Input
            className="sm:col-span-2"
            placeholder="Goals (comma-separated)"
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
          />
          <Button
            className="sm:col-span-2"
            disabled={!name || create.isPending}
            onClick={() => create.mutate()}
          >
            <Plus className="h-4 w-4 mr-1" /> Create with AI Plan
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {(campaigns.data?.data ?? []).map((c) => (
          <Card key={c.id}>
            <CardContent className="pt-4 flex items-center justify-between gap-4">
              <div>
                <Link
                  to={`/projects/${projectId}/campaigns/${c.id}`}
                  className="font-medium hover:underline"
                >
                  {c.name}
                </Link>
                <p className="text-xs text-muted-foreground capitalize">
                  {c.campaign_type.replace(/_/g, ' ')} · {c.progress}% progress
                </p>
              </div>
              {statusBadge(c.status)}
            </CardContent>
          </Card>
        ))}
        {(campaigns.data?.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">
            No campaigns yet. Create one to get started.
          </p>
        )}
      </div>
    </div>
  );
}
