import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export function AnimatedProgress({
  value,
  className,
  barClassName,
  showPulse = false,
}: {
  value: number;
  className?: string;
  barClassName?: string;
  showPulse?: boolean;
}) {
  return (
    <div className={cn('h-2 rounded-full bg-muted overflow-hidden', className)}>
      <motion.div
        className={cn('h-full rounded-full bg-primary relative', barClassName)}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={{ type: 'spring', stiffness: 80, damping: 18 }}
      >
        {showPulse && value > 0 && value < 100 && (
          <motion.span
            className="absolute inset-0 bg-white/20"
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          />
        )}
      </motion.div>
    </div>
  );
}

export function ProgressBarLabel({
  label,
  value,
  showPulse = true,
}: {
  label: string;
  value: number;
  showPulse?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground truncate pr-2">{label}</span>
        <span className="font-medium tabular-nums shrink-0">{value}%</span>
      </div>
      <AnimatedProgress value={value} showPulse={showPulse} />
    </div>
  );
}
