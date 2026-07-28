/**
 * Phase extension points — keep Phase 1 fill path stable while
 * future phases plug in domain learning and AI matching.
 */
export type { DomainLearningHook, AiMatchHook } from './types';

/** Phase 2 stub: return null until domain learning ships. */
export const noopDomainLearning = {
  getDomainAliases(_hostname: string) {
    return null;
  },
};

/** Phase 3 stub: AI matcher not yet wired. */
export const noopAiMatch = {
  async suggestRole() {
    return null;
  },
};
