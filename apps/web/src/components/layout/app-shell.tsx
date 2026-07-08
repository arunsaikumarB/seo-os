import { Outlet } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { MobileNav } from './mobile-nav';
import { CommandPalette } from './command-palette';
import { Breadcrumbs } from './breadcrumbs';
import { useBreadcrumbs } from '@/hooks/use-breadcrumbs';

interface AppShellProps {
  projectId: string;
}

export function AppShell({ projectId }: AppShellProps) {
  const breadcrumbs = useBreadcrumbs(projectId);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar projectId={projectId} className="hidden md:flex" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar projectId={projectId} showProjectSwitcher />
        <div className="border-b px-6 py-2 md:px-6">
          <Breadcrumbs items={breadcrumbs} />
        </div>
        <main className="flex-1 overflow-y-auto p-6 pb-20 md:pb-6">
          <Outlet />
        </main>
      </div>
      <MobileNav projectId={projectId} />
      <CommandPalette projectId={projectId} />
    </div>
  );
}
