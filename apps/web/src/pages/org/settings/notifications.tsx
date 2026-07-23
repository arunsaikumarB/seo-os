import { Bell, CheckCheck, Monitor, Mail } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/demo/empty-state';
import { usePlatformNotifications } from '@/hooks/use-platform';
import { useApi } from '@/hooks/use-api';
import { requestDesktopNotificationPermission } from '@/hooks/use-stage-notifications';
import { toast } from 'sonner';

export function OrgNotificationsPage() {
  const { request } = useApi();
  const qc = useQueryClient();
  const { query, markRead, markAll } = usePlatformNotifications();
  const items = query.data?.data.items ?? [];
  const unread = query.data?.data.unreadCount ?? 0;

  const prefs = useQuery({
    queryKey: ['notification-prefs'],
    queryFn: () =>
      request<{
        data: { inApp: boolean; desktop: boolean; emailLongRunning: boolean };
      }>('/v1/notifications/prefs'),
  });

  const savePrefs = useMutation({
    mutationFn: (body: {
      inApp?: boolean;
      desktop?: boolean;
      emailLongRunning?: boolean;
    }) =>
      request('/v1/notifications/prefs', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notification-prefs'] });
      toast.success('Notification preferences saved');
    },
    onError: () => toast.error('Could not save preferences'),
  });

  const p = prefs.data?.data;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Bell className="h-6 w-6" /> Notifications
          </h1>
          <p className="text-muted-foreground">
            Stage finishes (import, review, generation, submit, reports) land here — and as desktop
            alerts when the tab is in the background.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={unread === 0 || markAll.isPending}
          onClick={() => markAll.mutate()}
        >
          <CheckCheck className="h-4 w-4 mr-1" /> Mark all read
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delivery</CardTitle>
          <CardDescription>
            In-app is always available. Desktop needs browser permission once. Email is opt-in for
            long-running finishes only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <Bell className="h-4 w-4" /> In-app bell
            </div>
            <Button
              size="sm"
              variant={p?.inApp === false ? 'outline' : 'secondary'}
              disabled={savePrefs.isPending}
              onClick={() => savePrefs.mutate({ inApp: !(p?.inApp !== false) })}
            >
              {p?.inApp === false ? 'Off' : 'On'}
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <Monitor className="h-4 w-4" /> Desktop notifications
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const perm = await requestDesktopNotificationPermission();
                  if (perm === 'granted') {
                    savePrefs.mutate({ desktop: true });
                    toast.success('Desktop notifications enabled');
                  } else if (perm === 'denied') {
                    toast.error('Permission denied — enable notifications in browser settings');
                  } else if (perm === 'unsupported') {
                    toast.error('This browser does not support desktop notifications');
                  }
                }}
              >
                Allow
              </Button>
              <Button
                size="sm"
                variant={p?.desktop === false ? 'outline' : 'secondary'}
                disabled={savePrefs.isPending}
                onClick={() => savePrefs.mutate({ desktop: !(p?.desktop !== false) })}
              >
                {p?.desktop === false ? 'Off' : 'On'}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4" /> Email on long-running finishes
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Generation and full campaign only. Off by default.
              </p>
            </div>
            <Button
              size="sm"
              variant={p?.emailLongRunning ? 'secondary' : 'outline'}
              disabled={savePrefs.isPending}
              onClick={() => savePrefs.mutate({ emailLongRunning: !p?.emailLongRunning })}
            >
              {p?.emailLongRunning ? 'On' : 'Off'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inbox</CardTitle>
          <CardDescription>
            {unread > 0 ? `${unread} unread` : 'You are caught up'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {query.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="No notifications yet"
              description="Alerts appear when import, AI review, content generation, Assisted Manual prep, auto-submit batches, or reports finish."
            />
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                className={`flex items-start justify-between gap-3 rounded-md border px-3 py-3 ${
                  n.read_at ? 'opacity-70' : 'bg-muted/40'
                }`}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{n.title}</p>
                    {!n.read_at && <Badge className="text-[10px]">New</Badge>}
                    <Badge className="text-[10px] capitalize">{n.category}</Badge>
                  </div>
                  {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>
                {!n.read_at && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={markRead.isPending}
                    onClick={() => markRead.mutate(n.id)}
                  >
                    Mark read
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
