import { Bell, CheckCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/demo/empty-state';
import { usePlatformNotifications } from '@/hooks/use-platform';

export function OrgNotificationsPage() {
  const { query, markRead, markAll } = usePlatformNotifications();
  const items = query.data?.data.items ?? [];
  const unread = query.data?.data.unreadCount ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Bell className="h-6 w-6" /> Notifications
          </h1>
          <p className="text-muted-foreground">
            In-app alerts for workflows, approvals, and system events
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
              description="Alerts appear here when workflows finish, approvals are needed, or system events occur."
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
