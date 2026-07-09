import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { toast } from 'sonner';
import { BacklinkBuilderHero } from '@/components/backlink-builder/backlink-builder-widget';
import { PipelineBoard } from '@/components/backlink-builder/pipeline-board';
import type { BacklinkOpportunity } from '@/components/backlink-builder/types';

export function BacklinkPipelinePage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();

  const pipeline = useQuery({
    queryKey: ['backlink-pipeline', projectId],
    queryFn: () =>
      request<{ data: Record<string, BacklinkOpportunity[]> }>(
        `/v1/projects/${projectId}/backlink-builder/pipeline`
      ),
    enabled: !!projectId,
    refetchInterval: 20_000,
  });

  const move = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      request(`/v1/projects/${projectId}/backlink-builder/opportunities/${id}/stage`, {
        method: 'PATCH',
        body: JSON.stringify({ stage }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backlink-pipeline', projectId] });
      toast.success('Stage updated');
    },
    onError: () => toast.error('Invalid stage transition'),
  });

  return (
    <div className="space-y-6">
      <BacklinkBuilderHero
        title="Opportunity Pipeline"
        subtitle="Drag opportunities across stages — Discovered through Verified. Bulk actions available in Explorer."
      />
      <PipelineBoard
        projectId={projectId}
        columns={pipeline.data?.data ?? {}}
        onMove={(id, stage) => move.mutate({ id, stage })}
      />
    </div>
  );
}
