import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import { isDemoOrgId } from '@/lib/org-id';
import { DEMO_ORG_ID, DEMO_PROJECT_CHEFGAA } from '@/demo/data';
import { DemoModeContext } from './demo-mode-context';

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const isDemoMode = useAppStore((s) => s.demoMode);
  const tourCompleted = useAppStore((s) => s.tourCompleted);
  const showTour = useAppStore((s) => s.showTour);
  const setDemoMode = useAppStore((s) => s.setDemoMode);
  const setTourCompleted = useAppStore((s) => s.setTourCompleted);
  const setShowTour = useAppStore((s) => s.setShowTour);
  const setCurrentOrgId = useAppStore((s) => s.setCurrentOrgId);
  const setCurrentProjectId = useAppStore((s) => s.setCurrentProjectId);

  // One-time cleanup for persisted demo ids after demo mode was turned off in a prior session.
  useEffect(() => {
    if (isDemoMode) return;
    const { currentOrgId, currentProjectId } = useAppStore.getState();
    if (isDemoOrgId(currentOrgId)) setCurrentOrgId(null);
    if (currentProjectId?.startsWith('demo-')) setCurrentProjectId(null);
  }, [isDemoMode, setCurrentOrgId, setCurrentProjectId]);

  const enableDemoMode = useCallback(() => {
    const wasOff = !useAppStore.getState().demoMode;
    setDemoMode(true);
    setCurrentOrgId(DEMO_ORG_ID);
    setCurrentProjectId(DEMO_PROJECT_CHEFGAA);
    if (wasOff) {
      toast.success('Demo Mode enabled', {
        description:
          'All data is simulated for executive presentations. Start the Product Tour from your profile menu.',
      });
    }
  }, [setDemoMode, setCurrentOrgId, setCurrentProjectId]);

  const toggleDemoMode = useCallback(() => {
    if (isDemoMode) {
      setDemoMode(false);
      // Clear demo-scoped ids so live API calls use a real org from /v1/me
      setCurrentOrgId(null);
      setCurrentProjectId(null);
    } else {
      enableDemoMode();
    }
  }, [isDemoMode, setDemoMode, enableDemoMode, setCurrentOrgId, setCurrentProjectId]);

  const restartTour = useCallback(() => {
    setTourCompleted(false);
    setShowTour(true);
  }, [setTourCompleted, setShowTour]);

  const value = useMemo(
    () => ({
      isDemoMode,
      toggleDemoMode,
      enableDemoMode,
      tourCompleted,
      setTourCompleted,
      restartTour,
      showTour,
      setShowTour,
    }),
    [
      isDemoMode,
      toggleDemoMode,
      enableDemoMode,
      tourCompleted,
      setTourCompleted,
      restartTour,
      showTour,
      setShowTour,
    ]
  );

  return <DemoModeContext.Provider value={value}>{children}</DemoModeContext.Provider>;
}
