export type { DomainLearningHook, AiMatchHook } from './types';
export { createDomainLearningHook } from './learning/api';

/** Prefer createDomainLearningHook() — wired to shared Backlink Agent knowledge. */
export const noopDomainLearning = {
  getDomainAliases(_hostname: string) {
    return null;
  },
  getDomainMappings(_hostname: string) {
    return null;
  },
  rememberMapping() {},
};

export const noopAiMatch = {
  async suggestRole() {
    return null;
  },
};
