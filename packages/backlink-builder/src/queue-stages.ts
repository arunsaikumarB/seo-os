/** V1.1 submission queue stage machine */

export const QUEUE_STAGES = [
  'discovered',
  'qualified',
  'content_ready',
  'awaiting_review',
  'approved',
  'prepared',
  'submitted',
  'pending',
  'accepted',
  'verified',
  'expired',
  'rejected',
] as const;

export type QueueStage = (typeof QUEUE_STAGES)[number];

const ALLOWED: Record<QueueStage, QueueStage[]> = {
  discovered: ['qualified', 'rejected', 'expired'],
  qualified: ['content_ready', 'awaiting_review', 'rejected', 'expired'],
  content_ready: ['awaiting_review', 'prepared', 'rejected'],
  awaiting_review: ['approved', 'content_ready', 'rejected'],
  approved: ['prepared', 'rejected'],
  prepared: ['submitted', 'awaiting_review', 'rejected'],
  submitted: ['pending', 'accepted', 'rejected', 'expired'],
  pending: ['accepted', 'rejected', 'verified', 'expired'],
  accepted: ['verified', 'expired', 'rejected'],
  verified: ['expired'],
  expired: [],
  rejected: ['qualified', 'discovered'],
};

export function canTransitionQueueStage(from: QueueStage, to: QueueStage): boolean {
  if (from === to) return true;
  return (ALLOWED[from] ?? []).includes(to);
}

/** Dual-write mapping to V1.0 tracking_status / automation_status */
export function queueStageToTrackingStatus(stage: QueueStage): string {
  const map: Partial<Record<QueueStage, string>> = {
    prepared: 'ready',
    awaiting_review: 'awaiting_approval',
    submitted: 'submitted',
    pending: 'pending_review',
    accepted: 'accepted',
    rejected: 'rejected',
    verified: 'verified',
    expired: 'failed',
  };
  return map[stage] ?? 'ready';
}

export function queueStageToAutomationStatus(stage: QueueStage): string {
  const map: Partial<Record<QueueStage, string>> = {
    discovered: 'imported',
    qualified: 'qualified',
    content_ready: 'prepared',
    awaiting_review: 'prepared',
    approved: 'approved',
    prepared: 'prepared',
    submitted: 'submitted',
    pending: 'waiting',
    accepted: 'accepted',
    rejected: 'rejected',
    verified: 'verified',
    expired: 'rejected',
  };
  return map[stage] ?? 'imported';
}

export function queueStageLabel(stage: QueueStage): string {
  return stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
