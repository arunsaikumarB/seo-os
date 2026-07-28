/**
 * Phase extension points — Phase 1.1 keeps fill deterministic.
 * Phase 2: domain learning · Phase 3: AI matching (not wired).
 */
export type { DomainLearningHook, AiMatchHook } from './types';

export const noopDomainLearning = {
  getDomainAliases(_hostname: string) {
    return null;
  },
};

export const noopAiMatch = {
  async suggestRole() {
    return null;
  },
};
