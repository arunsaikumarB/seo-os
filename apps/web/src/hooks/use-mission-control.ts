import { useQuery } from '@tanstack/react-query';
import { useApi } from './use-api';

export function useMissionControl(projectId: string) {
  const { request } = useApi();

  const agents = useQuery({
    queryKey: ['ai-agents'],
    queryFn: () => request<{ data: unknown[] }>('/v1/ai/agents'),
  });

  const health = useQuery({
    queryKey: ['ai-health', projectId],
    queryFn: () =>
      request<{ data: Record<string, unknown> }>(`/v1/projects/${projectId}/ai/health`),
    enabled: !!projectId,
    refetchInterval: 30_000,
  });

  const runs = useQuery({
    queryKey: ['ai-runs', projectId],
    queryFn: () =>
      request<{ data: Array<Record<string, unknown>> }>(`/v1/projects/${projectId}/ai/runs`),
    enabled: !!projectId,
    refetchInterval: 15_000,
  });

  const events = useQuery({
    queryKey: ['ai-events', projectId],
    queryFn: () =>
      request<{ data: { live: unknown[]; persisted: unknown[] } }>(
        `/v1/projects/${projectId}/ai/events`
      ),
    enabled: !!projectId,
    refetchInterval: 10_000,
  });

  const queue = useQuery({
    queryKey: ['ai-queue', projectId],
    queryFn: () =>
      request<{ data: { enabled: boolean; queues: Array<{ name: string; pending: number }> } }>(
        `/v1/projects/${projectId}/ai/queue`
      ),
    enabled: !!projectId,
    refetchInterval: 20_000,
  });

  const providers = useQuery({
    queryKey: ['ai-providers-health'],
    queryFn: () =>
      request<{ data: { primary: { name: string; status: string }; fallback?: { name: string; status: string } } }>(
        '/v1/ai/providers/health'
      ),
    refetchInterval: 60_000,
  });

  return { agents, health, runs, events, queue, providers };
}
