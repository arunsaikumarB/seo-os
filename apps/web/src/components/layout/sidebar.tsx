import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { APP_NAME, APP_TAGLINE } from '@seo-os/shared';
import { projectNav } from '@/config/navigation';
import { workflowNavSections } from '@/config/workflow-navigation';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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

export function Sidebar({ projectId, className }: SidebarProps) {
  const base = `/projects/${projectId}`;
  const location = useLocation();
  const { isEnabled } = useFeatureFlags();
  const expertMode = useAppStore((s) => s.expertMode);

  const visibleNav = projectNav.filter((item) => {
    if (!item.featureFlag) return true;
    return isEnabled(item.featureFlag);
  });

  const isItemVisible = (item: WorkflowNavItem | NavItem) => {
    if (!item.featureFlag) return true;
    return isEnabled(item.featureFlag);
  };

  const visibleSections = useMemo(
    () =>
      workflowNavSections
        .map((section) => ({
          ...section,
          items: section.items.filter(isItemVisible),
        }))
        .filter((section) => section.items.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isEnabled is stable enough via isItemVisible
    [isEnabled]
  );

  const activeSectionId = useMemo(() => {
    const match = visibleSections.find((section) =>
      sectionContainsPath(section.items, base, location.pathname)
    );
    return match?.id ?? visibleSections[0]?.id ?? null;
  }, [visibleSections, base, location.pathname]);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!activeSectionId) return;
    setOpenSections((prev) => {
      if (prev[activeSectionId]) return prev;
      return { ...prev, [activeSectionId]: true };
    });
  }, [activeSectionId]);

  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [id]: !(prev[id] ?? id === activeSectionId),
    }));
  };

  const isSectionOpen = (id: string) => openSections[id] ?? id === activeSectionId;

  return (
    <aside className={cn('flex h-full w-64 flex-col border-r bg-card', className)}>
      <div className="flex h-14 items-center border-b px-4">
        <div>
          <p className="font-semibold tracking-tight">{APP_NAME}</p>
          <p className="text-[10px] text-muted-foreground leading-tight">{APP_TAGLINE}</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        {expertMode ? (
          <div className="space-y-0.5">
            {visibleNav.map((item, i) => {
              if (item.label === 'Prospects' && i > 0) {
                return (
                  <div key={item.label}>
                    <Separator className="my-3" />
                    <NavItemLink item={item} to={`${base}/${item.href}`} />
                  </div>
                );
              }
              if (item.label === 'Technical SEO') {
                return (
                  <div key={item.label}>
                    <Separator className="my-3" />
                    <NavItemLink item={item} to={`${base}/${item.href}`} />
                  </div>
                );
              }
              return <NavItemLink key={item.label} item={item} to={`${base}/${item.href}`} />;
            })}
          </div>
        ) : (
          <div className="space-y-1">
            {visibleSections.map((section) => {
              const open = isSectionOpen(section.id);
              const isActiveSection = section.id === activeSectionId;

              return (
                <div key={section.id} className="rounded-md">
                  <button
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    aria-expanded={open}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                      isActiveSection
                        ? 'bg-accent/60 text-foreground font-medium'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    <span className="text-sm leading-none">{section.emoji}</span>
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
                      <div className="mt-0.5 space-y-0.5 border-l border-border/60 ml-3 pl-2 pb-1">
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
        )}
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
  return (
    <NavLink
      to={to}
      end={!to.includes('backlink-builder/') && !to.includes('outreach/')}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
          isActive
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {item.sprint && (
        <Badge className="text-[9px] px-1 py-0 border-muted-foreground/30 text-muted-foreground">
          {item.sprint}
        </Badge>
      )}
      {'badge' in item && item.badge && (
        <Badge className="text-[9px] px-1 py-0 border-primary/30 text-primary">
          {item.badge}
        </Badge>
      )}
    </NavLink>
  );
}
