/** Epic 3 Browser Intelligence scan pipeline phases */

export const BROWSER_SCAN_PHASES = [
  { id: 'discovering_pages', label: 'Discovering pages', order: 1 },
  { id: 'reading_content', label: 'Reading content', order: 2 },
  { id: 'extracting_metadata', label: 'Extracting metadata', order: 3 },
  { id: 'finding_opportunities', label: 'Finding opportunities', order: 4 },
  { id: 'finding_contact_pages', label: 'Finding contact pages', order: 5 },
  { id: 'building_profile', label: 'Building profile', order: 6 },
  { id: 'generating_ai_summary', label: 'Generating AI summary', order: 7 },
  { id: 'completed', label: 'Completed', order: 8 },
] as const;

export type BrowserScanPhaseId = (typeof BROWSER_SCAN_PHASES)[number]['id'];

export const BROWSER_INTELLIGENCE_AGENT = {
  id: 'browser_intelligence_agent',
  displayName: 'Browser Intelligence Agent',
  role: 'Website analysis, opportunity detection, and recommendations',
  responsibilities: [
    'Visit public pages within configured limits',
    'Build website profiles',
    'Extract structured information',
    'Detect backlink opportunities',
    'Score website quality',
    'Recommend next actions',
  ],
} as const;

export function browserPhaseProgress(phase: string): number {
  const idx = BROWSER_SCAN_PHASES.findIndex((p) => p.id === phase);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / BROWSER_SCAN_PHASES.length) * 100);
}

export const SCAN_LIMITS = {
  maxPages: 50,
  fetchTimeoutMs: 12000,
  politenessDelayMs: 200,
  maxRetries: 2,
  userAgent: 'SEO-OS-BrowserIntelligence/1.0',
} as const;
