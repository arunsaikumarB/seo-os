import { Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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

export function NotificationsMenu() {
  const { isDemoMode } = useDemoMode();
  const notifications = isDemoMode ? DEMO_NOTIFICATIONS : [];
  const unread = notifications.filter((n) => n.unread).length;

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
          {unread > 0 && <Badge className="text-[10px]">{unread} new</Badge>}
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
              >
                <motion.div
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="w-full"
                >
                  <div className="flex items-center gap-2">
                    {n.unread && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                    <span
                      className={`text-sm ${n.unread ? 'font-medium' : 'text-muted-foreground'}`}
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
