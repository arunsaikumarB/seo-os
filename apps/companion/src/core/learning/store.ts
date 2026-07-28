/**
 * Phase 2.3 — learning shapes + in-memory helpers (persistence is SEO OS API).
 */
export type { DomainFieldMapping } from '../types';
export {
  clearLearningCache,
  createDomainLearningHook,
  fetchDomainKnowledge,
  getCachedMappings,
  getLearningAuth,
  onLearningChange,
  setLearningAuth,
  uploadFieldMapping,
} from './api';
