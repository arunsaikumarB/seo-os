import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = {
  children: ReactNode;
  className?: string;
  /** Optional default open — almost always false per Phase 3.6 */
  defaultOpen?: boolean;
};

/**
 * Layer 3 — collapsed Advanced Tools. State not persisted as open.
 * Expands downward so above-the-fold content does not shift upward.
 */
export function AdvancedTools({ children, className, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn('mt-10 pt-4 border-t border-dashed border-border/50', className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown
          className={cn('h-4 w-4 mr-1 transition-transform', open && 'rotate-180')}
        />
        Advanced Tools
      </Button>
      {open ? <div className="mt-4 space-y-4">{children}</div> : null}
    </div>
  );
}
