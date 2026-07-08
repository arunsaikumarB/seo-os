import { motion } from 'framer-motion';
import { Clapperboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDemoMode } from '@/hooks/use-demo-mode';
import { cn } from '@/lib/utils';

export function DemoModeToggle({ className }: { className?: string }) {
  const { isDemoMode, toggleDemoMode } = useDemoMode();

  return (
    <Button
      variant={isDemoMode ? 'default' : 'outline'}
      size="sm"
      onClick={toggleDemoMode}
      className={cn('gap-1.5 text-xs font-medium', className)}
    >
      <motion.span
        animate={isDemoMode ? { rotate: [0, -8, 8, 0] } : {}}
        transition={{ repeat: isDemoMode ? Infinity : 0, duration: 2, repeatDelay: 3 }}
      >
        <Clapperboard className="h-3.5 w-3.5" />
      </motion.span>
      Demo Mode
      {isDemoMode && (
        <Badge className="ml-1 h-4 px-1 text-[9px] bg-primary-foreground/20 text-primary-foreground border-0">
          ON
        </Badge>
      )}
    </Button>
  );
}
