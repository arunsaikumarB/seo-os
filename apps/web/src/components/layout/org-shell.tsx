import { Outlet } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { APP_NAME } from '@seo-os/shared';
import { BrandLogo } from '@/components/brand/brand-logo';
import { orgNav } from '@/config/navigation';
import { Topbar } from './topbar';
import { CommandPalette } from './command-palette';
import { cn } from '@/lib/utils';
import { NavLink } from 'react-router-dom';
import { useStageNotificationDelivery } from '@/hooks/use-stage-notifications';

export function OrgShell() {
  useStageNotificationDelivery();

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar showProjectSwitcher={false} />
      <div className="flex flex-1">
        <aside className="hidden w-56 border-r bg-card md:block">
          <div className="border-b p-4">
            <Link to="/projects" className="flex items-center gap-2.5">
              <BrandLogo
                variant="mark"
                className="rounded-lg bg-white p-1 shadow-sm ring-1 ring-border/40"
                imgClassName="h-8 w-8"
              />
              <span>
                <span className="block font-semibold tracking-tight">{APP_NAME}</span>
                <span className="block text-xs text-muted-foreground">Organization</span>
              </span>
            </Link>
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
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-6 pb-20 md:pb-6">
          <div className="mx-auto w-full min-w-0 max-w-none">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
