import { cn } from '@/lib/utils';

type Props = {
  /** Full wordmark logo vs robot mark only */
  variant?: 'full' | 'mark';
  className?: string;
  imgClassName?: string;
  alt?: string;
};

/**
 * Backlink Agent brand asset (transparent PNG in /public).
 * Mark is safer in compact/dark chrome; full logo for auth heroes.
 */
export function BrandLogo({
  variant = 'full',
  className,
  imgClassName,
  alt = 'Backlink Agent',
}: Props) {
  const src = variant === 'mark' ? '/backlink-agent-mark.png' : '/backlink-agent-logo.png';
  return (
    <span className={cn('inline-flex items-center justify-center', className)}>
      <img
        src={src}
        alt={alt}
        className={cn(
          'object-contain select-none',
          variant === 'full' ? 'h-12 w-auto max-w-[240px]' : 'h-8 w-8',
          imgClassName
        )}
        draggable={false}
      />
    </span>
  );
}
