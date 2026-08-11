import { APP_NAME } from '@seo-os/shared';
import { cn } from '@/lib/utils';

type Props = {
  /** Large icon (+ optional title) vs compact mark */
  variant?: 'full' | 'mark';
  /** Show product name next to / under the icon (full variant) */
  showTitle?: boolean;
  className?: string;
  imgClassName?: string;
  alt?: string;
};

/**
 * Backlink Agent brand mark (transparent PNG in /public).
 */
export function BrandLogo({
  variant = 'full',
  showTitle = variant === 'full',
  className,
  imgClassName,
  alt = APP_NAME,
}: Props) {
  const src = variant === 'mark' ? '/backlink-agent-mark.png' : '/backlink-agent-logo.png';
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center',
        showTitle && variant === 'full' ? 'flex-col gap-2' : '',
        className
      )}
    >
      <img
        src={src}
        alt={alt}
        className={cn(
          'object-contain select-none',
          variant === 'full' ? 'h-20 w-20' : 'h-8 w-8',
          imgClassName
        )}
        draggable={false}
      />
      {showTitle && variant === 'full' ? (
        <span className="text-xl font-semibold tracking-tight text-foreground">{APP_NAME}</span>
      ) : null}
    </span>
  );
}
