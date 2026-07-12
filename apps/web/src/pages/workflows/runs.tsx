import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Check, X } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageTransition } from '@/components/demo/page-transition';

export function WorkflowRunsPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();

  const runsQuery = useQuery({
    queryKey: ['workflow-runs', projectId],
    queryFn: () =>
      request<{
        data: Array<{
          id: string;
          status: string;
          created_at: string;
          workflows?: { name?: string } | null;
        }>;
      }>(`/v1/projects/${projectId}/workflows/runs`),
    enabled: !!projectId,
  });

  const approvalsQuery = useQuery({
    queryKey: ['workflow-approvals', projectId],
    queryFn: () =>
      request<{
        data: Array<{ id: string; summary: string; created_at: string; run_id: string }>;
      }>(`/v1/projects/${projectId}/workflows/approvals`),
    enabled: !!projectId,
  });

  const decideMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approved' | 'rejected' }) =>
      request(`/v1/projects/${projectId}/workflows/approvals/${id}/decide`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      }),
    onSuccess: () => {
      toast.success('Approval updated');
      queryClient.invalidateQueries({ queryKey: ['workflow-approvals', projectId] });
      queryClient.invalidateQueries({ queryKey: ['workflow-runs', projectId] });
    },
    onError: () => toast.error('Failed to decide approval'),
  });

  const runs = runsQuery.data?.data ?? [];
  const approvals = approvalsQuery.data?.data ?? [];

  return (
    <PageTransition className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/projects/${projectId}/workflows`}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Link>
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-semibold">Workflow Runs & Approvals</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Execution history and human gates for external actions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending approvals</CardTitle>
          <CardDescription>External communications pause here by default</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {approvalsQuery.isLoading ? (
            <Skeleton className="h-16" />
          ) : approvals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending workflow approvals</p>
          ) : (
            approvals.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{a.summary}</p>
                  <p className="text-xs text-muted-foreground">{a.created_at}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => decideMutation.mutate({ id: a.id, decision: 'rejected' })}
                  >
                    <X className="h-3.5 w-3.5 mr-1" /> Reject
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => decideMutation.mutate({ id: a.id, decision: 'approved' })}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" /> Approve
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent runs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {runsQuery.isLoading ? (
            <Skeleton className="h-24" />
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet</p>
          ) : (
            runs.map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{run.workflows?.name ?? 'Workflow'}</p>
                  <p className="text-xs text-muted-foreground">{run.created_at}</p>
                </div>
                <Badge className="capitalize">{run.status.replace(/_/g, ' ')}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </PageTransition>
  );
}
