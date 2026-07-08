import { Outlet } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { APP_NAME } from '@seo-os/shared';
import { orgNav } from '@/config/navigation';
import { Topbar } from './topbar';
import { CommandPalette } from './command-palette';
import { cn } from '@/lib/utils';
import { NavLink } from 'react-router-dom';

export function OrgShell() {
  return (
    <div className="flex min-h-screen flex-col">
      <Topbar showProjectSwitcher={false} />
      <div className="flex flex-1">
        <aside className="hidden w-56 border-r bg-card md:block">
          <div className="border-b p-4">
            <Link to="/projects" className="font-semibold tracking-tight">
              {APP_NAME}
            </Link>
            <p className="text-xs text-muted-foreground">Organization</p>
          </div>
          <nav className="space-y-0.5 p-3">
            {orgNav.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.href}
                  to={item.href}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </aside>
        <main className="flex-1 overflow-y-auto p-6 pb-20 md:pb-6">
          <Outlet />
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
