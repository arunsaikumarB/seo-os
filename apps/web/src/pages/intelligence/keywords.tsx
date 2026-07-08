import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { Hash, Sparkles } from 'lucide-react';

export function KeywordsPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();

  const data = useQuery({
    queryKey: ['keywords', projectId],
    queryFn: () =>
      request<{
        data: {
          keywords: Array<Record<string, unknown>>;
          clusters: Array<Record<string, unknown>>;
        };
      }>(`/v1/projects/${projectId}/intelligence/keywords`),
    enabled: !!projectId,
  });

  const discover = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/intelligence/keywords/discover`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Keyword discovery complete');
      queryClient.invalidateQueries({ queryKey: ['keywords', projectId] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Keyword Intelligence</h1>
          <p className="text-muted-foreground">Clustering, intent classification, and priority scoring</p>
        </div>
        <Button onClick={() => discover.mutate()} disabled={discover.isPending}>
          <Sparkles className="h-4 w-4 mr-1" /> Discover keywords
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Hash className="h-4 w-4" /> Topic clusters
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(data.data?.data.clusters ?? []).map((c) => (
            <Badge key={String(c.id)} className="text-xs">
              {String(c.name)} · {String(c.keyword_count)} kw · {String(c.priority_score)}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Keywords</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data.data?.data.keywords ?? []).map((k) => (
            <div key={String(k.id)} className="flex justify-between rounded-md border px-3 py-2 text-sm">
              <span>{String(k.keyword)}</span>
              <div className="flex gap-2">
                <Badge className="text-[10px]">{String(k.search_intent ?? '—')}</Badge>
                <Badge className="text-[10px]">{String(k.priority_score)}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
