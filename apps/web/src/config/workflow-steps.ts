export interface WorkflowStep {
  id: string;
  number: number;
  emoji: string;
  title: string;
  purpose: string;
  aiTip?: string;
  route: string;
  /** Route is org-level (not under /projects/:id) */
  orgLevel?: boolean;
  estimatedMinutes?: number;
  difficulty?: 'Beginner' | 'Easy' | 'Intermediate';
}

/**
 * Guided backlink pipeline — 7 steps (Approve removed; Submit = Assisted Manual).
 * Browser auto-submit lives under Advanced Tools.
 */
export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: 'create-project',
    number: 1,
    emoji: '①',
    title: 'Create Project',
    purpose: 'Tell AI about your business — name, website, industry, and description.',
    aiTip: 'AI studies your website automatically after you continue.',
    route: 'settings/general',
    estimatedMinutes: 2,
    difficulty: 'Beginner',
  },
  {
    id: 'import-websites',
    number: 2,
    emoji: '②',
    title: 'Import Websites',
    purpose: 'Paste, CSV, Excel, Sheets, or add websites manually. AI validates and deduplicates.',
    aiTip: 'Import first — AI starts reviewing in the background.',
    route: 'backlink-builder/import',
    estimatedMinutes: 5,
    difficulty: 'Easy',
  },
  {
    id: 'ai-review',
    number: 3,
    emoji: '③',
    title: 'AI Review',
    purpose: 'AI groups opportunities by type — approve or reject here. No separate Approve step.',
    aiTip: 'You do not pick the type. AI detects the right workflow.',
    route: 'backlink-builder/classification',
    estimatedMinutes: 5,
    difficulty: 'Easy',
  },
  {
    id: 'generate-content',
    number: 4,
    emoji: '④',
    title: 'Generate Content',
    purpose: 'AI creates articles, listings, forum replies, images, and video metadata.',
    aiTip: 'No manual format picking — AI builds the right package for each site.',
    route: 'content/library',
    estimatedMinutes: 10,
    difficulty: 'Easy',
  },
  {
    id: 'submit-backlinks',
    number: 5,
    emoji: '⑤',
    title: 'Submit Backlinks',
    purpose:
      'Open each prepared package, paste fields, clear login/CAPTCHA yourself, and submit on the site.',
    aiTip: 'Assisted Manual — the app never auto-submits unless you opt in under Advanced.',
    route: 'backlink-builder/assisted-manual',
    estimatedMinutes: 15,
    difficulty: 'Easy',
  },
  {
    id: 'track-results',
    number: 6,
    emoji: '⑥',
    title: 'Track Results',
    purpose: 'See submitted, pending, approved, verified, and estimated impact.',
    route: 'backlink-builder/track-results',
    estimatedMinutes: 5,
    difficulty: 'Beginner',
  },
  {
    id: 'reports-analytics',
    number: 7,
    emoji: '⑦',
    title: 'Reports & Analytics',
    purpose: 'Download executive, campaign, and period reports as Excel, CSV, or PDF.',
    route: 'reports/library',
    estimatedMinutes: 5,
    difficulty: 'Beginner',
  },
];

export const TOTAL_WORKFLOW_STEPS = WORKFLOW_STEPS.length;

/** Older step ids still stored in local progress */
export const WORKFLOW_STEP_ALIASES: Record<string, string[]> = {
  'ai-review': ['ai-discovery', 'approve-opportunities', 'opportunity-review'],
  'generate-content': ['content-studio'],
  'submit-backlinks': ['browser-execution', 'assisted-manual'],
  'track-results': ['verification'],
  'reports-analytics': ['reports'],
};

/** Compact labels for the workflow progress strip */
export const WORKFLOW_PIPELINE_LABELS: Array<{ id: string; label: string }> = [
  { id: 'create-project', label: 'Create' },
  { id: 'import-websites', label: 'Import' },
  { id: 'ai-review', label: 'AI Review' },
  { id: 'generate-content', label: 'Generate' },
  { id: 'submit-backlinks', label: 'Submit' },
  { id: 'track-results', label: 'Results' },
  { id: 'reports-analytics', label: 'Reports' },
];
