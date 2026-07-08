import { Outlet } from 'react-router-dom';
import { Topbar } from './topbar';
import { CommandPalette } from './command-palette';
import { MobileNav } from './mobile-nav';

/** Layout for org-level pages (projects list, etc.) */
export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Topbar showProjectSwitcher={false} />
      <main className="flex-1 overflow-y-auto p-6 pb-20 md:pb-6">
        <Outlet />
      </main>
      <MobileNav />
      <CommandPalette />
    </div>
  );
}
