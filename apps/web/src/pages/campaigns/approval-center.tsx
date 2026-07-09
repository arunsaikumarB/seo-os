import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { ShieldCheck } from 'lucide-react';

type Approval = {
  id: string;
  title: string;
  summary?: string;
  approval_type: string;
  status: string;
  created_at: string;
};

export function ApprovalCenterPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();

  const approvals = useQuery({
    queryKey: ['approvals', projectId],
    queryFn: () =>
      request<{ data: Approval[] }>(`/v1/projects/${projectId}/campaigns/approvals?status=pending`),
    enabled: !!projectId,
  });

  const resolve = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      request(`/v1/projects/${projectId}/campaigns/approvals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['approvals', projectId] }),
  });

  const items = approvals.data?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-6 w-6" /> Approval Center
        </h1>
        <p className="text-muted-foreground">
          Centralized approvals for campaigns, email drafts, and content drafts
        </p>
      </div>

      <div className="space-y-2">
        {items.map((a) => (
          <Card key={a.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">{a.title}</CardTitle>
                <Badge className="text-[10px] capitalize">
                  {a.approval_type.replace(/_/g, ' ')}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {a.summary && (
                <p className="text-sm text-muted-foreground line-clamp-2">{a.summary}</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={() => resolve.mutate({ id: a.id, action: 'approve' })}>
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resolve.mutate({ id: a.id, action: 'reject' })}
                >
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">No pending approvals.</p>
        )}
      </div>
    </div>
  );
}
