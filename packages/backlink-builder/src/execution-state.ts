/**
 * Execution State Manager — single source of truth for campaign execution status.
 * All modules (Submit, Track Results, Verification, Reports, Dashboard, Workflow)
 * must map through these public statuses and count helpers.
 */

/** User-facing execution statuses (product vocabulary). */
export const EXECUTION_PUBLIC_STATUSES = [
  'Queued',
  'Running',
  'Submitted',
  'Waiting Human',
  'Failed',
  'Skipped',
  'Deleted',
  'Ignored',
  'Verified',
  'Approved',
  'Rejected',
] as const;

export type ExecutionPublicStatus = (typeof EXECUTION_PUBLIC_STATUSES)[number];

/** Internal DB / worker statuses that count toward campaign progress denominators. */
export const CAMPAIGN_EXCLUDED_STATUSES = new Set([
  'deleted',
  'ignored',
]);

/** Statuses that are terminal for automation (site will not run again unless retried). */
export const TERMINAL_PUBLIC = new Set<ExecutionPublicStatus>([
  'Submitted',
  'Failed',
  'Skipped',
  'Deleted',
  'Ignored',
  'Verified',
  'Approved',
  'Rejected',
]);

export type ExecutionStateJobInput = {
  id: string;
  status: string;
  site_domain?: string | null;
  opportunity_id?: string | null;
  pause_reason?: string | null;
  disposition?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  metrics?: Record<string, unknown> | null;
};

/**
 * Map raw execution_jobs.status (+ disposition) → public Execution Status.
 * Deleting always yields Deleted — never Failed.
 */
export function toPublicExecutionStatus(
  status: string,
  opts?: { disposition?: string | null }
): ExecutionPublicStatus {
  const s = String(status ?? '');
  const d = String(opts?.disposition ?? '');

  if (s === 'deleted' || d === 'deleted_forever' || d === 'deleted') return 'Deleted';
  if (s === 'ignored' || d === 'ignored' || d === 'globally_ignored') return 'Ignored';
  if (s === 'skipped' || s === 'unsupported' || d === 'skipped') return 'Skipped';
  if (s === 'failed') return 'Failed';
  if (s === 'verified') return 'Verified';
  if (s === 'approved') return 'Approved';
  if (s === 'rejected') return 'Rejected';
  if (
    s === 'submitted' ||
    s === 'completed' ||
    s === 'waiting_verification'
  ) {
    return 'Submitted';
  }
  if (
    s.startsWith('watching') ||
    s.startsWith('blocked_') ||
    s === 'needs_approval' ||
    s === 'paused' ||
    s === 'awaiting_user' ||
    s === 'ready_for_review' ||
    s === 'ready_to_continue'
  ) {
    return 'Waiting Human';
  }
  if (
    s === 'queued' ||
    s === 'retry_scheduled' ||
    s === 'waiting_infrastructure'
  ) {
    return 'Queued';
  }
  if (s === 'cancelled') {
    // Legacy cancel without delete disposition → Skipped (not Failed)
    return d === 'deleted_forever' ? 'Deleted' : 'Skipped';
  }
  // Active automation
  if (
    [
      'preparing',
      'launching_browser',
      'authenticating',
      'navigating',
      'analyzing_form',
      'uploading_assets',
      'filling_fields',
      'validating',
      'submitting',
    ].includes(s)
  ) {
    return 'Running';
  }
  return 'Queued';
}

export type ExecutionStateCounts = Record<ExecutionPublicStatus, number> & {
  /** Sites still in the campaign (excludes Deleted + Ignored). */
  campaignTotal: number;
  /** Terminal among campaignTotal (progress numerator basis). */
  campaignResolved: number;
  /** Still automating or waiting human within campaign. */
  campaignOpen: number;
  progressPercent: number;
  executionComplete: boolean;
};

export function emptyExecutionCounts(): ExecutionStateCounts {
  const base = Object.fromEntries(
    EXECUTION_PUBLIC_STATUSES.map((k) => [k, 0])
  ) as Record<ExecutionPublicStatus, number>;
  return {
    ...base,
    campaignTotal: 0,
    campaignResolved: 0,
    campaignOpen: 0,
    progressPercent: 0,
    executionComplete: false,
  };
}

/** Compute campaign counts from job rows — only source of truth for progress math. */
export function computeExecutionCounts(
  jobs: ExecutionStateJobInput[]
): ExecutionStateCounts {
  const counts = emptyExecutionCounts();
  for (const job of jobs) {
    const pub = toPublicExecutionStatus(job.status, {
      disposition: job.disposition ?? (job.metrics?.disposition as string | undefined) ?? null,
    });
    counts[pub]++;
  }

  // Progress denominator: never include Deleted / Ignored
  counts.campaignTotal =
    jobs.length - counts.Deleted - counts.Ignored;
  counts.campaignResolved =
    counts.Submitted +
    counts.Failed +
    counts.Skipped +
    counts.Verified +
    counts.Approved +
    counts.Rejected;
  counts.campaignOpen = Math.max(0, counts.campaignTotal - counts.campaignResolved);
  counts.progressPercent =
    counts.campaignTotal > 0
      ? Math.round((counts.campaignResolved / counts.campaignTotal) * 1000) / 10
      : 0;
  // Campaign complete when nothing left automating (Waiting Human is optional — still "open")
  counts.executionComplete =
    counts.campaignTotal > 0 && counts.Running === 0 && counts.Queued === 0;

  return counts;
}

/** Whether a job should appear in Verification (Submitted only). */
export function isVerificationEligible(status: string, disposition?: string | null): boolean {
  const pub = toPublicExecutionStatus(status, { disposition });
  return pub === 'Submitted' || pub === 'Verified' || pub === 'Approved';
}

/** Whether a job should be hidden from all project surfaces after Delete Forever. */
export function isHiddenFromProject(status: string, disposition?: string | null): boolean {
  const pub = toPublicExecutionStatus(status, { disposition });
  return pub === 'Deleted' || pub === 'Ignored';
}

export function publicStatusLabel(status: ExecutionPublicStatus): string {
  return status;
}
