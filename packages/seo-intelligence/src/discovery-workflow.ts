import type { ScanPhase } from './website-analyzer.js';

export const DISCOVERY_WORKFLOW = [
  'website_scan',
  'competitor_discovery',
  'keyword_intelligence',
  'opportunity_discovery',
  'prospect_qualification',
] as const;

export type DiscoveryPhase = (typeof DISCOVERY_WORKFLOW)[number];

export interface WorkflowState {
  phase: DiscoveryPhase;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
}

export function mapScanPhaseToProgress(phase: ScanPhase): number {
  const index = [
    'init',
    'sitemap_discovery',
    'page_discovery',
    'metadata_extraction',
    'brand_profile',
    'content_inventory',
    'complete',
  ].indexOf(phase);
  if (index < 0) return 0;
  return Math.round((index / 6) * 100);
}

export function initialWorkflowState(): WorkflowState[] {
  return DISCOVERY_WORKFLOW.map((phase) => ({
    phase,
    status: 'pending',
    progress: 0,
  }));
}
