import { useCallback, useMemo, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
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

  const enableDemoMode = useCallback(() => {
    const wasOff = !useAppStore.getState().demoMode;
    setDemoMode(true);
    setCurrentOrgId(DEMO_ORG_ID);
    setCurrentProjectId(DEMO_PROJECT_CHEFGAA);
    if (wasOff) {
      toast.success('Demo Mode enabled', {
        description: 'All data is simulated for executive presentations. Start the Product Tour from your profile menu.',
      });
    }
  }, [setDemoMode, setCurrentOrgId, setCurrentProjectId]);

  const toggleDemoMode = useCallback(() => {
    if (isDemoMode) {
      setDemoMode(false);
    } else {
      enableDemoMode();
    }
  }, [isDemoMode, setDemoMode, enableDemoMode]);

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
    [isDemoMode, toggleDemoMode, enableDemoMode, tourCompleted, setTourCompleted, restartTour, showTour, setShowTour]
  );

  return <DemoModeContext.Provider value={value}>{children}</DemoModeContext.Provider>;
}
