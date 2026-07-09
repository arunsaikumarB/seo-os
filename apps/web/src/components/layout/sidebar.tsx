import { NavLink } from 'react-router-dom';
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

export function Sidebar({ projectId, className }: SidebarProps) {
  const base = `/projects/${projectId}`;
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
          <div className="space-y-4">
            {workflowNavSections.map((section) => {
              const items = section.items.filter(isItemVisible);
              if (items.length === 0) return null;
              return (
                <div key={section.id}>
                  <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {section.emoji} {section.label}
                  </p>
                  <div className="space-y-0.5">
                    {items.map((item) => {
                      const to = item.absolute ? item.href : `${base}/${item.href}`;
                      return <NavItemLink key={`${section.id}-${item.label}`} item={item} to={to} />;
                    })}
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
