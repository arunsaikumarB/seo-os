import { motion } from 'framer-motion';
import { Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DEMO_TIMELINE } from '@/demo/data';

export function LiveTimeline({ events = DEMO_TIMELINE, title = 'Activity Timeline', limit = 8 }: {
  events?: typeof DEMO_TIMELINE;
  title?: string;
  limit?: number;
}) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" /> {title}
        </CardTitle>
        <CardDescription>Live AI decisions and system events</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {events.slice(0, limit).map((evt, i) => (
          <motion.div
            key={evt.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
          >
            <div className="flex justify-between gap-2">
              <span className="font-medium">{evt.title}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {new Date(evt.created_at).toLocaleTimeString()}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{evt.event_type}</p>
          </motion.div>
        ))}
      </CardContent>
    </Card>
  );
}
