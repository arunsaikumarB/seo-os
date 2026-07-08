import { createContext } from 'react';

export interface DemoModeContextValue {
  isDemoMode: boolean;
  toggleDemoMode: () => void;
  enableDemoMode: () => void;
  tourCompleted: boolean;
  setTourCompleted: (v: boolean) => void;
  restartTour: () => void;
  showTour: boolean;
  setShowTour: (v: boolean) => void;
}

export const DemoModeContext = createContext<DemoModeContextValue | null>(null);
