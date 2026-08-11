import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { APP_NAME, APP_TAGLINE } from '@seo-os/shared';
import { BrandLogo } from '@/components/brand/brand-logo';
import { workflowNavSections } from '@/config/workflow-navigation';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import { useProjectMediaNeeds } from '@/components/images/image-generation-readiness';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { NavItem } from '@/config/navigation';
import type { WorkflowNavItem } from '@/config/workflow-navigation';

interface SidebarProps {
  projectId: string;
  className?: string;
}

function sectionContainsPath(
  items: WorkflowNavItem[],
  base: string,
  pathname: string
): boolean {
  return items.some((item) => {
    const to = item.absolute ? item.href : `${base}/${item.href}`;
    if (pathname === to) return true;
    if (pathname.startsWith(`${to}/`)) return true;
    return false;
  });
}

const STEP_GLYPH = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'] as const;

export function Sidebar({ projectId, className }: SidebarProps) {
  const base = `/projects/${projectId}`;
  const location = useLocation();
  const { isEnabled } = useFeatureFlags();
  const mediaNeeds = useProjectMediaNeeds(projectId);
  // Until loaded, hide studios (text-only default for manual directory workflow)
  const showImageStudio = mediaNeeds.isSuccess && Boolean(mediaNeeds.data?.data?.images);
  const showVideoStudio = mediaNeeds.isSuccess && Boolean(mediaNeeds.data?.data?.videos);

  const isItemVisible = (item: WorkflowNavItem | NavItem) => {
    if (!item.featureFlag) return true;
    if (!isEnabled(item.featureFlag)) return false;
    if (item.href === 'backlink-builder/image-studio') return showImageStudio;
    if (item.href === 'backlink-builder/video-studio') return showVideoStudio;
    return true;
  };

  const visibleSections = useMemo(
    () =>
      workflowNavSections
        .map((section) => ({
          ...section,
          items: section.items.filter(isItemVisible),
        }))
        .filter((section) => section.items.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isEnabled, showImageStudio, showVideoStudio]
  );

  const advancedActive = useMemo(() => {
    const advanced = visibleSections.find((s) => s.advanced);
    if (!advanced) return false;
    return sectionContainsPath(advanced.items, base, location.pathname);
  }, [visibleSections, base, location.pathname]);

  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (advancedActive) setAdvancedOpen(true);
  }, [advancedActive]);

  return (
    <aside className={cn('flex h-full w-64 flex-col border-r border-border/60 bg-card', className)}>
      <div className="flex h-16 items-center gap-2.5 border-b border-border/60 px-4">
        <BrandLogo
          variant="mark"
          className="rounded-lg bg-white p-1 shadow-sm ring-1 ring-border/40"
          imgClassName="h-9 w-9"
        />
        <div className="min-w-0">
          <p className="font-semibold tracking-tight truncate">{APP_NAME}</p>
          <p className="text-[10px] text-muted-foreground leading-tight truncate">{APP_TAGLINE}</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-3 mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Backlink Builder
        </p>
        <div className="space-y-0.5">
          {visibleSections.map((section) => {
            if (section.flat) {
              return (
                <div key={section.id} className="space-y-0.5">
                  {section.items.map((item) => {
                    const to = item.absolute ? item.href : `${base}/${item.href}`;
                    return (
                      <div key={`${section.id}-${item.label}`}>
                        {item.dividerBefore ? (
                          <div className="my-3 mx-3 border-t border-border/50" />
                        ) : null}
                        <NavItemLink item={item} to={to} />
                      </div>
                    );
                  })}
                </div>
              );
            }

            const open = advancedOpen;
            return (
              <div key={section.id} className="mt-4 pt-3 border-t border-border/50">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((v) => !v)}
                  aria-expanded={open}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                    advancedActive
                      ? 'bg-accent/50 text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                  )}
                >
                  <span className="flex-1 truncate font-medium">{section.label}</span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 transition-transform duration-200',
                      open && 'rotate-180'
                    )}
                  />
                </button>
                <div
                  className={cn(
                    'grid transition-[grid-template-rows] duration-200 ease-out',
                    open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="mt-0.5 space-y-0.5 pl-1 pb-1">
                      {section.items.map((item) => {
                        const to = item.absolute ? item.href : `${base}/${item.href}`;
                        return (
                          <NavItemLink
                            key={`${section.id}-${item.label}`}
                            item={item}
                            to={to}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}

function NavItemLink({
  item,
  to,
}: {
  item: NavItem | WorkflowNavItem;
  to: string;
}) {
  const Icon = item.icon;
  const stepNumber = 'stepNumber' in item ? item.stepNumber : undefined;
  return (
    <NavLink
      to={to}
      end={
        !to.includes('backlink-builder/') &&
        !to.includes('outreach/') &&
        !to.includes('campaigns/') &&
        !to.includes('settings/')
      }
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
          isActive
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
        )
      }
    >
      {stepNumber != null && stepNumber >= 1 && stepNumber <= 9 ? (
        <span className="w-5 shrink-0 text-center text-[13px] tabular-nums opacity-80">
          {STEP_GLYPH[stepNumber - 1]}
        </span>
      ) : (
        <Icon className="h-4 w-4 shrink-0 opacity-70" />
      )}
      <span className="flex-1 truncate">{item.label}</span>
      {'badge' in item && item.badge && (
        <Badge className="text-[9px] px-1 py-0 border-primary/30 text-primary">{item.badge}</Badge>
      )}
    </NavLink>
  );
}
