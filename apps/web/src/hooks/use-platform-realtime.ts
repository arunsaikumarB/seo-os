import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Subscribe to platform_events + notifications via Supabase Realtime.
 * Invalidates Mission Control / activity / notification queries on insert.
 */
export function usePlatformRealtime(opts: {
  workspaceId?: string;
  userId?: string | null;
  enabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const enabled = opts.enabled !== false;

  useEffect(() => {
    if (!enabled || !opts.workspaceId) return;

    const channel = supabase
      .channel(`platform:${opts.workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'platform_events',
          filter: `workspace_id=eq.${opts.workspaceId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['platform-activity', opts.workspaceId] });
          void queryClient.invalidateQueries({
            queryKey: ['mission-control-summary', opts.workspaceId],
          });
          void queryClient.invalidateQueries({ queryKey: ['ai-events', opts.workspaceId] });
          void queryClient.invalidateQueries({ queryKey: ['workflow-summary', opts.workspaceId] });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, opts.workspaceId, queryClient]);

  useEffect(() => {
    if (!enabled || !opts.userId) return;

    const channel = supabase
      .channel(`notifications:${opts.userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${opts.userId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['platform-notifications'] });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, opts.userId, queryClient]);
}
