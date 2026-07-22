/**
 * Execution State Manager — single source of truth for campaign execution status.
 * All modules (Submit, Track Results, Verification, Reports, Dashboard, Workflow)
 * must map through these public statuses and count helpers.
 */

/** User-facing website / job statuses (product vocabulary). */
export const EXECUTION_PUBLIC_STATUSES = [
  'Ready',
  'Starting',
  'Queued',
  'Running',
  'Waiting Human',
  'Submitted',
  'Completed',
  'Verified',
  'Failed',
  'Failed to Start',
  'Skipped',
  'Deleted',
  'Ignored',
  'Approved',
  'Rejected',
] as const;

export type ExecutionPublicStatus = (typeof EXECUTION_PUBLIC_STATUSES)[number];

/** Campaign-level lifecycle (not per-website). */
export const CAMPAIGN_STATES = [
  'Idle',
  'Starting',
  'Running',
  'Waiting Human',
  'Failed To Start',
  'Completed',
  'Paused',
] as const;

export type CampaignState = (typeof CAMPAIGN_STATES)[number];

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
 * Map raw execution_jobs.status (+ disposition) → public status.
 * Delete Forever → Deleted (never Failed).
 * Start API failure → Failed to Start (never Running / never progress).
 */
export function toPublicExecutionStatus(
  status: string,
  opts?: { disposition?: string | null; errorCode?: string | null }
): ExecutionPublicStatus {
  const s = String(status ?? '');
  const d = String(opts?.disposition ?? '');
  const code = String(opts?.errorCode ?? '');

  if (s === 'deleted' || d === 'deleted_forever' || d === 'deleted') return 'Deleted';
  if (s === 'ignored' || d === 'ignored' || d === 'globally_ignored') return 'Ignored';
  if (d === 'failed_to_start' || code === 'FAILED_TO_START') return 'Failed to Start';
  if (s === 'skipped' || s === 'unsupported' || d === 'skipped') return 'Skipped';
  if (s === 'failed') return 'Failed';
  if (s === 'verified') return 'Verified';
  if (s === 'approved') return 'Approved';
  if (s === 'rejected') return 'Rejected';
  if (s === 'submitted' || s === 'completed' || s === 'waiting_verification') {
    return s === 'completed' ? 'Completed' : 'Submitted';
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
  if (s === 'queued' || s === 'retry_scheduled' || s === 'preparing') {
    return 'Queued';
  }
  if (s === 'waiting_infrastructure') {
    // Parked before a live browser session — treat as Failed to Start for campaign UX
    return 'Failed to Start';
  }
  if (s === 'cancelled') {
    return d === 'deleted_forever' ? 'Deleted' : 'Skipped';
  }
  // Phase 4.5: Starting = browser allocated (launch succeeded); Running = Website Opened+
  if (s === 'launching_browser' || s === 'authenticating') {
    return 'Starting';
  }
  if (
    [
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
  return 'Ready';
}

export type ExecutionStateCounts = Record<ExecutionPublicStatus, number> & {
  /** Sites that count toward campaign progress (excludes Deleted / Ignored / Failed to Start). */
  totalExecutable: number;
  /** Alias for totalExecutable — campaign denominator. */
  campaignTotal: number;
  campaignResolved: number;
  campaignOpen: number;
  /**
   * Progress = (Running + Completed/Submitted/Verified + Waiting Human) / Total Executable.
   * Failed To Start campaigns are forced to 0%.
   */
  progressPercent: number;
  executionComplete: boolean;
  campaignState: CampaignState;
  /** True only when ≥1 website is actually Running. */
  campaignIsRunning: boolean;
  aiStatusLine: string;
};

export function emptyExecutionCounts(): ExecutionStateCounts {
  const base = Object.fromEntries(
    EXECUTION_PUBLIC_STATUSES.map((k) => [k, 0])
  ) as Record<ExecutionPublicStatus, number>;
  return {
    ...base,
    totalExecutable: 0,
    campaignTotal: 0,
    campaignResolved: 0,
    campaignOpen: 0,
    progressPercent: 0,
    executionComplete: false,
    campaignState: 'Idle',
    campaignIsRunning: false,
    aiStatusLine: 'Ready to submit',
  };
}

function dispositionOf(job: ExecutionStateJobInput): string | null {
  if (job.disposition != null) return String(job.disposition);
  const m = job.metrics as { disposition?: string } | null;
  return m?.disposition != null ? String(m.disposition) : null;
}

/** Compute campaign counts — ONLY source of truth for progress math. */
export function computeExecutionCounts(
  jobs: ExecutionStateJobInput[]
): ExecutionStateCounts {
  const counts = emptyExecutionCounts();
  for (const job of jobs) {
    const pub = toPublicExecutionStatus(job.status, {
      disposition: dispositionOf(job),
      errorCode: job.error_code ?? null,
    });
    counts[pub]++;
  }

  // Failed to Start / Deleted / Ignored never inflate campaign progress
  counts.totalExecutable =
    jobs.length - counts.Deleted - counts.Ignored - counts['Failed to Start'];
  counts.campaignTotal = counts.totalExecutable;

  const completedLike =
    counts.Submitted + counts.Completed + counts.Verified + counts.Approved;

  counts.campaignResolved =
    completedLike + counts.Failed + counts.Skipped + counts.Rejected;

  counts.campaignOpen = Math.max(
    0,
    counts.totalExecutable - counts.campaignResolved
  );

  counts.campaignIsRunning = counts.Running > 0;

  // Phase 4.5 progress truth: bar advances only on verified-terminal items
  const progressed = completedLike;

  let campaignState: CampaignState = 'Idle';
  if (counts.campaignIsRunning) {
    campaignState = 'Running';
  } else if (counts.Queued > 0 || counts.Starting > 0) {
    campaignState = 'Starting';
  } else if (counts['Waiting Human'] > 0) {
    campaignState = 'Waiting Human';
  } else if (
    counts['Failed to Start'] > 0 &&
    counts.totalExecutable === 0 &&
    completedLike === 0
  ) {
    campaignState = 'Failed To Start';
  } else if (
    counts.totalExecutable > 0 &&
    counts.Running === 0 &&
    counts.Queued === 0 &&
    counts.campaignOpen === 0
  ) {
    campaignState = 'Completed';
  } else if (counts.totalExecutable > 0 && counts.Failed === counts.totalExecutable) {
    campaignState = 'Completed'; // all failed after start — still a finished campaign
  }

  counts.campaignState = campaignState;

  // Campaign cannot report Running progress until at least one site is Running
  // Failed To Start → always 0%
  if (campaignState === 'Failed To Start' || campaignState === 'Idle') {
    counts.progressPercent = 0;
  } else if (counts.totalExecutable > 0) {
    counts.progressPercent =
      Math.round((progressed / counts.totalExecutable) * 1000) / 10;
  } else {
    counts.progressPercent = 0;
  }

  counts.executionComplete =
    campaignState === 'Completed' ||
    (counts.totalExecutable > 0 &&
      counts.Running === 0 &&
      counts.Queued === 0 &&
      counts['Waiting Human'] === 0);

  counts.aiStatusLine = aiStatusForCampaign(counts);
  return counts;
}

export function aiStatusForCampaign(c: ExecutionStateCounts): string {
  switch (c.campaignState) {
    case 'Failed To Start':
      return 'Execution failed before submission began.';
    case 'Starting':
      return 'Starting submissions…';
    case 'Running':
      return 'Submitting backlinks';
    case 'Waiting Human':
      return 'Waiting for you';
    case 'Completed':
      return 'Campaign complete';
    case 'Paused':
      return 'Campaign paused';
    default:
      return 'Ready to submit';
  }
}

/** Whether a job should appear in Verification (Submitted only). */
export function isVerificationEligible(
  status: string,
  disposition?: string | null
): boolean {
  const pub = toPublicExecutionStatus(status, { disposition });
  return (
    pub === 'Submitted' ||
    pub === 'Completed' ||
    pub === 'Verified' ||
    pub === 'Approved'
  );
}

/** Whether a job should be hidden from project surfaces after Delete Forever. */
export function isHiddenFromProject(
  status: string,
  disposition?: string | null
): boolean {
  const pub = toPublicExecutionStatus(status, { disposition });
  return pub === 'Deleted' || pub === 'Ignored';
}

/** Website table badge — Ready when failed to start (retryable). */
export function websiteRowStatus(
  status: string,
  disposition?: string | null
): ExecutionPublicStatus {
  const pub = toPublicExecutionStatus(status, { disposition });
  if (pub === 'Failed to Start') return 'Failed to Start';
  if (pub === 'Queued') return 'Starting';
  return pub;
}

export function publicStatusLabel(status: ExecutionPublicStatus): string {
  return status;
}
