/**
 * Campaign State Manager — single source of truth for website lifecycle.
 * All modules must derive counters from these statuses; never store shadow totals.
 */

export const CAMPAIGN_LIFECYCLE_STATUSES = [
  'Imported',
  'Analyzed',
  'Classified',
  'Approved',
  'Package Generated',
  'Ready',
  'Submitting',
  'Submitted',
  'Verified',
  'Completed',
  'Rejected',
  'Skipped',
  'Deleted',
  'Failed',
  'Ignored',
  'Waiting Human',
  'Retrying',
] as const;

export type CampaignLifecycleStatus = (typeof CAMPAIGN_LIFECYCLE_STATUSES)[number];

export const CAMPAIGN_DETAIL_STATUSES = [
  'pending',
  'generating',
  'generated',
  'failed',
  'n/a',
  'approved',
  'rejected',
] as const;

export type CampaignDetailStatus = (typeof CAMPAIGN_DETAIL_STATUSES)[number];

export const SUBMISSION_STATUSES = [
  'pending',
  'Running',
  'Waiting Human',
  'Completed',
  'Failed',
  'Skipped',
  'Deleted',
  'Retrying',
] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** Allowed transitions — CSM rejects anything else. */
export const CAMPAIGN_LIFECYCLE_TRANSITIONS: Record<
  CampaignLifecycleStatus,
  readonly CampaignLifecycleStatus[]
> = {
  Imported: ['Analyzed', 'Failed', 'Deleted', 'Skipped'],
  Analyzed: ['Classified', 'Failed', 'Deleted', 'Skipped', 'Ignored'],
  Classified: ['Approved', 'Rejected', 'Deleted', 'Skipped', 'Ignored'],
  Approved: ['Package Generated', 'Ready', 'Failed', 'Deleted', 'Skipped'],
  'Package Generated': ['Ready', 'Failed', 'Deleted'],
  Ready: ['Submitting', 'Deleted', 'Skipped'],
  Submitting: ['Submitted', 'Waiting Human', 'Failed', 'Retrying', 'Deleted'],
  'Waiting Human': ['Submitting', 'Submitted', 'Failed', 'Skipped', 'Deleted'],
  Retrying: ['Submitting', 'Failed', 'Deleted'],
  Submitted: ['Verified', 'Failed', 'Deleted'],
  Verified: ['Completed'],
  Failed: ['Retrying', 'Deleted', 'Ignored'],
  Rejected: ['Deleted'],
  Skipped: ['Deleted'],
  Ignored: ['Deleted'],
  Deleted: [],
  Completed: ['Deleted'],
};

const LIFECYCLE_RANK: Record<CampaignLifecycleStatus, number> = {
  Imported: 1,
  Analyzed: 2,
  Classified: 3,
  Approved: 4,
  'Package Generated': 5,
  Ready: 6,
  Submitting: 7,
  'Waiting Human': 7,
  Retrying: 7,
  Submitted: 8,
  Verified: 9,
  Completed: 10,
  Failed: 0,
  Rejected: 0,
  Skipped: 0,
  Deleted: -1,
  Ignored: 0,
};

export function isCampaignLifecycleStatus(v: string): v is CampaignLifecycleStatus {
  return (CAMPAIGN_LIFECYCLE_STATUSES as readonly string[]).includes(v);
}

export function canTransitionCampaignLifecycle(
  from: CampaignLifecycleStatus,
  to: CampaignLifecycleStatus
): boolean {
  if (from === to) return true;
  if (to === 'Deleted' && from !== 'Deleted') return true;
  return (CAMPAIGN_LIFECYCLE_TRANSITIONS[from] ?? []).includes(to);
}

export function campaignLifecycleRank(status: CampaignLifecycleStatus): number {
  return LIFECYCLE_RANK[status] ?? 0;
}

/** Pick furthest main-path state when merging evidence (migration / backfill). */
export function furthestCampaignLifecycle(
  candidates: CampaignLifecycleStatus[]
): CampaignLifecycleStatus {
  if (!candidates.length) return 'Imported';
  let best = candidates[0]!;
  for (const c of candidates) {
    if (c === 'Deleted') return 'Deleted';
    if (campaignLifecycleRank(c) > campaignLifecycleRank(best)) best = c;
  }
  return best;
}

/**
 * Normalize website URL for dedupe (lowercase host, strip www, strip trailing slash).
 * Keeps existing import-engine behavior for protocol defaults.
 */
export function normalizeCampaignWebsiteUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/^["']|["']$/g, '');
  if (!trimmed) return null;
  let url = trimmed;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname || parsed.hostname.includes(' ')) return null;
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    parsed.hash = '';
    parsed.pathname = parsed.pathname.replace(/\/$/, '') || '/';
    const out = parsed.toString().replace(/\/$/, '');
    return out || parsed.origin;
  } catch {
    return null;
  }
}

export type CampaignItemInput = {
  id: string;
  websiteUrl?: string | null;
  domain?: string | null;
  currentStatus: CampaignLifecycleStatus;
  currentStep?: string | null;
  classification?: string | null;
  approval?: 'approved' | 'rejected' | 'pending' | null;
  packageStatus?: CampaignDetailStatus | null;
  imageStatus?: CampaignDetailStatus | null;
  metadataStatus?: CampaignDetailStatus | null;
  videoMetadataStatus?: CampaignDetailStatus | null;
  submissionStatus?: SubmissionStatus | null;
  verificationStatus?: 'pending' | 'verified' | 'failed' | 'n/a' | null;
  lastError?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  /** When true, excluded from user-facing counts (Deleted). */
  hidden?: boolean;
  /** Phase 2 — AI Review */
  confidenceScore?: number | null;
  reviewTier?: ReviewTier | null;
  reviewDecision?: ReviewDecision | null;
  approvedBy?: ApprovedBy | null;
  duplicateOfId?: string | null;
};

export type CampaignCounts = {
  /** All non-Deleted items */
  imported: number;
  analyzed: number;
  classified: number;
  approved: number;
  packageGenerated: number;
  ready: number;
  submitting: number;
  submitted: number;
  verified: number;
  completed: number;
  failed: number;
  waiting: number;
  rejected: number;
  skipped: number;
  deleted: number;
  ignored: number;
  retrying: number;
  /** Breakdown by exact lifecycle status */
  byStatus: Record<CampaignLifecycleStatus, number>;
  /** Total rows including Deleted (audit) */
  totalIncludingDeleted: number;
  /** User-facing total (= imported) */
  total: number;
};

export function emptyCampaignCounts(): CampaignCounts {
  const byStatus = Object.fromEntries(
    CAMPAIGN_LIFECYCLE_STATUSES.map((s) => [s, 0])
  ) as Record<CampaignLifecycleStatus, number>;
  return {
    imported: 0,
    analyzed: 0,
    classified: 0,
    approved: 0,
    packageGenerated: 0,
    ready: 0,
    submitting: 0,
    submitted: 0,
    verified: 0,
    completed: 0,
    failed: 0,
    waiting: 0,
    rejected: 0,
    skipped: 0,
    deleted: 0,
    ignored: 0,
    retrying: 0,
    byStatus,
    totalIncludingDeleted: 0,
    total: 0,
  };
}

const APPROVED_OR_BEYOND: CampaignLifecycleStatus[] = [
  'Approved',
  'Package Generated',
  'Ready',
  'Submitting',
  'Waiting Human',
  'Retrying',
  'Submitted',
  'Verified',
  'Completed',
];

const SUBMITTED_OR_BEYOND: CampaignLifecycleStatus[] = [
  'Submitted',
  'Verified',
  'Completed',
];

const VERIFIED_OR_BEYOND: CampaignLifecycleStatus[] = ['Verified', 'Completed'];

/** Sole selector for campaign counters — every page must use this. */
export function computeCampaignCounts(items: CampaignItemInput[]): CampaignCounts {
  const counts = emptyCampaignCounts();
  counts.totalIncludingDeleted = items.length;

  for (const item of items) {
    const s = item.currentStatus;
    counts.byStatus[s] = (counts.byStatus[s] ?? 0) + 1;
    if (s === 'Deleted') {
      counts.deleted++;
      continue;
    }
    counts.imported++;

    const rank = campaignLifecycleRank(s);
    if (rank >= campaignLifecycleRank('Analyzed')) counts.analyzed++;
    if (rank >= campaignLifecycleRank('Classified')) counts.classified++;
    if (APPROVED_OR_BEYOND.includes(s)) counts.approved++;
    if (
      rank >= campaignLifecycleRank('Package Generated') &&
      APPROVED_OR_BEYOND.includes(s)
    ) {
      counts.packageGenerated++;
    }
    if (s === 'Ready') counts.ready++;
    if (s === 'Submitting') counts.submitting++;
    if (SUBMITTED_OR_BEYOND.includes(s)) counts.submitted++;
    if (VERIFIED_OR_BEYOND.includes(s)) counts.verified++;
    if (s === 'Completed') counts.completed++;
    if (s === 'Failed') counts.failed++;
    if (s === 'Waiting Human') counts.waiting++;
    if (s === 'Rejected') counts.rejected++;
    if (s === 'Skipped') counts.skipped++;
    if (s === 'Ignored') counts.ignored++;
    if (s === 'Retrying') counts.retrying++;
  }

  counts.total = counts.imported;
  return counts;
}

/**
 * Map legacy opportunity / job / pack evidence → lifecycle.
 * Used for backfill and when campaign_lifecycle is null.
 */
export function deriveCampaignLifecycle(evidence: {
  campaignLifecycle?: string | null;
  automationStatus?: string | null;
  queueStatus?: string | null;
  pipelineStage?: string | null;
  opportunityStatus?: string | null;
  hasClassification?: boolean;
  hasAnalysis?: boolean;
  hasImport?: boolean;
  hasContentPack?: boolean;
  contentPackReady?: boolean;
  executionPublicStatus?: string | null;
  verificationStatus?: string | null;
  automationDeleted?: boolean;
}): CampaignLifecycleStatus {
  if (evidence.campaignLifecycle && isCampaignLifecycleStatus(evidence.campaignLifecycle)) {
    return evidence.campaignLifecycle;
  }

  const candidates: CampaignLifecycleStatus[] = [];

  if (
    evidence.automationDeleted ||
    evidence.automationStatus === 'deleted' ||
    evidence.executionPublicStatus === 'Deleted'
  ) {
    return 'Deleted';
  }

  if (evidence.executionPublicStatus === 'Ignored' || evidence.automationStatus === 'ignored') {
    candidates.push('Ignored');
  }
  if (evidence.executionPublicStatus === 'Skipped') candidates.push('Skipped');
  if (evidence.queueStatus === 'rejected' || evidence.automationStatus === 'rejected') {
    candidates.push('Rejected');
  }
  if (
    evidence.executionPublicStatus === 'Failed' ||
    evidence.executionPublicStatus === 'Failed to Start'
  ) {
    candidates.push('Failed');
  }
  if (evidence.executionPublicStatus === 'Waiting Human') {
    candidates.push('Waiting Human');
  }
  if (
    evidence.executionPublicStatus === 'Running' ||
    evidence.executionPublicStatus === 'Starting' ||
    evidence.executionPublicStatus === 'Queued'
  ) {
    candidates.push('Submitting');
  }
  if (evidence.executionPublicStatus === 'Verified' || evidence.verificationStatus === 'verified') {
    candidates.push('Verified');
  }
  if (
    evidence.executionPublicStatus === 'Submitted' ||
    evidence.executionPublicStatus === 'Completed' ||
    evidence.automationStatus === 'submitted' ||
    evidence.automationStatus === 'published' ||
    evidence.automationStatus === 'accepted'
  ) {
    candidates.push('Submitted');
  }
  if (evidence.pipelineStage === 'verified' || evidence.automationStatus === 'verified') {
    candidates.push('Verified');
  }
  if (evidence.contentPackReady) candidates.push('Ready');
  else if (evidence.hasContentPack) candidates.push('Package Generated');

  if (
    evidence.queueStatus === 'approved' ||
    evidence.opportunityStatus === 'approved' ||
    evidence.automationStatus === 'approved' ||
    evidence.pipelineStage === 'campaign_ready' ||
    evidence.pipelineStage === 'outreach'
  ) {
    candidates.push('Approved');
  }

  if (evidence.hasClassification || evidence.automationStatus === 'qualified') {
    candidates.push('Classified');
  }
  if (evidence.hasAnalysis || evidence.automationStatus === 'analyzed') {
    candidates.push('Analyzed');
  }
  if (evidence.hasImport || evidence.automationStatus === 'imported') {
    candidates.push('Imported');
  }

  if (!candidates.length) return 'Imported';
  return furthestCampaignLifecycle(candidates);
}

/** Dual-write map: lifecycle → legacy opportunity columns (compat). */
export function legacyFieldsForLifecycle(status: CampaignLifecycleStatus): {
  automation_status: string;
  queue_status?: string;
  pipeline_stage?: string;
  status?: string;
} {
  switch (status) {
    case 'Imported':
      return { automation_status: 'imported', pipeline_stage: 'discovered', status: 'discovered' };
    case 'Analyzed':
      return { automation_status: 'analyzed', pipeline_stage: 'discovered', status: 'discovered' };
    case 'Classified':
      return {
        automation_status: 'qualified',
        queue_status: 'pending_review',
        pipeline_stage: 'qualified',
        status: 'qualified',
      };
    case 'Approved':
      return {
        automation_status: 'approved',
        queue_status: 'approved',
        pipeline_stage: 'campaign_ready',
        status: 'approved',
      };
    case 'Package Generated':
    case 'Ready':
      return {
        automation_status: 'prepared',
        queue_status: 'approved',
        pipeline_stage: 'campaign_ready',
        status: 'approved',
      };
    case 'Submitting':
    case 'Retrying':
    case 'Waiting Human':
      return {
        automation_status: 'waiting',
        queue_status: 'approved',
        pipeline_stage: 'outreach',
        status: 'in_campaign',
      };
    case 'Submitted':
      return {
        automation_status: 'submitted',
        queue_status: 'approved',
        pipeline_stage: 'won',
        status: 'in_campaign',
      };
    case 'Verified':
    case 'Completed':
      return {
        automation_status: 'verified',
        queue_status: 'approved',
        pipeline_stage: 'verified',
        status: 'in_campaign',
      };
    case 'Rejected':
      return {
        automation_status: 'rejected',
        queue_status: 'rejected',
        pipeline_stage: 'lost',
        status: 'dismissed',
      };
    case 'Skipped':
    case 'Ignored':
      return {
        automation_status: 'rejected',
        queue_status: 'archived',
        pipeline_stage: 'lost',
        status: 'dismissed',
      };
    case 'Failed':
      return {
        automation_status: 'prepared',
        queue_status: 'approved',
        pipeline_stage: 'outreach',
        status: 'in_campaign',
      };
    case 'Deleted':
      return {
        automation_status: 'deleted',
        queue_status: 'archived',
        pipeline_stage: 'lost',
        status: 'dismissed',
      };
    default:
      return { automation_status: 'imported' };
  }
}

export function currentStepForLifecycle(status: CampaignLifecycleStatus): string {
  switch (status) {
    case 'Imported':
      return 'import';
    case 'Analyzed':
      return 'analyze';
    case 'Classified':
      return 'ai-review';
    case 'Approved':
      return 'approve';
    case 'Package Generated':
    case 'Ready':
      return 'generate-content';
    case 'Submitting':
    case 'Waiting Human':
    case 'Retrying':
      return 'submit-backlinks';
    case 'Submitted':
      return 'track-results';
    case 'Verified':
    case 'Completed':
      return 'verification';
    case 'Failed':
      return 'submit-backlinks';
    default:
      return 'import';
  }
}

/* ─── Phase 2: AI Review confidence tiers ─── */

export const REVIEW_TIERS = [
  'auto_approved',
  'recommended',
  'needs_classification',
] as const;
export type ReviewTier = (typeof REVIEW_TIERS)[number];

export const REVIEW_DECISIONS = [
  'Pending',
  'Approved',
  'Rejected',
  'Needs Classification',
  'Unsupported',
  'Duplicate',
  'Dead Website',
] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export type ApprovedBy = 'auto' | 'user' | null;

/**
 * Tier assignment — exact boundaries:
 * > 90 → auto_approved
 * 70–90 inclusive → recommended
 * < 70 → needs_classification
 * unknown type always needs_classification regardless of score
 */
export function assignReviewTier(
  confidenceScore: number,
  classificationId?: string | null
): ReviewTier {
  const unknown =
    !classificationId ||
    classificationId === 'unknown' ||
    classificationId.toLowerCase() === 'unknown';
  if (unknown) return 'needs_classification';
  const score = Number(confidenceScore);
  if (!Number.isFinite(score)) return 'needs_classification';
  if (score > 90) return 'auto_approved';
  if (score >= 70) return 'recommended';
  return 'needs_classification';
}

/** Map review decision → Phase 1 lifecycle status. */
export function lifecycleForReviewDecision(
  decision: ReviewDecision
): CampaignLifecycleStatus | null {
  switch (decision) {
    case 'Approved':
      return 'Approved';
    case 'Rejected':
      return 'Rejected';
    case 'Needs Classification':
      return 'Classified'; // stays pending classification gate
    case 'Unsupported':
      return 'Ignored';
    case 'Duplicate':
      return 'Skipped';
    case 'Dead Website':
      return 'Failed';
    case 'Pending':
      return null;
    default:
      return null;
  }
}

export type AiReviewSummary = {
  imported: number;
  approved: number;
  rejected: number;
  needsClassification: number;
  unsupported: number;
  duplicate: number;
  dead: number;
  pending: number;
  /** true when Imported = sum of all buckets */
  invariantOk: boolean;
};

/** Live AI Review summary — every item in exactly one bucket. */
export function computeAiReviewSummary(items: CampaignItemInput[]): AiReviewSummary {
  const visible = items.filter((i) => i.currentStatus !== 'Deleted');
  const summary: AiReviewSummary = {
    imported: visible.length,
    approved: 0,
    rejected: 0,
    needsClassification: 0,
    unsupported: 0,
    duplicate: 0,
    dead: 0,
    pending: 0,
    invariantOk: true,
  };

  for (const item of visible) {
    const d = item.reviewDecision ?? 'Pending';
    if (d === 'Approved') {
      summary.approved++;
    } else if (d === 'Rejected') {
      summary.rejected++;
    } else if (d === 'Needs Classification') {
      summary.needsClassification++;
    } else if (d === 'Unsupported') {
      summary.unsupported++;
    } else if (d === 'Duplicate') {
      summary.duplicate++;
    } else if (d === 'Dead Website') {
      summary.dead++;
    } else if (
      item.currentStatus === 'Approved' ||
      campaignLifecycleRank(item.currentStatus) > campaignLifecycleRank('Approved')
    ) {
      // Approved (or further) without explicit review_decision — treat as approved
      summary.approved++;
    } else if (item.reviewTier === 'needs_classification') {
      summary.needsClassification++;
    } else if (item.currentStatus === 'Rejected') {
      summary.rejected++;
    } else if (item.currentStatus === 'Ignored') {
      summary.unsupported++;
    } else if (item.currentStatus === 'Skipped') {
      summary.duplicate++;
    } else if (
      item.currentStatus === 'Failed' &&
      String(item.lastError ?? '').toLowerCase().includes('dead')
    ) {
      summary.dead++;
    } else {
      summary.pending++;
    }
  }

  const sum =
    summary.approved +
    summary.rejected +
    summary.needsClassification +
    summary.unsupported +
    summary.duplicate +
    summary.dead +
    summary.pending;
  summary.invariantOk = sum === summary.imported;
  if (!summary.invariantOk) {
    console.error('[CSM] AI Review invariant violated', { summary, sum });
  }
  return summary;
}

/**
 * Decide review outcome right after analysis.
 * Does not mutate — caller writes through updateCampaignItem.
 */
export function decideAfterAnalysis(input: {
  confidenceScore: number;
  classificationId?: string | null;
  deadWebsite?: boolean;
  duplicateOfId?: string | null;
}): {
  confidenceScore: number;
  reviewTier: ReviewTier;
  reviewDecision: ReviewDecision;
  approvedBy: ApprovedBy;
  lifecycle: CampaignLifecycleStatus;
  lastError?: string | null;
  duplicateOfId?: string | null;
} {
  if (input.duplicateOfId) {
    return {
      confidenceScore: input.confidenceScore,
      reviewTier: 'needs_classification',
      reviewDecision: 'Duplicate',
      approvedBy: null,
      lifecycle: 'Skipped',
      duplicateOfId: input.duplicateOfId,
    };
  }
  if (input.deadWebsite) {
    return {
      confidenceScore: input.confidenceScore,
      reviewTier: 'needs_classification',
      reviewDecision: 'Dead Website',
      approvedBy: null,
      lifecycle: 'Failed',
      lastError: 'Dead website — unreachable',
    };
  }
  const tier = assignReviewTier(input.confidenceScore, input.classificationId);
  if (tier === 'auto_approved') {
    return {
      confidenceScore: input.confidenceScore,
      reviewTier: tier,
      reviewDecision: 'Approved',
      approvedBy: 'auto',
      lifecycle: 'Approved',
    };
  }
  if (tier === 'needs_classification') {
    return {
      confidenceScore: input.confidenceScore,
      reviewTier: tier,
      reviewDecision: 'Needs Classification',
      approvedBy: null,
      lifecycle: 'Classified',
    };
  }
  return {
    confidenceScore: input.confidenceScore,
    reviewTier: tier,
    reviewDecision: 'Pending',
    approvedBy: null,
    lifecycle: 'Classified',
  };
}
