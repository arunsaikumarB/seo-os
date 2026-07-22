/**
 * Phase 6.2 — Submission queue lanes.
 * Routes existing Truth Engine / pause classifications into Auto vs Human-gate.
 * Does NOT re-detect; only regroups what Phase 4.5 already produced.
 */

/** TruthClaim strings that always require a human (Lane B). */
export const HUMAN_GATE_TRUTH_CLAIMS = [
  'CAPTCHA',
  'Login Required',
  'Registration Required',
  'Cloudflare / Anti-Bot',
  'Manual Approval',
  'OTP / MFA',
  'Email Verification',
  'Phone Verification',
  'Needs AI Review',
  'Unclassified',
] as const;

/** pause_reason / gate keys that are genuine human gates (Lane B). */
export const HUMAN_GATE_KEYS = new Set([
  'login',
  'signup',
  'registration',
  'captcha',
  'recaptcha',
  'cloudflare',
  'otp',
  'mfa',
  'email_verify',
  'phone_verify',
  'unclassified',
  'needs_ai_review',
  'category',
  'category_selection',
  'manual_input',
  'security_question',
  'validation_failed',
]);

export type SubmissionLane = 'auto' | 'human_gate';

export type LaneRouteInput = {
  gate?: string | null;
  pauseReason?: string | null;
  truthClaim?: string | null;
  unclassified?: boolean | null;
  /** When true, final publish confirmation without a site Manual Approval claim → Lane A */
  status?: string | null;
};

/**
 * Final publish confirmation (product policy §4a) — not a site-detected gate.
 * Jobs pause at needs_approval / ready_for_review with pause_reason human_approval
 * and NO Truth Engine Manual Approval claim.
 */
export function isPublishApprovalPause(input: LaneRouteInput): boolean {
  const gate = String(input.gate ?? input.pauseReason ?? '');
  const pause = String(input.pauseReason ?? '');
  const claim = String(input.truthClaim ?? '').trim();
  const status = String(input.status ?? '');
  if (claim === 'Manual Approval') return false;
  if (input.unclassified) return false;
  const isApprovalGate = gate === 'human_approval' || pause === 'human_approval';
  const isApprovalStatus =
    status === 'needs_approval' ||
    status === 'ready_for_review' ||
    status === 'ready_to_continue';
  return isApprovalGate && (isApprovalStatus || !claim || claim === '');
}

/**
 * Lane B — genuine human gate (CAPTCHA / Login / Cloudflare / OTP / Manual Approval / Unclassified).
 * Lane A — everything else waiting that is only the final publish confirmation.
 */
export function submissionLaneForIntervention(input: LaneRouteInput): SubmissionLane {
  if (input.unclassified === true) return 'human_gate';
  const claim = String(input.truthClaim ?? '').trim();
  if ((HUMAN_GATE_TRUTH_CLAIMS as readonly string[]).includes(claim)) {
    return 'human_gate';
  }
  const gate = String(input.gate ?? '').toLowerCase();
  const pause = String(input.pauseReason ?? '').toLowerCase();

  // Publish-approval policy pause → Lane A (batch confirm), never per-site Complete All
  if (isPublishApprovalPause(input)) return 'auto';

  if (HUMAN_GATE_KEYS.has(gate) || HUMAN_GATE_KEYS.has(pause)) return 'human_gate';
  if (gate === 'human_approval' || pause === 'human_approval') {
    // Site-detected Manual Approval without claim string still stays human
    return claim === 'Manual Approval' ? 'human_gate' : 'auto';
  }
  if (gate === 'unknown' || pause === 'unknown') return 'human_gate';
  return 'human_gate';
}

export type LaneCounts = {
  laneA: number;
  laneB: number;
  /** Actively running / queued (not paused) — shown under Lane A progress */
  autoSubmitting: number;
};

export function emptyLaneCounts(): LaneCounts {
  return { laneA: 0, laneB: 0, autoSubmitting: 0 };
}
