import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import { BacklinkBuilderHero } from '@/components/backlink-builder/backlink-builder-widget';
import { scoreBadgeClass } from '@/components/backlink-builder/types';
import { Link2 } from 'lucide-react';

export function BacklinkCampaignsPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();

  const associations = useQuery({
    queryKey: ['backlink-campaign-associations', projectId],
    queryFn: () =>
      request<{
        data: {
          campaigns: Array<{ id: string; name: string; status: string; progress: number }>;
          associations: Array<{
            id: string;
            title: string;
            domain: string;
            campaign_id: string;
            pipeline_stage: string;
            score: number;
          }>;
        };
      }>(`/v1/projects/${projectId}/backlink-builder/campaigns/associations`),
    enabled: !!projectId,
  });

  const data = associations.data?.data;

  return (
    <div className="space-y-6">
      <BacklinkBuilderHero
        title="Campaign Association"
        subtitle="View which opportunities are attached to active campaigns."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4" /> Campaigns
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.campaigns ?? []).map((c) => (
              <div
                key={c.id}
                className="flex justify-between items-center rounded-md border px-3 py-2 text-sm"
              >
                <Link
                  to={`/projects/${projectId}/campaigns/${c.id}`}
                  className="font-medium hover:underline"
                >
                  {c.name}
                </Link>
                <Badge className="text-[10px] border-muted-foreground/30">{c.progress}%</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Attached Opportunities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.associations ?? []).map((o) => (
              <div
                key={o.id}
                className="flex justify-between items-center rounded-md border px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{o.title}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">
                    {o.pipeline_stage?.replace(/_/g, ' ')}
                  </p>
                </div>
                <Badge className={scoreBadgeClass(o.score)}>{o.score}</Badge>
              </div>
            ))}
            {(data?.associations ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No opportunities attached yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <Button asChild variant="outline">
        <Link to={`/projects/${projectId}/campaigns`}>Open Campaign Manager</Link>
      </Button>
    </div>
  );
}
