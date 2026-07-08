import { NavLink } from 'react-router-dom';
import { mobileNavItems } from '@/config/navigation';
import { cn } from '@/lib/utils';

interface MobileNavProps {
  projectId?: string;
}

export function MobileNav({ projectId }: MobileNavProps) {
  if (!projectId) return null;
  const items = mobileNavItems(projectId);

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
