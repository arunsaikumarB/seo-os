/**
 * Stage notification delivery on the client:
 * - Desktop Notification API (background tab / other window)
 * - Tab title badge ((n) SEO OS…)
 * - Sonner toast when the user is already on that project
 */
import { useEffect, useRef } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { usePlatformNotifications } from '@/hooks/use-platform';
import { useAuth } from '@/providers/auth-provider';

const BASE_TITLE = 'SEO OS';
const DESKTOP_PERM_KEY = 'seoos.desktopNotifyAsked';

export function requestDesktopNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return Promise.resolve('unsupported');
  }
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Promise.resolve(Notification.permission);
  }
  return Notification.requestPermission();
}

export function ensureDesktopPermissionOnce() {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (localStorage.getItem(DESKTOP_PERM_KEY)) return;
  if (Notification.permission !== 'default') {
    localStorage.setItem(DESKTOP_PERM_KEY, '1');
    return;
  }
  // Ask once after a short delay so it isn't during first paint
  window.setTimeout(() => {
    void requestDesktopNotificationPermission().finally(() => {
      localStorage.setItem(DESKTOP_PERM_KEY, '1');
    });
  }, 2_500);
}

function showDesktopNotification(title: string, body: string, href?: string | null) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, {
      body: body || undefined,
      tag: href ?? title,
    });
    n.onclick = () => {
      window.focus();
      if (href) {
        window.location.assign(href);
      }
      n.close();
    };
  } catch {
    /* ignore */
  }
}

/** Keep document.title prefixed with unread count. */
export function useNotificationTitleBadge() {
  const { query } = usePlatformNotifications();
  const unread = query.data?.data?.unreadCount ?? 0;

  useEffect(() => {
    const prev = document.title;
    document.title = unread > 0 ? `(${unread}) ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = prev.startsWith('(') ? BASE_TITLE : prev;
    };
  }, [unread]);
}

/**
 * Subscribe to new notifications: desktop alert + in-project toast.
 * Mount once in the shell.
 */
export function useStageNotificationDelivery() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { projectId } = useParams();
  const seenIds = useRef(new Set<string>());
  const primed = useRef(false);

  useEffect(() => {
    ensureDesktopPermissionOnce();
  }, []);

  useNotificationTitleBadge();

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`stage-notify:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as {
            id?: string;
            title?: string;
            body?: string | null;
            href?: string | null;
            workspace_id?: string | null;
            created_at?: string;
          };
          const id = String(row.id ?? '');
          if (!id || seenIds.current.has(id)) return;
          seenIds.current.add(id);

          // Skip the initial Realtime handshake flood — only alert after primed
          if (!primed.current) return;

          const title = String(row.title ?? 'SEO OS');
          const body = String(row.body ?? '');
          const href = row.href ?? null;

          void queryClient.invalidateQueries({ queryKey: ['platform-notifications'] });

          showDesktopNotification(title, body, href);

          const ws = row.workspace_id != null ? String(row.workspace_id) : null;
          const onThisProject =
            Boolean(projectId) &&
            (ws === projectId ||
              (href != null && href.includes(`/projects/${projectId}/`)) ||
              location.pathname.includes(`/projects/${projectId}/`));

          if (onThisProject || (!projectId && href)) {
            toast(title, {
              description: body || undefined,
              action: href
                ? {
                    label: 'Open',
                    onClick: () => {
                      window.location.assign(href);
                    },
                  }
                : undefined,
              duration: 8_000,
            });
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Ignore inserts that may have been replayed; start alerting after 1.5s
          window.setTimeout(() => {
            primed.current = true;
          }, 1_500);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, projectId, location.pathname, queryClient]);
}
