import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Upload, ListChecks, Link2, FileBarChart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileNavProps {
  projectId?: string;
}

const workflowMobileItems = (projectId: string) => [
  { label: 'Home', href: `/projects/${projectId}/home`, icon: LayoutDashboard },
  { label: 'Import', href: `/projects/${projectId}/backlink-builder/import`, icon: Upload },
  { label: 'Review', href: `/projects/${projectId}/campaigns/queue`, icon: ListChecks },
  { label: 'Execute', href: `/projects/${projectId}/backlink-builder/execution`, icon: Link2 },
  { label: 'Reports', href: `/projects/${projectId}/reports/library`, icon: FileBarChart },
];

export function MobileNav({ projectId }: MobileNavProps) {
  if (!projectId) return null;
  const items = workflowMobileItems(projectId);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t bg-background/95 backdrop-blur md:hidden">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.label}
            to={item.href}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )
            }
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
