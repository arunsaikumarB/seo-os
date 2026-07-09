import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Globe, Link2, Mail, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileNavProps {
  projectId?: string;
}

const workflowMobileItems = (projectId: string) => [
  { label: 'Home', href: `/projects/${projectId}/home`, icon: LayoutDashboard },
  { label: 'Analyze', href: `/projects/${projectId}/intelligence/browser`, icon: Globe },
  { label: 'Backlinks', href: `/projects/${projectId}/backlink-builder`, icon: Link2 },
  { label: 'Outreach', href: `/projects/${projectId}/outreach/inbox`, icon: Mail },
  { label: 'Mission', href: `/projects/${projectId}/mission-control`, icon: Target },
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
