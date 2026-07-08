import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { Target } from 'lucide-react';

const COLUMNS = [
  'discovered',
  'qualified',
  'approved',
  'outreach_ready',
  'won',
  'lost',
] as const;

const NEXT_STATUS: Partial<Record<(typeof COLUMNS)[number], string>> = {
  discovered: 'qualified',
  qualified: 'approved',
  approved: 'outreach_ready',
  outreach_ready: 'won',
};

export function ProspectPipelinePage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();

  const pipeline = useQuery({
    queryKey: ['prospect-pipeline', projectId],
    queryFn: () =>
      request<{ data: Record<string, Array<Record<string, unknown>>> }>(
        `/v1/projects/${projectId}/intelligence/prospects/pipeline`
      ),
    enabled: !!projectId,
  });

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      request(`/v1/projects/${projectId}/intelligence/prospects/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['prospect-pipeline', projectId] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Target className="h-6 w-6" /> Prospect Pipeline
        </h1>
        <p className="text-muted-foreground">Kanban workflow from discovery to outreach-ready</p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <Card key={col} className="min-w-[220px] shrink-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm capitalize">{col.replace(/_/g, ' ')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(pipeline.data?.data[col] ?? []).map((p) => (
                <div key={String(p.id)} className="rounded-md border p-2 text-xs space-y-1">
                  <p className="font-medium">{String(p.title ?? p.domain)}</p>
                  <p className="text-muted-foreground">{String(p.prospect_type ?? '')}</p>
                  <Badge className="text-[9px]">Score {String(p.score)}</Badge>
                  {NEXT_STATUS[col] && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full mt-1 h-7 text-[10px]"
                      onClick={() => move.mutate({ id: String(p.id), status: NEXT_STATUS[col]! })}
                    >
                      → {NEXT_STATUS[col]!.replace(/_/g, ' ')}
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
