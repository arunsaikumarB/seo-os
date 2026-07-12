import { Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DEMO_NOTIFICATIONS } from '@/demo/data';
import { useDemoMode } from '@/hooks/use-demo-mode';
import { usePlatformNotifications } from '@/hooks/use-platform';
import { usePlatformRealtime } from '@/hooks/use-platform-realtime';
import { useAuth } from '@/providers/auth-provider';

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationsMenu() {
  const { isDemoMode } = useDemoMode();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { query, markRead, markAll } = usePlatformNotifications();

  usePlatformRealtime({ userId: user?.id, enabled: !isDemoMode });

  const liveItems = query.data?.data?.items ?? [];
  const notifications = isDemoMode
    ? DEMO_NOTIFICATIONS.map((n) => ({
        id: n.id,
        title: n.title,
        href: null as string | null,
        read_at: n.unread ? null : new Date().toISOString(),
        time: n.time,
      }))
    : liveItems.map((n) => ({
        id: n.id,
        title: n.title,
        href: n.href ?? null,
        read_at: n.read_at,
        time: formatRelative(n.created_at),
      }));

  const unread = isDemoMode
    ? DEMO_NOTIFICATIONS.filter((n) => n.unread).length
    : (query.data?.data?.unreadCount ?? notifications.filter((n) => !n.read_at).length);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground"
            >
              {unread}
            </motion.span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          Notifications
          <div className="flex items-center gap-2">
            {unread > 0 && <Badge className="text-[10px]">{unread} new</Badge>}
            {!isDemoMode && unread > 0 && (
              <button
                type="button"
                className="text-[10px] text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.preventDefault();
                  markAll.mutate();
                }}
              >
                Mark all read
              </button>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <AnimatePresence>
          {notifications.length === 0 ? (
            <DropdownMenuItem disabled className="text-muted-foreground">
              No notifications yet
            </DropdownMenuItem>
          ) : (
            notifications.map((n, i) => (
              <DropdownMenuItem
                key={n.id}
                className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer"
                onSelect={() => {
                  if (!isDemoMode && !n.read_at) markRead.mutate(n.id);
                  if (n.href) navigate(n.href);
                }}
              >
                <motion.div
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="w-full"
                >
                  <div className="flex items-center gap-2">
                    {!n.read_at && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    )}
                    <span
                      className={`text-sm ${!n.read_at ? 'font-medium' : 'text-muted-foreground'}`}
                    >
                      {n.title}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground ml-3.5">{n.time}</span>
                </motion.div>
              </DropdownMenuItem>
            ))
          )}
        </AnimatePresence>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
