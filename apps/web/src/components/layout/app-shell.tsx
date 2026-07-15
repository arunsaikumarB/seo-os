import { Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { MobileNav } from './mobile-nav';
import { CommandPalette } from './command-palette';
import { Breadcrumbs } from './breadcrumbs';
import { useBreadcrumbs } from '@/hooks/use-breadcrumbs';
import { HelpDrawer } from '@/components/workflow/help-drawer';
import { AiCoachPanel } from '@/components/workflow/ai-coach-panel';
import { LearningModeBanner } from '@/components/workflow/learning-mode-banner';
import { NextActionStrip } from '@/components/workflow/next-action-strip';
import { WorkflowContextBar } from '@/components/workflow/workflow-context-bar';
import { GlobalStatusBar } from '@/components/workflow/global-status-bar';
import { OfflineBanner } from '@/components/beta/offline-banner';
import { BetaAnnouncementBar } from '@/components/beta/beta-announcement-bar';
import { useAppStore } from '@/stores/app-store';

interface AppShellProps {
  projectId: string;
}

export function AppShell({ projectId }: AppShellProps) {
  const breadcrumbs = useBreadcrumbs(projectId);
  const setCurrentProjectId = useAppStore((s) => s.setCurrentProjectId);

  useEffect(() => {
    setCurrentProjectId(projectId);
    return () => setCurrentProjectId(null);
  }, [projectId, setCurrentProjectId]);

  return (
    <div className="flex h-screen overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to main content
      </a>
      <Sidebar projectId={projectId} className="hidden md:flex" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <OfflineBanner />
        <BetaAnnouncementBar />
        <Topbar projectId={projectId} showProjectSwitcher />
        <GlobalStatusBar projectId={projectId} />
        <LearningModeBanner projectId={projectId} />
        <div className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-2 md:px-6">
          <Breadcrumbs items={breadcrumbs} className="min-w-0 flex-1" />
          <div className="flex shrink-0 items-center gap-2">
            <HelpDrawer projectId={projectId} />
            <AiCoachPanel />
          </div>
        </div>
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-6">
          <WorkflowContextBar projectId={projectId} />
          <NextActionStrip projectId={projectId} />
          <Outlet />
        </main>
      </div>
      <MobileNav projectId={projectId} />
      <CommandPalette projectId={projectId} />
    </div>
  );
}
