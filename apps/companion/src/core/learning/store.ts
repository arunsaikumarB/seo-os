/**
 * Phase 2.3 — learning shapes + in-memory helpers (persistence is Backlink Agent API).
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
