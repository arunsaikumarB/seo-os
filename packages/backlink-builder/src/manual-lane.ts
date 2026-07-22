/**
 * Phase 6.3 / 6.3.1 — Auto vs Manual routing (upload heuristic + crawl correction + backfill).
 * Does NOT detect page gates — that remains Truth Engine (Phase 4.5).
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
  if (g === 'otp' || g === 'mfa' || g === 'email_verify' || g === 'phone_verify') {
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
  provisional: true;
  signal: 'auth_path' | 'known_host' | 'default_auto';
};

/** Stage 1 — upload-time heuristic. URL string only; never loads the page. */
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
  laneSticky?: boolean | null;
  laneSource?: string | null;
};

export function readLaneMeta(metadata: Record<string, unknown> | null | undefined): LaneMeta {
  const m = metadata ?? {};
  const lane = m.submissionLane ?? m.submission_lane;
  const provisional = m.provisionalLane ?? m.provisional_lane;
  return {
    submissionLane: lane === 'auto' || lane === 'manual' ? lane : null,
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

/** Terminal statuses excluded from Automatable + Manual lane cohort (Phase 6.3.1). */
export const LANE_TERMINAL_EXCLUDED = new Set(['Deleted', 'Rejected', 'Ignored', 'Failed']);

export function isLaneTerminalExcluded(status?: string | null): boolean {
  return LANE_TERMINAL_EXCLUDED.has(String(status ?? ''));
}

/** Evidence already on the Campaign Item / job / site profile → Manual reason (or null). */
export type ManualEvidenceInput = {
  currentStatus?: string | null;
  metadata?: Record<string, unknown> | null;
  jobStatus?: string | null;
  jobDisposition?: string | null;
  pauseReason?: string | null;
  truthClaim?: string | null;
  unclassified?: boolean | null;
  profileStatus?: string | null;
  requiresHuman?: boolean | null;
  strategyChosen?: string | null;
};

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
  'unsupported',
]);

/**
 * Infer Manual reason from EXISTING classifications (no re-detection).
 * Used for backfill + counts when metadata.submissionLane was never stamped.
 * Publish-approval-only pauses (Lane A) stay Automatable.
 */
export function inferManualReasonFromEvidence(input: ManualEvidenceInput): ManualReason | null {
  const meta = readLaneMeta(input.metadata ?? null);
  if (meta.submissionLane === 'manual' && meta.manualReason) {
    return meta.manualReason as ManualReason;
  }
  if (meta.submissionLane === 'manual') return 'Unclassified';

  // Final publish confirmation is Automable (not Manual Excel)
  try {
    // Lazy import avoided — inline the same rules as isPublishApprovalPause
    const pause = String(input.pauseReason ?? '').toLowerCase();
    const claim = String(input.truthClaim ?? '').trim();
    const jobStatus = String(input.jobStatus ?? '');
    if (
      pause === 'human_approval' &&
      claim !== 'Manual Approval' &&
      input.unclassified !== true &&
      (jobStatus === 'needs_approval' ||
        jobStatus === 'ready_for_review' ||
        jobStatus === 'ready_to_continue' ||
        !claim)
    ) {
      return null;
    }
  } catch {
    /* continue */
  }

  const claim = String(input.truthClaim ?? '').trim();
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
    return manualReasonFromGate('', claim);
  }

  if (input.unclassified === true) return 'Unclassified';

  const pause = String(input.pauseReason ?? '').toLowerCase();
  if (pause === 'human_approval') {
    // Site-detected Manual Approval claim already handled; bare publish hold → Automable
    return claim === 'Manual Approval' ? 'Manual Approval' : null;
  }
  if (pause && DIVERT_TO_MANUAL_GATES.has(pause)) {
    return manualReasonFromGate(pause, claim || null);
  }

  const disp = String(input.jobDisposition ?? '').toLowerCase();
  if (disp === 'manual_offline') {
    return (meta.manualReason as ManualReason) || 'Unclassified';
  }
  if (disp === 'unsupported') return 'Unsupported';

  const jobStatus = String(input.jobStatus ?? '').toLowerCase();
  if (jobStatus.includes('cloudflare')) return 'Cloudflare';
  if (jobStatus.includes('captcha')) return 'CAPTCHA';
  if (jobStatus === 'unsupported') return 'Unsupported';
  if (jobStatus.startsWith('watching_') || jobStatus.startsWith('blocked_')) {
    return manualReasonFromGate(jobStatus.replace(/^(watching_|blocked_)/, ''), claim || null);
  }

  if (String(input.profileStatus ?? '') === 'unsupported') return 'Unsupported';
  if (String(input.strategyChosen ?? '') === 'Unsupported') return 'Unsupported';
  if (input.requiresHuman === true) return 'CAPTCHA';

  return null;
}

export type ResolvedLane = {
  lane: SubmissionLaneKind;
  reason: ManualReason | null;
  confidence: 'provisional' | 'confirmed';
  inActiveCohort: boolean;
};

export function resolveItemLane(input: ManualEvidenceInput): ResolvedLane {
  if (isLaneTerminalExcluded(input.currentStatus)) {
    return { lane: 'auto', reason: null, confidence: 'confirmed', inActiveCohort: false };
  }

  const meta = readLaneMeta(input.metadata ?? null);
  const inferred = inferManualReasonFromEvidence(input);
  if (inferred) {
    const provisionalOnly =
      meta.laneSource === 'upload_heuristic' &&
      meta.submissionLane === 'manual' &&
      !input.truthClaim &&
      !input.pauseReason &&
      input.profileStatus !== 'unsupported' &&
      input.currentStatus !== 'Waiting Human' &&
      !input.unclassified &&
      String(input.strategyChosen ?? '') !== 'Unsupported';
    return {
      lane: 'manual',
      reason: inferred,
      confidence: provisionalOnly ? 'provisional' : 'confirmed',
      inActiveCohort: true,
    };
  }

  if (meta.submissionLane === 'auto' || meta.provisionalLane === 'auto') {
    return {
      lane: 'auto',
      reason: null,
      confidence: meta.laneSource === 'upload_heuristic' ? 'provisional' : 'confirmed',
      inActiveCohort: true,
    };
  }

  return { lane: 'auto', reason: null, confidence: 'confirmed', inActiveCohort: true };
}

export type AutoManualCounts = {
  automatable: number;
  manual: number;
  provisionalManual: number;
  provisionalAuto: number;
  active: number;
  terminalExcluded: number;
  confidence: 'provisional' | 'confirmed' | 'mixed';
};

export function computeAutoManualCounts(items: Array<ManualEvidenceInput>): AutoManualCounts {
  const counts: AutoManualCounts = {
    automatable: 0,
    manual: 0,
    provisionalManual: 0,
    provisionalAuto: 0,
    active: 0,
    terminalExcluded: 0,
    confidence: 'confirmed',
  };
  let anyProv = false;
  let anyConf = false;
  for (const item of items) {
    const resolved = resolveItemLane(item);
    if (!resolved.inActiveCohort) {
      counts.terminalExcluded++;
      continue;
    }
    counts.active++;
    if (resolved.lane === 'manual') {
      counts.manual++;
      if (resolved.confidence === 'provisional') {
        counts.provisionalManual++;
        anyProv = true;
      } else anyConf = true;
    } else {
      counts.automatable++;
      if (resolved.confidence === 'provisional') {
        counts.provisionalAuto++;
        anyProv = true;
      } else anyConf = true;
    }
  }
  counts.confidence = anyProv && anyConf ? 'mixed' : anyProv ? 'provisional' : 'confirmed';
  return counts;
}

export function shouldDivertGateToManual(params: {
  gate: string;
  truthClaim?: string | null;
  isPublishApprovalOnly?: boolean;
}): boolean {
  if (params.isPublishApprovalOnly) return false;
  const g = String(params.gate ?? '').toLowerCase();
  if (DIVERT_TO_MANUAL_GATES.has(g)) return true;
  const claim = String(params.truthClaim ?? '');
  return [
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
  ].includes(claim);
}
