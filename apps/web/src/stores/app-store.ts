import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  currentOrgId: string | null;
  currentProjectId: string | null;
  demoMode: boolean;
  tourCompleted: boolean;
  showTour: boolean;
  setCurrentOrgId: (id: string | null) => void;
  setCurrentProjectId: (id: string | null) => void;
  setDemoMode: (v: boolean) => void;
  setTourCompleted: (v: boolean) => void;
  setShowTour: (v: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentOrgId: null,
      currentProjectId: null,
      demoMode: false,
      tourCompleted: false,
      showTour: false,
      setCurrentOrgId: (id) => set({ currentOrgId: id }),
      setCurrentProjectId: (id) => set({ currentProjectId: id }),
      setDemoMode: (demoMode) => set({ demoMode }),
      setTourCompleted: (tourCompleted) => set({ tourCompleted }),
      setShowTour: (showTour) => set({ showTour }),
    }),
    { name: 'seo-os-app' }
  )
);
