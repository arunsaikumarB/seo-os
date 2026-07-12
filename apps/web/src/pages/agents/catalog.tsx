import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bot, Play, History } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/demo/empty-state';
import { useApi } from '@/hooks/use-api';

type AgentDef = {
  agentType: string;
  displayName: string;
  description: string;
  syncMode: string;
  defaultApproval: string;
};

type AgentRun = {
  id: string;
  agent_type: string;
  status: string;
  created_at: string;
  error?: string | null;
};

export function AgentsCatalogPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const queryClient = useQueryClient();

  const agents = useQuery({
    queryKey: ['ai-agents'],
    queryFn: () => request<{ data: AgentDef[] }>('/v1/ai/agents'),
  });

  const runs = useQuery({
    queryKey: ['ai-runs', projectId],
    queryFn: () =>
      request<{ data: AgentRun[] }>(`/v1/projects/${projectId}/ai/runs`),
    enabled: !!projectId,
  });

  const runAgent = useMutation({
    mutationFn: (agentType: string) =>
      request(`/v1/projects/${projectId}/ai/agents/${agentType}/run`, {
        method: 'POST',
        body: JSON.stringify({ async: false, useAI: true }),
      }),
    onSuccess: () => {
      toast.success('Agent run started');
      queryClient.invalidateQueries({ queryKey: ['ai-runs', projectId] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to run agent'),
  });

  const list = agents.data?.data ?? [];
  const recent = runs.data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Bot className="h-6 w-6" /> AI Agents
          </h1>
          <p className="text-muted-foreground">
            Registered workforce agents for this project — run, review, and monitor
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to={`/projects/${projectId}/mission-control`}>Mission Control</Link>
        </Button>
      </div>

      {agents.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No agents registered"
          description="AI agents appear here once the workforce registry is available."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((agent) => (
            <Card key={agent.agentType}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{agent.displayName}</CardTitle>
                  <Badge className="text-[10px] capitalize">{agent.syncMode}</Badge>
                </div>
                <CardDescription>{agent.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                  <span className="font-mono">{agent.agentType}</span>
                  <span>·</span>
                  <span className="capitalize">Approval: {agent.defaultApproval}</span>
                </div>
                <Button
                  size="sm"
                  disabled={runAgent.isPending}
                  onClick={() => runAgent.mutate(agent.agentType)}
                >
                  <Play className="h-3.5 w-3.5 mr-1" /> Run agent
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" /> Recent runs
          </CardTitle>
          <CardDescription>Latest agent executions for this project</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {runs.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agent runs yet. Start one above.</p>
          ) : (
            recent.map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium font-mono text-xs">{run.agent_type}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(run.created_at).toLocaleString()}
                  </p>
                </div>
                <Badge className="capitalize text-[10px]">{run.status}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
