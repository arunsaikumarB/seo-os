import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { BacklinkBuilderHero } from '@/components/backlink-builder/backlink-builder-widget';
import { Users, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Relationship = {
  id: string;
  domain: string;
  contact_name?: string;
  contact_email?: string;
  warmth: string;
  opportunity_count: number;
  won_count: number;
};

export function BacklinkRelationshipsPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();

  const relationships = useQuery({
    queryKey: ['backlink-relationships', projectId],
    queryFn: () =>
      request<{ data: Relationship[] }>(`/v1/projects/${projectId}/backlink-builder/relationships`),
    enabled: !!projectId,
  });

  const warmthColor = (w: string) => {
    if (w === 'hot' || w === 'partner') return 'border-primary/30 text-primary';
    if (w === 'warm') return 'border-amber-500/30 text-amber-600';
    return 'border-muted-foreground/30 text-muted-foreground';
  };

  return (
    <div className="space-y-6">
      <BacklinkBuilderHero
        title="Relationship Overview"
        subtitle="Publisher relationships — track warmth, contacts, and win history per domain."
      />
      <div className="flex justify-end">
        <Button size="sm" variant="outline" asChild>
          <Link to={`/projects/${projectId}/relationships`}>
            Open Relationship Intelligence Hub <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Link>
        </Button>
      </div>
      <div className="grid gap-3">
        {(relationships.data?.data ?? []).map((r) => (
          <Card key={r.id}>
            <CardContent className="pt-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Users className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-medium">{r.domain}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.contact_name ?? 'No contact'} {r.contact_email ? `· ${r.contact_email}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge className={warmthColor(r.warmth)}>{r.warmth}</Badge>
                <span className="text-xs text-muted-foreground">
                  {r.won_count}/{r.opportunity_count} won
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
        {(relationships.data?.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-12">
            Relationships build as you engage publishers.
          </p>
        )}
      </div>
    </div>
  );
}
