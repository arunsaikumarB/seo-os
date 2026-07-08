import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { Users, Sparkles, Check, X } from 'lucide-react';

export function CompetitorsPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();

  const data = useQuery({
    queryKey: ['competitors', projectId],
    queryFn: () =>
      request<{
        data: {
          validated: Array<Record<string, unknown>>;
          suggestions: Array<Record<string, unknown>>;
        };
      }>(`/v1/projects/${projectId}/intelligence/competitors`),
    enabled: !!projectId,
  });

  const discover = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/intelligence/competitors/discover`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Competitor discovery complete');
      queryClient.invalidateQueries({ queryKey: ['competitors', projectId] });
    },
  });

  const validate = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'validate' | 'reject' }) =>
      request(`/v1/projects/${projectId}/intelligence/competitors/suggestions/${id}/${action}`, {
        method: 'POST',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['competitors', projectId] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Competitor Intelligence</h1>
          <p className="text-muted-foreground">AI-assisted discovery with validation workflow</p>
        </div>
        <Button onClick={() => discover.mutate()} disabled={discover.isPending}>
          <Sparkles className="h-4 w-4 mr-1" /> Discover competitors
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> Pending suggestions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data.data?.data.suggestions ?? [])
              .filter((s) => s.status === 'pending')
              .map((s) => (
                <div key={String(s.id)} className="rounded-md border px-3 py-2 text-sm">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="font-medium">{String(s.domain)}</p>
                      <p className="text-xs text-muted-foreground">{String(s.reason)}</p>
                    </div>
                    <Badge className="text-[10px]">{String(s.confidence_score)}%</Badge>
                  </div>
                  <div className="flex gap-1 mt-2">
                    <Button size="sm" variant="outline" onClick={() => validate.mutate({ id: String(s.id), action: 'validate' })}>
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => validate.mutate({ id: String(s.id), action: 'reject' })}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Validated competitors</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data.data?.data.validated ?? []).map((c) => (
              <div key={String(c.id)} className="rounded-md border px-3 py-2 text-sm flex justify-between">
                <span className="font-medium">{String(c.domain)}</span>
                <Badge className="text-[10px]">{String(c.confidence_score ?? '—')}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
