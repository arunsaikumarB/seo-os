import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  currentOrgId: string | null;
  currentProjectId: string | null;
  demoMode: boolean;
  tourCompleted: boolean;
  showTour: boolean;
  /** Beginner-friendly guided navigation (default on) */
  learningMode: boolean;
  /** Show all modules in sidebar instead of workflow groups */
  expertMode: boolean;
  /** Per-project completed workflow step ids */
  workflowProgress: Record<string, string[]>;
  helpDrawerOpen: boolean;
  aiCoachOpen: boolean;
  setCurrentOrgId: (id: string | null) => void;
  setCurrentProjectId: (id: string | null) => void;
  setDemoMode: (v: boolean) => void;
  setTourCompleted: (v: boolean) => void;
  setShowTour: (v: boolean) => void;
  setLearningMode: (v: boolean) => void;
  setExpertMode: (v: boolean) => void;
  setHelpDrawerOpen: (v: boolean) => void;
  setAiCoachOpen: (v: boolean) => void;
  markStepComplete: (projectId: string, stepId: string) => void;
  markGlobalStepComplete: (stepId: string) => void;
}

const GLOBAL_KEY = '__global__';

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentOrgId: null,
      currentProjectId: null,
      demoMode: false,
      tourCompleted: false,
      showTour: false,
      learningMode: true,
      expertMode: false,
      workflowProgress: {},
      helpDrawerOpen: false,
      aiCoachOpen: false,
      setCurrentOrgId: (id) => set({ currentOrgId: id }),
      setCurrentProjectId: (id) => set({ currentProjectId: id }),
      setDemoMode: (demoMode) => set({ demoMode }),
      setTourCompleted: (tourCompleted) => set({ tourCompleted }),
      setShowTour: (showTour) => set({ showTour }),
      setLearningMode: (learningMode) => set({ learningMode }),
      setExpertMode: (expertMode) => set({ expertMode }),
      setHelpDrawerOpen: (helpDrawerOpen) => set({ helpDrawerOpen }),
      setAiCoachOpen: (aiCoachOpen) => set({ aiCoachOpen }),
      markStepComplete: (projectId, stepId) => {
        const prev = get().workflowProgress[projectId] ?? [];
        if (prev.includes(stepId)) return;
        set({
          workflowProgress: {
            ...get().workflowProgress,
            [projectId]: [...prev, stepId],
          },
        });
      },
      markGlobalStepComplete: (stepId) => {
        const prev = get().workflowProgress[GLOBAL_KEY] ?? [];
        if (prev.includes(stepId)) return;
        set({
          workflowProgress: {
            ...get().workflowProgress,
            [GLOBAL_KEY]: [...prev, stepId],
          },
        });
      },
    }),
    { name: 'seo-os-app' }
  )
);

export { GLOBAL_KEY as WORKFLOW_GLOBAL_KEY };
