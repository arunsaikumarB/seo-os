import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Play, Plus, Workflow, LayoutTemplate, History } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageTransition } from '@/components/demo/page-transition';

type WorkflowRow = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  trigger_type: string;
  template_key?: string | null;
  updated_at: string;
};

export function WorkflowsPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { request } = useApi();
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['workflows', projectId],
    queryFn: () => request<{ data: WorkflowRow[] }>(`/v1/projects/${projectId}/workflows`),
    enabled: !!projectId,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      request<{ data: WorkflowRow }>(`/v1/projects/${projectId}/workflows`, {
        method: 'POST',
        body: JSON.stringify({ name: 'New workflow' }),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['workflows', projectId] });
      navigate(`/projects/${projectId}/workflows/${res.data.id}`);
    },
    onError: () => toast.error('Failed to create workflow'),
    onSettled: () => setCreating(false),
  });

  const runMutation = useMutation({
    mutationFn: (workflowId: string) =>
      request(`/v1/projects/${projectId}/workflows/${workflowId}/run`, {
        method: 'POST',
        body: JSON.stringify({ triggerEvent: { source: 'manual' } }),
      }),
    onSuccess: () => {
      toast.success('Workflow run started');
      queryClient.invalidateQueries({ queryKey: ['workflow-runs', projectId] });
    },
    onError: () => toast.error('Failed to start workflow'),
  });

  const activateMutation = useMutation({
    mutationFn: (workflowId: string) =>
      request(`/v1/projects/${projectId}/workflows/${workflowId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' }),
      }),
    onSuccess: () => {
      toast.success('Workflow activated');
      queryClient.invalidateQueries({ queryKey: ['workflows', projectId] });
    },
  });

  const workflows = data?.data ?? [];

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Workflow className="h-6 w-6" /> Workflow Automation
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Orchestrate Browser Intelligence, Campaigns, Outreach, and more — with human approval.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to={`/projects/${projectId}/workflows/templates`}>
              <LayoutTemplate className="h-4 w-4 mr-1" /> Templates
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/projects/${projectId}/workflows/runs`}>
              <History className="h-4 w-4 mr-1" /> Runs
            </Link>
          </Button>
          <Button
            disabled={creating}
            onClick={() => {
              setCreating(true);
              createMutation.mutate();
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> New workflow
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : workflows.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>No workflows yet</CardTitle>
            <CardDescription>
              Start from a campaign template or build a blank automation graph.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button asChild>
              <Link to={`/projects/${projectId}/workflows/templates`}>Browse templates</Link>
            </Button>
            <Button variant="outline" onClick={() => createMutation.mutate()}>
              Blank workflow
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {workflows.map((wf) => (
            <Card key={wf.id} className="hover:border-primary/30 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">
                      <Link
                        to={`/projects/${projectId}/workflows/${wf.id}`}
                        className="hover:underline"
                      >
                        {wf.name}
                      </Link>
                    </CardTitle>
                    <CardDescription className="line-clamp-2">
                      {wf.description || 'No description'}
                    </CardDescription>
                  </div>
                  <Badge className="capitalize">{wf.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Trigger: {wf.trigger_type.replace(/_/g, ' ')}
                </p>
                <div className="flex gap-2">
                  {wf.status !== 'active' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => activateMutation.mutate(wf.id)}
                    >
                      Activate
                    </Button>
                  )}
                  <Button size="sm" onClick={() => runMutation.mutate(wf.id)}>
                    <Play className="h-3.5 w-3.5 mr-1" /> Run
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageTransition>
  );
}
