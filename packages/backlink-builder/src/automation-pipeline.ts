/** Automation pipeline steps and tracking statuses — Epic 2 */

export const AUTOMATION_PIPELINE_STEPS = [
  { id: 'import', label: 'Import URLs', order: 1 },
  { id: 'validate', label: 'Validate', order: 2 },
  { id: 'analyze', label: 'Analyze Domains', order: 3 },
  { id: 'classify', label: 'AI Classification', order: 4 },
  { id: 'score', label: 'Opportunity Scoring', order: 5 },
  { id: 'generate', label: 'Generate Content', order: 6 },
  { id: 'queue', label: 'Queue for Approval', order: 7 },
  { id: 'assist', label: 'Submission Assistance', order: 8 },
  { id: 'track', label: 'Track Progress', order: 9 },
  { id: 'verify', label: 'Verify Backlinks', order: 10 },
  { id: 'store', label: 'Store Results', order: 11 },
] as const;

export type AutomationStepId = (typeof AUTOMATION_PIPELINE_STEPS)[number]['id'];

export const TRACKING_STATUSES = [
  'imported',
  'analyzed',
  'qualified',
  'approved',
  'prepared',
  'submitted',
  'waiting',
  'accepted',
  'rejected',
  'published',
  'verified',
] as const;

export type TrackingStatus = (typeof TRACKING_STATUSES)[number];

export const VERIFICATION_OUTCOMES = [
  'pending',
  'verified',
  'lost',
  'broken',
  'redirected',
] as const;

export type VerificationOutcome = (typeof VERIFICATION_OUTCOMES)[number];

export const ASSISTED_MODES = [
  'directory',
  'profile',
  'citation',
  'forum',
  'qa',
  'manual',
] as const;

export type AssistedMode = (typeof ASSISTED_MODES)[number];

export function trackingLabel(status: TrackingStatus): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function stepProgress(completedSteps: string[]): number {
  const total = AUTOMATION_PIPELINE_STEPS.length;
  const done = completedSteps.length;
  return Math.min(100, Math.round((done / total) * 100));
}

export function nextAutomationStep(current: AutomationStepId | null): AutomationStepId | null {
  const idx = AUTOMATION_PIPELINE_STEPS.findIndex((s) => s.id === current);
  if (idx < 0) return AUTOMATION_PIPELINE_STEPS[0].id;
  if (idx >= AUTOMATION_PIPELINE_STEPS.length - 1) return null;
  return AUTOMATION_PIPELINE_STEPS[idx + 1].id;
}
