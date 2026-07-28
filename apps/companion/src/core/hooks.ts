export type { DomainLearningHook, AiMatchHook } from './types';
import { learningStore } from './learning/store';

/** Phase 2: no local aliases. Phase 3 can wire learningStore. */
export const noopDomainLearning = {
  getDomainAliases(_hostname: string) {
    return null;
  },
  rememberMapping() {
    void learningStore;
  },
};

export const noopAiMatch = {
  async suggestRole() {
    return null;
  },
};
