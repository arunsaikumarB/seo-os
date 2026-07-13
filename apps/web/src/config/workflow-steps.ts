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

/** Backlink-first guided path for Version 1.0 */
export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: 'create-org',
    number: 1,
    emoji: '🏢',
    title: 'Create Organization',
    purpose: 'Create the company or client workspace that separates users and projects.',
    route: '/onboarding/organization',
    orgLevel: true,
    estimatedMinutes: 2,
    difficulty: 'Beginner',
  },
  {
    id: 'create-project',
    number: 2,
    emoji: '📁',
    title: 'Create Project',
    purpose: 'Create one project per website — your Backlink Builder workspace.',
    aiTip: 'Everything in Backlink Builder is scoped to this project.',
    route: '/onboarding/project',
    orgLevel: true,
    estimatedMinutes: 3,
    difficulty: 'Beginner',
  },
  {
    id: 'import-websites',
    number: 3,
    emoji: '📥',
    title: 'Import Websites',
    purpose: 'Paste a list of target websites. AI analysis and supporting engines start automatically.',
    aiTip: 'Browser Intelligence, Knowledge, Memory, and Relationships run in the background after import.',
    route: 'backlink-builder/import',
    estimatedMinutes: 5,
    difficulty: 'Easy',
  },
  {
    id: 'ai-analysis',
    number: 4,
    emoji: '✨',
    title: 'Run AI Analysis',
    purpose: 'Classify and score imported domains into backlink opportunities.',
    route: 'backlink-builder/automation',
    estimatedMinutes: 5,
    difficulty: 'Easy',
  },
  {
    id: 'review-queue',
    number: 5,
    emoji: '📋',
    title: 'Review Opportunity Queue',
    purpose: 'Approve the strongest opportunities before outreach.',
    route: 'campaigns/queue',
    estimatedMinutes: 10,
    difficulty: 'Easy',
  },
  {
    id: 'campaigns',
    number: 6,
    emoji: '🎯',
    title: 'Plan Campaigns',
    purpose: 'Group approved opportunities into a campaign plan.',
    route: 'campaigns',
    estimatedMinutes: 8,
    difficulty: 'Easy',
  },
  {
    id: 'outreach',
    number: 7,
    emoji: '✉️',
    title: 'Send Outreach',
    purpose: 'Draft and send personalized outreach from the inbox.',
    route: 'outreach/inbox',
    estimatedMinutes: 15,
    difficulty: 'Intermediate',
  },
  {
    id: 'verify-links',
    number: 8,
    emoji: '✅',
    title: 'Verify Links',
    purpose: 'Confirm published backlinks and mark wins.',
    route: 'backlink-builder/pending',
    estimatedMinutes: 10,
    difficulty: 'Easy',
  },
  {
    id: 'reports',
    number: 9,
    emoji: '📊',
    title: 'Share Reports',
    purpose: 'Export a backlink progress report for stakeholders.',
    route: 'reports/library',
    estimatedMinutes: 5,
    difficulty: 'Beginner',
  },
];

export const TOTAL_WORKFLOW_STEPS = WORKFLOW_STEPS.length;