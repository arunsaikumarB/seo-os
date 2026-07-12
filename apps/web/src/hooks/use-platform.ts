import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from './use-api';

export type PlatformNotification = {
  id: string;
  title: string;
  body?: string | null;
  category: string;
  href?: string | null;
  read_at?: string | null;
  created_at: string;
};

export type PlatformEvent = {
  id: string;
  event_type: string;
  title: string;
  summary?: string | null;
  severity: string;
  source_module: string;
  created_at: string;
  href?: string;
  payload?: Record<string, unknown>;
};

export function usePlatformNotifications() {
  const { request } = useApi();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['platform-notifications'],
    queryFn: () =>
      request<{ data: { items: PlatformNotification[]; unreadCount: number } }>(
        '/v1/notifications'
      ),
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) =>
      request(`/v1/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-notifications'] }),
  });

  const markAll = useMutation({
    mutationFn: () => request('/v1/notifications/read-all', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-notifications'] }),
  });

  return { query, markRead, markAll };
}

export function usePlatformActivity(workspaceId: string) {
  const { request } = useApi();
  return useQuery({
    queryKey: ['platform-activity', workspaceId],
    queryFn: () =>
      request<{ data: { items: PlatformEvent[] } }>(
        `/v1/projects/${workspaceId}/platform/activity?limit=40`
      ),
    enabled: !!workspaceId,
    refetchInterval: 15_000,
  });
}
