import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Lightbulb } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { PageTransition } from '@/components/demo/page-transition';

export function RecommendationsPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const qc = useQueryClient();

  const recs = useQuery({
    queryKey: ['type-recs', projectId],
    queryFn: () =>
      request<{
        data: Array<{
          recommendation_type?: string;
          type?: string;
          score: number;
          rationale: string;
          metrics_source?: string;
          metricsSource?: string;
        }>;
      }>(`/v1/projects/${projectId}/backlink-builder/recommendations/types`),
    enabled: !!projectId,
  });

  const generate = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/backlink-builder/recommendations/types/generate`, {
        method: 'POST',
      }),
    onSuccess: () => {
      toast.success('Recommendations refreshed');
      qc.invalidateQueries({ queryKey: ['type-recs', projectId] });
    },
  });

  return (
    <PageTransition className="space-y-6">
      <div className="flex justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Lightbulb className="h-6 w-6" /> Backlink Recommendations
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Why each type fits this project — scores are Estimated.
          </p>
        </div>
        <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
          Refresh recommendations
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {(recs.data?.data ?? []).map((r, i) => {
          const type = r.recommendation_type ?? r.type ?? 'type';
          return (
            <Card key={`${type}-${i}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base capitalize flex items-center justify-between gap-2">
                  {type.replace(/_/g, ' ')}
                  <Badge className="text-[10px]">Est. score {r.score}</Badge>
                </CardTitle>
                <CardDescription>{r.metrics_source ?? r.metricsSource ?? 'estimated'}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{r.rationale}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </PageTransition>
  );
}
