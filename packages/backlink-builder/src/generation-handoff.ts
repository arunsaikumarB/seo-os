/**
 * Phase 5.5 — Generation → Submission handoff helpers (pure).
 * Conservation law + display labels. No new lifecycle statuses.
 */

import type { CampaignItemInput, CampaignLifecycleStatus, GenerationStatus } from './campaign-state.js';

/** Explicit reasons a completed package cannot become Ready (Submission Ready). */
export const HANDOFF_BLOCKER_REASONS = [
  'needs_review',
  'quality_failed',
  'awaiting_site_profile',
  'site_unprofilable',
  'unsupported',
  'outreach_path',
  'guidelines_mismatch',
  'terminal_state',
] as const;

export type HandoffBlockerReason = (typeof HANDOFF_BLOCKER_REASONS)[number];

export function isHandoffBlockerReason(v: string | null | undefined): v is HandoffBlockerReason {
  return Boolean(v && (HANDOFF_BLOCKER_REASONS as readonly string[]).includes(v));
}

/** User-facing lifecycle labels — Ready displays as Submission Ready. */
export function campaignLifecycleDisplayLabel(status: CampaignLifecycleStatus | string): string {
  if (status === 'Ready') return 'Submission Ready';
  if (status === 'Package Generated') return 'Generated';
  return String(status);
}

/** Lifecycles that count as "generated packages" for conservation (§2). */
const GENERATED_BUCKET: CampaignLifecycleStatus[] = [
  'Package Generated',
  'Ready',
  'Submitting',
  'Waiting Human',
  'Retrying',
  'Submitted',
  'Verified',
  'Completed',
];

export type HandoffBlockerCounts = Record<HandoffBlockerReason, number> & { other: number };

export type HandoffConservation = {
  generatedPackages: number;
  submissionReady: number;
  inFlight: number; // Submitting + Waiting Human + Retrying
  completed: number; // Submitted + Verified + Completed
  blocked: number;
  blockers: HandoffBlockerCounts;
  /** generatedPackages should equal submissionReady + inFlight + completed + blocked (+ stranded Package Generated without blocker) */
  conservationLeft: number;
  conservationRight: number;
  ok: boolean;
  violations: Array<{ id: string; website: string; status: string; reason: string }>;
  strandedPackageGenerated: number;
};

function emptyBlockers(): HandoffBlockerCounts {
  return {
    needs_review: 0,
    quality_failed: 0,
    awaiting_site_profile: 0,
    site_unprofilable: 0,
    unsupported: 0,
    outreach_path: 0,
    guidelines_mismatch: 0,
    terminal_state: 0,
    other: 0,
  };
}

/**
 * Conservation: every generated package is Submission Ready, in-flight, completed, or blocked.
 * Stranded Package Generated without blocker_reason is a violation.
 */
export function computeHandoffConservation(
  items: Array<
    CampaignItemInput & {
      blockerReason?: string | null;
      generationStatus?: GenerationStatus | null;
    }
  >
): HandoffConservation {
  const blockers = emptyBlockers();
  const violations: HandoffConservation['violations'] = [];
  let submissionReady = 0;
  let inFlight = 0;
  let completed = 0;
  let blocked = 0;
  let strandedPackageGenerated = 0;
  let generatedPackages = 0;

  for (const item of items) {
    if (item.hidden || item.currentStatus === 'Deleted' || item.currentStatus === 'Ignored') {
      continue;
    }

    const status = item.currentStatus;
    const gen = item.generationStatus;
    const br = item.blockerReason ?? null;
    const website = String(item.websiteUrl || item.domain || item.id);

    const isGeneratedBucket = GENERATED_BUCKET.includes(status);
    const genCompleted =
      gen === 'Completed' || gen === 'Needs Review' || gen === 'Failed';
    const countsAsGenerated =
      isGeneratedBucket ||
      (genCompleted &&
        ['Approved', 'Package Generated', 'Failed'].includes(status) &&
        status !== 'Rejected');

    if (!countsAsGenerated && !br) continue;

    if (countsAsGenerated || br) {
      generatedPackages++;
    }

    if (status === 'Ready') {
      submissionReady++;
      continue;
    }
    if (status === 'Submitting' || status === 'Waiting Human' || status === 'Retrying') {
      inFlight++;
      continue;
    }
    if (status === 'Submitted' || status === 'Verified' || status === 'Completed') {
      completed++;
      continue;
    }

    if (br || gen === 'Needs Review' || gen === 'Failed' || status === 'Package Generated') {
      blocked++;
      const key = isHandoffBlockerReason(br)
        ? br
        : gen === 'Needs Review'
          ? 'needs_review'
          : gen === 'Failed' || status === 'Failed'
            ? 'quality_failed'
            : status === 'Package Generated'
              ? null
              : 'other';
      if (key === null) {
        strandedPackageGenerated++;
        violations.push({
          id: item.id,
          website,
          status,
          reason: 'Package Generated without blocker_reason — handoff transition missing',
        });
        blockers.other++;
      } else if (key === 'other') {
        blockers.other++;
      } else {
        blockers[key]++;
      }
      continue;
    }
  }

  const conservationRight =
    submissionReady + inFlight + completed + blocked;
  // Left side uses generatedPackages; right must match. Stranded are inside blocked.
  const ok = generatedPackages === conservationRight && strandedPackageGenerated === 0;

  if (!ok && strandedPackageGenerated === 0 && generatedPackages !== conservationRight) {
    violations.push({
      id: '*',
      website: '*',
      status: '*',
      reason: `Conservation mismatch: generated=${generatedPackages} vs ready+inflight+completed+blocked=${conservationRight}`,
    });
  }

  return {
    generatedPackages,
    submissionReady,
    inFlight,
    completed,
    blocked,
    blockers,
    conservationLeft: generatedPackages,
    conservationRight,
    ok,
    violations,
    strandedPackageGenerated,
  };
}

/** Empty-state selector for Submit Backlinks (§6) — first match wins. */
export type HandoffEmptyKind =
  | 'generation_running'
  | 'no_packages'
  | 'needs_review'
  | 'quality_failed'
  | 'awaiting_site_profile'
  | 'mixed_blockers'
  | 'all_submitted'
  | 'idle';

export function selectHandoffEmptyState(input: {
  submissionReady: number;
  generationRunning: number;
  generationRemaining: number;
  conservation: HandoffConservation;
}): { kind: HandoffEmptyKind; message: string } | null {
  if (input.submissionReady > 0) return null;

  const c = input.conservation;
  if (input.generationRunning > 0 || input.generationRemaining > 0) {
    return {
      kind: 'generation_running',
      message: `Waiting for generation to complete — ${input.generationRemaining || input.generationRunning} remaining.`,
    };
  }
  if (c.generatedPackages === 0 && c.blocked === 0) {
    return {
      kind: 'no_packages',
      message: 'No generated packages available. Generate content first.',
    };
  }
  if (c.completed > 0 && c.blocked === 0 && c.submissionReady === 0 && c.inFlight === 0) {
    return {
      kind: 'all_submitted',
      message: 'All packages submitted.',
    };
  }
  const b = c.blockers;
  const activeKeys = (Object.keys(b) as Array<keyof HandoffBlockerCounts>).filter(
    (k) => b[k] > 0
  );
  if (activeKeys.length === 1 && b.needs_review > 0) {
    return {
      kind: 'needs_review',
      message: `${b.needs_review} packages are waiting for quality review.`,
    };
  }
  if (activeKeys.length === 1 && b.quality_failed > 0) {
    return {
      kind: 'quality_failed',
      message: `${b.quality_failed} packages failed quality review.`,
    };
  }
  if (activeKeys.length === 1 && b.awaiting_site_profile > 0) {
    return {
      kind: 'awaiting_site_profile',
      message: `AI is analyzing websites before submission — ${b.awaiting_site_profile} remaining.`,
    };
  }
  if (c.blocked > 0) {
    const parts: string[] = [];
    if (b.needs_review) parts.push(`${b.needs_review} awaiting review`);
    if (b.unsupported) parts.push(`${b.unsupported} unsupported`);
    if (b.awaiting_site_profile) parts.push(`${b.awaiting_site_profile} analyzing`);
    if (b.quality_failed) parts.push(`${b.quality_failed} quality failed`);
    if (b.outreach_path) parts.push(`${b.outreach_path} outreach`);
    if (b.site_unprofilable) parts.push(`${b.site_unprofilable} unprofilable`);
    if (b.guidelines_mismatch) parts.push(`${b.guidelines_mismatch} guidelines`);
    if (b.other) parts.push(`${b.other} other`);
    return {
      kind: 'mixed_blockers',
      message: `0 ready — ${parts.join(', ')}.`,
    };
  }
  return {
    kind: 'idle',
    message: 'No packages are Submission Ready yet.',
  };
}
