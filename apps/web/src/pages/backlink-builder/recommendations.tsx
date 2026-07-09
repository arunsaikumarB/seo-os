import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { BacklinkBuilderHero } from '@/components/backlink-builder/backlink-builder-widget';
import { ProgressBarLabel } from '@/components/demo/animated-progress';
import { Sparkles, Bot } from 'lucide-react';
import type { BacklinkOpportunity } from '@/components/backlink-builder/types';
import { scoreBadgeClass, formatType } from '@/components/backlink-builder/types';
import { Link } from 'react-router-dom';

export function BacklinkRecommendationsPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();

  const suggestions = useQuery({
    queryKey: ['backlink-ai-suggestions', projectId],
    queryFn: () =>
      request<{
        data: {
          recommendedTypes: string[];
          topOpportunities: BacklinkOpportunity[];
          insight: string;
          agents: Array<{ id: string; displayName: string; role: string }>;
        };
      }>(`/v1/projects/${projectId}/backlink-builder/ai/suggestions`),
    enabled: !!projectId,
  });

  const data = suggestions.data?.data;

  return (
    <div className="space-y-6">
      <BacklinkBuilderHero
        title="AI Recommendations"
        subtitle="Strategic guidance from the AI workforce — types, priorities, and success predictions."
      />
      <Card className="border-primary/15">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Strategic Insight
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{data?.insight}</p>
          <div className="flex flex-wrap gap-1 mt-3">
            {(data?.recommendedTypes ?? []).map((t) => (
              <Badge key={t} className="text-[10px] capitalize">
                {formatType(t)}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Opportunities</CardTitle>
            <CardDescription>AI-ranked for immediate action</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.topOpportunities ?? []).map((o) => (
              <Link
                key={o.id}
                to={`/projects/${projectId}/backlink-builder/opportunities/${o.id}`}
                className="flex justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/40 transition-colors"
              >
                <span className="font-medium truncate">{o.title}</span>
                <Badge className={scoreBadgeClass(o.score)}>{o.score}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4" /> AI Workforce
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(data?.agents ?? []).map((a, i) => (
              <div key={a.id}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium">{a.displayName}</span>
                  <span className="text-muted-foreground">{a.role}</span>
                </div>
                <ProgressBarLabel label="" value={55 + ((i * 5) % 40)} showPulse />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
