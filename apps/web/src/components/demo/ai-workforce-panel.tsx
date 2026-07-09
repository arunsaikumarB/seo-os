import { motion } from 'framer-motion';
import { Bot } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressBarLabel } from './animated-progress';
import { useLiveWorkforce } from '@/demo/live-simulation';
import { useDemoMode } from '@/hooks/use-demo-mode';

export function AIWorkforcePanel() {
  const { isDemoMode } = useDemoMode();
  const tasks = useLiveWorkforce(isDemoMode);

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <motion.div
            animate={isDemoMode ? { scale: [1, 1.08, 1] } : {}}
            transition={{ repeat: Infinity, duration: 2.5 }}
          >
            <Bot className="h-4 w-4 text-primary" />
          </motion.div>
          <CardTitle className="text-base">Live AI Workforce</CardTitle>
        </div>
        <CardDescription>Agents continuously working on your SEO operations</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {tasks.map((t, i) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className="rounded-lg border bg-card/50 p-3 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{t.agent}</span>
              {t.progress >= 100 && (
                <span className="text-[10px] text-primary font-medium">Complete</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t.task}</p>
            <ProgressBarLabel
              label=""
              value={t.progress}
              showPulse={isDemoMode && t.progress < 100}
            />
          </motion.div>
        ))}
      </CardContent>
    </Card>
  );
}
