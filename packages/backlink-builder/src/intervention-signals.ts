/**
 * Page-gate signals for Human Intervention.
 * Classifications go through the Detector Registry (Phase 4.5) — never infer.
 * Login is reported only when a real login form is detected AND blocking.
 */

import {
  DETECTOR_CONFIG,
  evaluateDetectors,
  type DetectorId,
} from './detector-registry.js';

export type DetectedInterventionGate =
  | 'login'
  | 'signup'
  | 'captcha'
  | 'mfa'
  | 'email_verify'
  | 'phone_verify'
  | 'category'
  | 'manual_input'
  | 'cloudflare'
  | 'human_approval'
  | 'unclassified'
  | 'needs_ai_review';

export interface InterventionSignals {
  loginForm: boolean;
  signupForm: boolean;
  captcha: boolean;
  mfa: boolean;
  emailVerify: boolean;
  phoneVerify: boolean;
  categoryManual: boolean;
  /** Highest-priority gate for pausing automation, if any */
  primaryGate: DetectedInterventionGate | null;
  /** Short human-readable pause reason */
  reason: string | null;
  /** Longer explanation for the intervention helper */
  explanation: string | null;
  /** Compact DOM evidence for debugging */
  evidence: string[];
  /** Phase 4.5: detector verified + blocking */
  verified?: boolean;
  claim?: string | null;
  detectorSignals?: Array<{ id: string; kind: string; detail: string }>;
}

function hasPasswordInput(html: string): boolean {
  return DETECTOR_CONFIG.passwordInput.test(html);
}

function hasConfirmPassword(html: string): boolean {
  return (
    DETECTOR_CONFIG.confirmPassword.test(html) ||
    (html.match(/<input[^>]*\btype=["']password["'][^>]*>/gi) ?? []).length >= 2
  );
}

function hasUsernameOrEmailField(html: string): boolean {
  return DETECTOR_CONFIG.identityField.test(html);
}

function hasLoginSubmitIntent(html: string): boolean {
  return (
    DETECTOR_CONFIG.loginCta.test(html) ||
    /<form[^>]*action=["'][^"']*(?:login|signin|sign-in|auth\/login)[^"']*["'][^>]*>/i.test(html)
  );
}

function hasSignupIntent(html: string, url = ''): boolean {
  const blob = `${html}\n${url}`.toLowerCase();
  return DETECTOR_CONFIG.signupIntent.test(blob) || DETECTOR_CONFIG.signupUrl.test(url);
}

function hasLoginHeadingOrUrl(html: string, url = ''): boolean {
  return DETECTOR_CONFIG.loginHeading.test(html) || DETECTOR_CONFIG.loginUrl.test(url);
}

/**
 * True when a login form is present (signal only — blocking is enforced by the registry).
 * Prefer evaluateDetectors / detectInterventionSignals for classification.
 */
export function detectLoginForm(html: string, url = ''): boolean {
  if (!hasPasswordInput(html)) return false;
  if (hasSignupIntent(html, url) && (hasConfirmPassword(html) || !hasLoginSubmitIntent(html))) {
    return false;
  }
  const identity = hasUsernameOrEmailField(html);
  const intent = hasLoginSubmitIntent(html) || hasLoginHeadingOrUrl(html, url);
  return identity || intent;
}

export function detectSignupForm(html: string, url = ''): boolean {
  if (!hasSignupIntent(html, url)) return false;
  if (hasConfirmPassword(html)) return true;
  if (hasPasswordInput(html) && hasUsernameOrEmailField(html) && !hasLoginSubmitIntent(html)) {
    return true;
  }
  return /<(?:button|input|a)[^>]*>[^<]*(?:sign[\s-]?up|register|create account)[^<]*/i.test(html);
}

export function detectCategoryManualInput(html: string): boolean {
  const hasCategorySelect =
    /<select[^>]*(?:name|id|aria-label)=["'][^"']*categor[^"']*["'][^>]*>/i.test(html) ||
    (/categor(?:y|ies)/i.test(html) && /<select[^>]*\brequired\b/i.test(html));
  if (!hasCategorySelect) return false;
  // Empty first option / "select category" placeholder is a strong signal
  const needsPick =
    /<option[^>]*(?:value=["']["']|value=["']0["'])[^>]*>[^<]*(?:select|choose|pick)?[^<]*categor/i.test(
      html
    ) || /select (a |your )?categor/i.test(html);
  return needsPick || /<select[^>]*(?:name|id)=["'][^"']*categor[^"']*["'][^>]*\brequired\b/i.test(html);
}

export function detectInterventionSignals(
  htmlSnippet?: string,
  url = '',
  opts?: { postSubmitHtml?: string | null; blockedButUnknown?: boolean }
): InterventionSignals {
  const html = htmlSnippet ?? '';
  const ev = evaluateDetectors(
    { html, url, postSubmitHtml: opts?.postSubmitHtml, targetingSubmissionForm: true },
    { blockedButUnknown: opts?.blockedButUnknown }
  );
  const primary = ev.primary;
  const categoryManual = !primary && detectCategoryManualInput(html);

  const evidence = primary
    ? primary.signals.map((s) => `${s.id}:${s.detail}`)
    : categoryManual
      ? ['category_select_manual']
      : [];

  let primaryGate: DetectedInterventionGate | null = null;
  let reason: string | null = null;
  let explanation: string | null = null;
  let claim: string | null = null;

  if (primary) {
    primaryGate = primary.detectorId as DetectedInterventionGate;
    claim = primary.claim;
    reason = primary.claim;
    explanation = `Verified by detector ${primary.detectorId}: ${primary.signals.map((s) => s.id).join(', ')}`;
  } else if (ev.needsAiReview) {
    primaryGate = 'needs_ai_review';
    claim = 'Needs AI Review';
    reason = 'Needs AI Review';
    explanation = 'No detector matched; evidence captured for AI classification pass.';
  } else if (categoryManual) {
    primaryGate = 'category';
    reason = 'Category selection requires manual input.';
    explanation =
      'A required category field could not be filled reliably. Choose the correct category on the paused page.';
  }

  const loginHit = ev.all.find((r) => r.detectorId === 'login');
  const signupHit = ev.all.find((r) => r.detectorId === 'signup');
  const captchaHit = ev.all.find((r) => r.detectorId === 'captcha' || r.detectorId === 'cloudflare');
  const mfaHit = ev.all.find((r) => r.detectorId === 'mfa');
  const emailHit = ev.all.find((r) => r.detectorId === 'email_verify');
  const phoneHit = ev.all.find((r) => r.detectorId === 'phone_verify');

  return {
    loginForm: Boolean(loginHit?.matched),
    signupForm: Boolean(signupHit?.matched),
    captcha: Boolean(captchaHit?.matched),
    mfa: Boolean(mfaHit?.matched),
    emailVerify: Boolean(emailHit?.matched),
    phoneVerify: Boolean(phoneHit?.matched),
    categoryManual,
    primaryGate,
    reason,
    explanation,
    evidence,
    verified: Boolean(primary?.matched && primary.blocking),
    claim,
    detectorSignals: primary?.signals ?? [],
  };
}

/** Re-run a single detector by id (used after AI suggests a claim). */
export function verifyDetectorClaim(
  detectorId: DetectorId,
  html: string,
  url = '',
  postSubmitHtml?: string | null
): boolean {
  const ev = evaluateDetectors({ html, url, postSubmitHtml });
  return Boolean(ev.all.find((r) => r.detectorId === detectorId)?.matched);
}

/** Map a stored pause_reason / gate key to display copy (no false "Login Required"). */
export function interventionCopyForPauseReason(
  pauseReason: string | null | undefined,
  opts?: { loginFormDetected?: boolean | null; explanation?: string | null }
): {
  gate: DetectedInterventionGate | 'human_approval' | 'unknown';
  reason: string;
  title: string;
  instruction: string;
  cta: string;
  successToast: string;
} {
  const pause = String(pauseReason ?? '');
  const loginOk = opts?.loginFormDetected === true;

  if (pause === 'login' && !loginOk && opts?.loginFormDetected === false) {
    // Stored as login but evidence says otherwise — fall through to unknown-style copy
    return {
      gate: 'unknown',
      reason: opts?.explanation || 'Action Required',
      title: 'AI needs your help',
      instruction:
        opts?.explanation ||
        'Complete the step on the live page. AI continues automatically when finished.',
      cta: 'Open paused page',
      successToast: 'Step complete — resuming automation…',
    };
  }

  switch (pause) {
    case 'login':
      return {
        gate: 'login',
        reason: 'Login form detected before submission.',
        title: 'AI needs your help — Login',
        instruction:
          opts?.explanation ||
          'A login form was detected. Sign in on the paused page — AI continues automatically.',
        cta: 'Open paused page',
        successToast: 'Login successful — resuming automation…',
      };
    case 'signup':
    case 'registration':
      return {
        gate: 'signup',
        reason: 'Registration is required before submitting.',
        title: 'AI needs your help — Registration',
        instruction:
          opts?.explanation ||
          'Create or finish the account on this website, then wait — AI continues automatically.',
        cta: 'Open paused page',
        successToast: 'Registration complete — resuming automation…',
      };
    case 'category':
    case 'category_selection':
      return {
        gate: 'category',
        reason: 'Category selection requires manual input.',
        title: 'AI needs your help — Category',
        instruction:
          opts?.explanation ||
          'Select the correct category on the paused page. AI continues when the field is set.',
        cta: 'Open paused page',
        successToast: 'Category selected — resuming automation…',
      };
    case 'manual_input':
      return {
        gate: 'manual_input',
        reason: 'Manual input required',
        title: 'AI needs your help',
        instruction:
          opts?.explanation ||
          'A form field requires manual input. Complete it on the paused page.',
        cta: 'Open paused page',
        successToast: 'Input complete — resuming automation…',
      };
    case 'captcha':
    case 'recaptcha':
      return {
        gate: 'captcha',
        reason: 'Solve CAPTCHA',
        title: 'CAPTCHA detected',
        instruction:
          'Solve the CAPTCHA on the live page. AI will continue automatically when cleared.',
        cta: 'Open paused page',
        successToast: 'CAPTCHA solved — AI is continuing…',
      };
    case 'cloudflare':
      return {
        gate: 'captcha',
        reason: 'Cloudflare Challenge',
        title: 'Security check required',
        instruction: 'Complete the Cloudflare / bot check. AI resumes when the site unlocks.',
        cta: 'Open paused page',
        successToast: 'Challenge cleared — resuming automation…',
      };
    case 'mfa':
    case 'otp':
      return {
        gate: 'mfa',
        reason: 'Enter Verification Code',
        title: 'MFA / OTP required',
        instruction:
          'Enter the one-time code from your authenticator or SMS. AI continues after success.',
        cta: 'Open paused page',
        successToast: 'Verification successful — resuming automation…',
      };
    case 'email_verify':
      return {
        gate: 'email_verify',
        reason: 'Verify Email',
        title: 'Email verification required',
        instruction:
          'Open the verification email and confirm. Return here — AI detects completion automatically.',
        cta: 'Open paused page',
        successToast: 'Email verified — resuming automation…',
      };
    case 'phone_verify':
      return {
        gate: 'phone_verify',
        reason: 'Verify Phone',
        title: 'Phone verification required',
        instruction: 'Enter the SMS code on the live page. AI continues automatically.',
        cta: 'Open paused page',
        successToast: 'Phone verified — resuming automation…',
      };
    case 'human_approval':
      return {
        gate: 'human_approval',
        reason: 'Manual Approval',
        title: 'Approval needed',
        instruction: 'Review the prepared submission, then approve so AI can submit.',
        cta: 'Open paused page',
        successToast: 'Approved — resuming automation…',
      };
    case 'validation_failed':
      return {
        gate: 'manual_input',
        reason: 'Form validation needs correction',
        title: 'AI needs your help — Validation',
        instruction:
          opts?.explanation ||
          'Some required fields failed validation. Fix them on the paused page.',
        cta: 'Open paused page',
        successToast: 'Validation fixed — resuming automation…',
      };
    default:
      return {
        gate: 'unknown',
        reason: opts?.explanation || 'Action Required',
        title: 'AI needs your help',
        instruction:
          opts?.explanation ||
          'Complete the step on the live page. AI continues automatically when finished.',
        cta: 'Open paused page',
        successToast: 'Step complete — resuming automation…',
      };
  }
}

export function workflowStepLabel(action?: string | null, stepIndex?: number | null): string {
  const a = String(action ?? '');
  const map: Record<string, string> = {
    open: 'Open Website',
    navigate: 'Navigate',
    login: 'Login',
    analyze_form: 'Find Form',
    fill: 'Fill Listing',
    select: 'Select Category',
    upload: 'Upload Assets',
    upload_logo: 'Upload Logo',
    upload_images: 'Upload Images',
    upload_videos: 'Upload Videos',
    preview: 'Preview',
    wait_approval: 'Awaiting Approval',
    submit: 'Submit Listing',
    verify: 'Verify Backlink',
    screenshot: 'Capture Page',
  };
  if (map[a]) return map[a];
  if (stepIndex != null && Number.isFinite(stepIndex)) return `Step ${Number(stepIndex) + 1}`;
  return 'Workflow step';
}
