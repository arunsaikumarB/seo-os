import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import { toast } from 'sonner';
import { BacklinkBuilderHero } from '@/components/backlink-builder/backlink-builder-widget';
import type { BacklinkRecord } from '@/components/backlink-builder/types';
import { formatType } from '@/components/backlink-builder/types';
import { Clock, CheckCircle } from 'lucide-react';

export function BacklinkPendingPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();

  const pending = useQuery({
    queryKey: ['backlink-pending', projectId],
    queryFn: () =>
      request<{ data: BacklinkRecord[] }>(`/v1/projects/${projectId}/backlink-builder/pending`),
    enabled: !!projectId,
  });

  const verify = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'verified' | 'lost' | 'unreachable' }) =>
      request(`/v1/projects/${projectId}/backlink-builder/backlinks/${id}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      toast.success('Verification updated');
      queryClient.invalidateQueries({ queryKey: ['backlink-pending', projectId] });
      queryClient.invalidateQueries({ queryKey: ['backlink-summary', projectId] });
    },
  });

  return (
    <div className="space-y-6">
      <BacklinkBuilderHero
        title="Pending Verification"
        subtitle="Won links awaiting verification — confirm live status before marking verified."
      />

      <div className="grid gap-3">
        {(pending.data?.data ?? []).map((bl) => (
          <Card key={bl.id}>
            <CardContent className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                  {bl.domain}
                </p>
                <p className="text-xs text-muted-foreground truncate">{bl.source_url}</p>
                <Badge className="text-[10px] capitalize">{formatType(bl.backlink_type)}</Badge>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={verify.isPending}
                  onClick={() => verify.mutate({ id: bl.id, status: 'verified' })}
                >
                  <CheckCircle className="h-3 w-3 mr-1" /> Verify
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={verify.isPending}
                  onClick={() => verify.mutate({ id: bl.id, status: 'lost' })}
                >
                  Mark lost
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {(pending.data?.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No pending verifications.</p>
        )}
      </div>
    </div>
  );
}
