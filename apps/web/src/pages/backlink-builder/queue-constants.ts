/** Shared with queue UI — mirrors package QUEUE_STAGES */
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
