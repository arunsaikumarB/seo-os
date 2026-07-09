import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface GuidedEmptyStateProps {
  icon: LucideIcon;
  title: string;
  welcome?: string;
  description: string;
  actionLabel: string;
  onAction?: () => void;
  actionHref?: string;
  stepLabel?: string;
  estimatedMinutes?: number;
  difficulty?: string;
}

export function GuidedEmptyState({
  icon: Icon,
  title,
  welcome = 'Welcome!',
  description,
  actionLabel,
  onAction,
  actionHref,
  stepLabel,
  estimatedMinutes,
  difficulty,
}: GuidedEmptyStateProps) {
  const actionButton = actionHref ? (
    <Button asChild>
      <Link to={actionHref}>{actionLabel}</Link>
    </Button>
  ) : (
    <Button onClick={onAction}>{actionLabel}</Button>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center text-center py-12 px-6">
          <motion.div
            className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"
            animate={{ y: [0, -4, 0] }}
            transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
          >
            <Icon className="h-8 w-8 text-primary/80" />
          </motion.div>
          <p className="text-sm text-primary font-medium mb-1">{welcome}</p>
          <h2 className="text-xl font-semibold mb-2">{title}</h2>
          <p className="text-sm text-muted-foreground max-w-md mb-4">{description}</p>
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            {stepLabel && (
              <Badge className="text-xs border-border bg-muted/50">
                {stepLabel}
              </Badge>
            )}
            {estimatedMinutes && (
              <Badge className="text-xs border-border bg-muted/50">
                ~{estimatedMinutes} min
              </Badge>
            )}
            {difficulty && (
              <Badge className="text-xs border-border bg-muted/50">
                {difficulty}
              </Badge>
            )}
          </div>
          {actionButton}
        </CardContent>
      </Card>
    </motion.div>
  );
}
