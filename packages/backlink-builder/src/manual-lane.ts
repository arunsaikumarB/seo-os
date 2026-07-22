/**
 * Phase 6.3 — Auto vs Manual routing (upload heuristic + crawl correction).
 * Does NOT detect page gates — that remains Truth Engine (Phase 4.5).
 * This module only: provisional URL guess, reason labels, and count helpers.
 */

export type SubmissionLaneKind = 'auto' | 'manual';

export type ManualReason =
  | 'Login'
  | 'CAPTCHA'
  | 'Cloudflare'
  | 'Registration'
  | 'OTP'
  | 'Manual Approval'
  | 'Unclassified'
  | 'Unsupported'
  | 'Provisional — auth URL'
  | 'Provisional — known gate host';

/** Gate keys / TruthClaims → Manual Excel reason */
export function manualReasonFromGate(gate: string, truthClaim?: string | null): ManualReason {
  const claim = String(truthClaim ?? '').trim();
  if (claim === 'CAPTCHA') return 'CAPTCHA';
  if (claim === 'Login Required') return 'Login';
  if (claim === 'Registration Required') return 'Registration';
  if (claim === 'Cloudflare / Anti-Bot') return 'Cloudflare';
  if (claim === 'OTP / MFA' || claim === 'Email Verification' || claim === 'Phone Verification') {
    return 'OTP';
  }
  if (claim === 'Manual Approval') return 'Manual Approval';
  if (claim === 'Unclassified' || claim === 'Needs AI Review') return 'Unclassified';

  const g = String(gate ?? '').toLowerCase();
  if (g === 'captcha' || g === 'recaptcha') return 'CAPTCHA';
  if (g === 'cloudflare') return 'Cloudflare';
  if (g === 'login') return 'Login';
  if (g === 'signup' || g === 'registration') return 'Registration';
  if (
    g === 'otp' ||
    g === 'mfa' ||
    g === 'email_verify' ||
    g === 'phone_verify'
  ) {
    return 'OTP';
  }
  if (g === 'human_approval') return 'Manual Approval';
  if (g === 'unclassified' || g === 'needs_ai_review' || g === 'unknown') return 'Unclassified';
  if (g === 'unsupported') return 'Unsupported';
  return 'Unclassified';
}

/** Path / query patterns that strongly suggest auth walls (URL-only guess). */
const AUTH_PATH_RE =
  /\/(wp-login\.php|login|signin|sign-in|sign_in|register|signup|sign-up|sign_up|account|auth|oauth|sso|user\/login|users\/sign_in)(\/|\?|$)/i;

/** Hosts known to be gate-heavy or non-automatable directories (provisional Manual). */
const KNOWN_GATE_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'linkedin.com',
  'www.linkedin.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'accounts.google.com',
  'login.microsoftonline.com',
]);

export type ProvisionalLaneResult = {
  lane: SubmissionLaneKind;
  reason: ManualReason | null;
  /** Always true for Stage-1 — UI must label as provisional */
  provisional: true;
  signal: 'auth_path' | 'known_host' | 'default_auto';
};

/**
 * Stage 1 — upload-time heuristic. URL string only; never loads the page.
 * Explicitly a GUESS — crawl correction may move the item later.
 */
export function classifyUrlProvisional(rawUrl: string): ProvisionalLaneResult {
  let hostname = '';
  let pathname = '';
  try {
    const u = new URL(rawUrl.includes('://') ? rawUrl : `https://${rawUrl}`);
    hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    pathname = u.pathname + u.search;
  } catch {
    return {
      lane: 'manual',
      reason: 'Unsupported',
      provisional: true,
      signal: 'default_auto',
    };
  }

  const hostWithWww = `www.${hostname}`;
  if (KNOWN_GATE_HOSTS.has(hostname) || KNOWN_GATE_HOSTS.has(hostWithWww)) {
    return {
      lane: 'manual',
      reason: 'Provisional — known gate host',
      provisional: true,
      signal: 'known_host',
    };
  }

  if (AUTH_PATH_RE.test(pathname) || AUTH_PATH_RE.test(rawUrl)) {
    return {
      lane: 'manual',
      reason: 'Provisional — auth URL',
      provisional: true,
      signal: 'auth_path',
    };
  }

  return { lane: 'auto', reason: null, provisional: true, signal: 'default_auto' };
}

export type LaneMeta = {
  submissionLane?: SubmissionLaneKind | null;
  provisionalLane?: SubmissionLaneKind | null;
  manualReason?: string | null;
  /** When true, crawl will not flip Manual → Auto */
  laneSticky?: boolean | null;
  laneSource?: string | null;
};

export function readLaneMeta(metadata: Record<string, unknown> | null | undefined): LaneMeta {
  const m = metadata ?? {};
  const lane = m.submissionLane ?? m.submission_lane;
  const provisional = m.provisionalLane ?? m.provisional_lane;
  return {
    submissionLane:
      lane === 'auto' || lane === 'manual' ? lane : null,
    provisionalLane:
      provisional === 'auto' || provisional === 'manual' ? provisional : null,
    manualReason:
      m.manualReason != null
        ? String(m.manualReason)
        : m.manual_reason != null
          ? String(m.manual_reason)
          : null,
    laneSticky: Boolean(m.laneSticky ?? m.lane_sticky),
    laneSource: m.laneSource != null ? String(m.laneSource) : null,
  };
}

export type AutoManualCounts = {
  automatable: number;
  manual: number;
  provisionalManual: number;
  provisionalAuto: number;
};

export function computeAutoManualCounts(
  items: Array<{ currentStatus?: string; metadata?: Record<string, unknown> | null }>
): AutoManualCounts {
  const counts: AutoManualCounts = {
    automatable: 0,
    manual: 0,
    provisionalManual: 0,
    provisionalAuto: 0,
  };
  for (const item of items) {
    if (item.currentStatus === 'Deleted') continue;
    const meta = readLaneMeta(item.metadata ?? null);
    if (meta.submissionLane === 'manual') {
      counts.manual++;
      if (meta.provisionalLane === 'manual' && meta.laneSource === 'upload_heuristic') {
        counts.provisionalManual++;
      }
    } else {
      counts.automatable++;
      if (meta.provisionalLane === 'auto' || meta.submissionLane === 'auto') {
        counts.provisionalAuto++;
      }
    }
  }
  return counts;
}

/** Gates that must divert to Manual (never block the auto queue). */
export const DIVERT_TO_MANUAL_GATES = new Set([
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
  'human_approval',
  'unclassified',
  'needs_ai_review',
  'category',
  'manual_input',
  'security_question',
  'validation_failed',
  'unknown',
]);

/**
 * True when a pause should silently divert to Manual instead of Waiting Human.
 * Final publish confirmation (product policy) is NOT diverted here — handled by auto-publish toggle.
 */
export function shouldDivertGateToManual(params: {
  gate: string;
  truthClaim?: string | null;
  /** Product final-publish pause without site Manual Approval claim */
  isPublishApprovalOnly?: boolean;
}): boolean {
  if (params.isPublishApprovalOnly) return false;
  const g = String(params.gate ?? '').toLowerCase();
  if (DIVERT_TO_MANUAL_GATES.has(g)) return true;
  const claim = String(params.truthClaim ?? '');
  if (
    [
      'CAPTCHA',
      'Login Required',
      'Registration Required',
      'Cloudflare / Anti-Bot',
      'OTP / MFA',
      'Email Verification',
      'Phone Verification',
      'Manual Approval',
      'Unclassified',
      'Needs AI Review',
    ].includes(claim)
  ) {
    return true;
  }
  return false;
}
