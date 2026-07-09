import { motion } from 'framer-motion';
import { LucideIcon, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  aiCommand,
  onAiCommand,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  aiCommand?: string;
  onAiCommand?: (cmd: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mx-auto max-w-md text-center py-12"
    >
      <motion.div
        className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10"
        animate={{ y: [0, -4, 0] }}
        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
      >
        <Icon className="h-10 w-10 text-primary/70" />
      </motion.div>
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      <p className="text-sm text-muted-foreground mb-6">{description}</p>
      <div className="flex flex-col gap-2 items-center">
        {actionLabel && onAction && <Button onClick={onAction}>{actionLabel}</Button>}
        {aiCommand && onAiCommand && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => onAiCommand(aiCommand)}
          >
            <Sparkles className="h-3 w-3 mr-1" />
            Try: &quot;{aiCommand}&quot;
          </Button>
        )}
      </div>
    </motion.div>
  );
}

export function EmptyStateCard(props: Parameters<typeof EmptyState>[0]) {
  return (
    <Card>
      <CardContent className="pt-6">
        <EmptyState {...props} />
      </CardContent>
    </Card>
  );
}
