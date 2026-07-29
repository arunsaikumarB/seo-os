import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { MobileNav } from './mobile-nav';
import { CommandPalette } from './command-palette';
import { Breadcrumbs } from './breadcrumbs';
import { useBreadcrumbs } from '@/hooks/use-breadcrumbs';
import { HelpDrawer } from '@/components/workflow/help-drawer';
import { WorkflowProgressHeader } from '@/components/workflow/workflow-progress-header';
import { CampaignAiStatus } from '@/components/workflow/campaign-ai-status';
import { OfflineBanner } from '@/components/beta/offline-banner';
import { useAppStore } from '@/stores/app-store';
import { useAutoInterventionWindows } from '@/hooks/use-auto-intervention-windows';
import { useStageNotificationDelivery } from '@/hooks/use-stage-notifications';

interface AppShellProps {
  projectId: string;
}

/** One progress header with timing. Page owns CTAs — no duplicate next-action / celebration chrome. */
export function AppShell({ projectId }: AppShellProps) {
  const breadcrumbs = useBreadcrumbs(projectId);
  const location = useLocation();
  const setCurrentProjectId = useAppStore((s) => s.setCurrentProjectId);
  const onGeneratePage = location.pathname.includes('/content/library');
  /** Phase 11 — Assisted Manual has no auto-submit queue; never show Submitting status. */
  const onAssistedManual = location.pathname.includes('/assisted-manual');
  const onHome =
    location.pathname.endsWith('/home') ||
    location.pathname.replace(/\/$/, '') === `/projects/${projectId}`;

  useAutoInterventionWindows(projectId);
  useStageNotificationDelivery();

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
        <Topbar projectId={projectId} showProjectSwitcher />
        <div className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-1.5 md:px-6">
          <Breadcrumbs items={breadcrumbs} className="min-w-0 flex-1" />
          <HelpDrawer projectId={projectId} />
        </div>
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-6">
          {!onHome ? <WorkflowProgressHeader projectId={projectId} /> : null}
          {!onGeneratePage && !onAssistedManual && !onHome ? (
            <CampaignAiStatus projectId={projectId} />
          ) : null}
          <Outlet />
        </main>
      </div>
      <MobileNav projectId={projectId} />
      <CommandPalette projectId={projectId} />
    </div>
  );
}
