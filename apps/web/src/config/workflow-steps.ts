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

/** Guided backlink pipeline — primary UX path (V2) */
export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: 'create-project',
    number: 1,
    emoji: '①',
    title: 'Create Project',
    purpose: 'Confirm your website project — domain, industry, and goals.',
    aiTip: 'One project per website keeps results clean.',
    route: 'settings/general',
    estimatedMinutes: 2,
    difficulty: 'Beginner',
  },
  {
    id: 'import-websites',
    number: 2,
    emoji: '②',
    title: 'Import Websites',
    purpose: 'Paste or upload target websites. AI analysis starts automatically.',
    aiTip: 'Import first — discovery and classification run in the background.',
    route: 'backlink-builder/import',
    estimatedMinutes: 5,
    difficulty: 'Easy',
  },
  {
    id: 'ai-discovery',
    number: 3,
    emoji: '③',
    title: 'AI Discovery & Qualification',
    purpose: 'AI classifies each site (directory, guest post, forum, and more) and scores fit.',
    aiTip: 'You do not pick the type — AI detects the correct submission workflow.',
    route: 'backlink-builder/classification',
    estimatedMinutes: 5,
    difficulty: 'Easy',
  },
  {
    id: 'opportunity-review',
    number: 4,
    emoji: '④',
    title: 'Opportunity Review',
    purpose: 'Approve the strongest opportunities before content and execution.',
    route: 'campaigns/queue',
    estimatedMinutes: 10,
    difficulty: 'Easy',
  },
  {
    id: 'content-studio',
    number: 5,
    emoji: '⑤',
    title: 'Content Studio',
    purpose: 'Generate the right submission package for each approved website.',
    aiTip: 'Images and videos are included when the submission type needs them.',
    route: 'content/library',
    estimatedMinutes: 10,
    difficulty: 'Easy',
  },
  {
    id: 'browser-execution',
    number: 6,
    emoji: '⑥',
    title: 'Browser Execution',
    purpose: 'Submit approved packages — AI fills forms and pauses only for human steps.',
    route: 'backlink-builder/execution',
    estimatedMinutes: 15,
    difficulty: 'Easy',
  },
  {
    id: 'verification',
    number: 7,
    emoji: '⑦',
    title: 'Verification',
    purpose: 'Confirm published backlinks and track wins.',
    route: 'backlink-builder/pending',
    estimatedMinutes: 10,
    difficulty: 'Easy',
  },
  {
    id: 'reports',
    number: 8,
    emoji: '⑧',
    title: 'Reports',
    purpose: 'Share executive progress — submitted, verified, and success rate.',
    route: 'reports/library',
    estimatedMinutes: 5,
    difficulty: 'Beginner',
  },
];

export const TOTAL_WORKFLOW_STEPS = WORKFLOW_STEPS.length;

/** Compact labels for the workflow progress strip */
export const WORKFLOW_PIPELINE_LABELS: Array<{ id: string; label: string }> = [
  { id: 'create-project', label: 'Project Created' },
  { id: 'import-websites', label: 'Websites Imported' },
  { id: 'ai-discovery', label: 'AI Analysis' },
  { id: 'opportunity-review', label: 'Opportunities Qualified' },
  { id: 'content-studio', label: 'Content Generation' },
  { id: 'browser-execution', label: 'Browser Execution' },
  { id: 'verification', label: 'Verification' },
  { id: 'reports', label: 'Reports' },
];
