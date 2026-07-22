/**
 * Detector Registry — Phase 4.5 Execution Truth Engine.
 * Only detectors here may assign intervention classifications.
 * Every claim requires: positive signal(s) AND blocking check.
 */
export type TruthClaim =
  | 'Login Required'
  | 'Registration Required'
  | 'CAPTCHA'
  | 'Cloudflare / Anti-Bot'
  | 'Manual Approval'
  | 'OTP / MFA'
  | 'Email Verification'
  | 'Phone Verification'
  | 'Needs AI Review'
  | 'Unclassified';

export type DetectorId =
  | 'login'
  | 'signup'
  | 'captcha'
  | 'cloudflare'
  | 'human_approval'
  | 'mfa'
  | 'email_verify'
  | 'phone_verify';

export type DetectorSignal = {
  id: string;
  kind: 'selector' | 'url' | 'text' | 'dom' | 'blocking';
  detail: string;
};

export type DetectorResult = {
  claim: TruthClaim;
  detectorId: DetectorId;
  matched: boolean;
  blocking: boolean;
  confidence: number;
  signals: DetectorSignal[];
};

export type DetectorInput = {
  html: string;
  url?: string;
  /** Region after a submit attempt (for Manual Approval) */
  postSubmitHtml?: string | null;
  /** True when the worker just attempted / is about to hit the target form */
  targetingSubmissionForm?: boolean;
};

/** Tunable patterns — edit here without touching engine code. */
export const DETECTOR_CONFIG = {
  loginUrl: /\/(login|signin|sign-in|auth)(\/|$|\?)/i,
  signupUrl: /\/(signup|sign-up|register|join|create-account)(\/|$|\?)/i,
  cloudflareUrl: /\/cdn-cgi\/|challenge|cf-browser/i,
  passwordInput: /<input[^>]*\btype=["']password["'][^>]*>/i,
  confirmPassword:
    /<input[^>]*(name|id|placeholder)=["'][^"']*(confirm|password2|password_confirmation|retype)[^"']*["'][^>]*>/i,
  identityField:
    /<input[^>]*\btype=["']email["'][^>]*>|<input[^>]*(name|id|autocomplete)=["'][^"']*(user|email|login|username|userid)[^"']*["'][^>]*>/i,
  loginCta:
    /<(?:button|input)[^>]*(?:value|aria-label|title)=["'][^"']*(?:sign[\s-]?in|log[\s-]?in|login)[^"']*["'][^>]*>|<(?:button|a)[^>]*>[^<]*(?:sign[\s-]?in|log[\s-]?in)[^<]*<\/(?:button|a)>/i,
  loginHeading: /<(?:h1|h2|h3|legend|title)[^>]*>[^<]*(?:sign[\s-]?in|log[\s-]?in|login)[^<]*</i,
  signupIntent: /sign[\s-]?up|register|create (an )?account|join (now|us|free)/i,
  /** Real CAPTCHA widgets only — never the word "captcha" alone */
  captchaWidget:
    /g-recaptcha|h-captcha|hcaptcha|cf-turnstile|data-sitekey|iframe[^>]+(recaptcha|hcaptcha|turnstile)|class=["'][^"']*(g-recaptcha|h-captcha|cf-turnstile)/i,
  cloudflareMarkers:
    /cf-browser-verification|challenge-platform|cf-challenge|attention required|just a moment|cdn-cgi\/challenge/i,
  mfa:
    /<(?:input)[^>]*(name|id|autocomplete)=["'][^"']*(otp|totp|mfa|2fa|verification.?code)[^"']*["']|enter (your )?(otp|code|verification code)|authenticator app/i,
  emailVerify: /verify your email|email verification|confirm your email|we (have )?sent.*(email|link)/i,
  phoneVerify: /verify.*(phone|sms)|sms code|phone verification|we (have )?sent.*(sms|text)/i,
  approvalPending:
    /under review|awaiting approval|pending (moderation|review|approval)|submitted for (review|approval)|awaiting moderator/i,
  /** Listing/directory submission form heuristics (non-login) */
  submissionForm:
    /<(?:textarea|input)[^>]*(name|id|placeholder)=["'][^"']*(title|description|listing|company|website|url|business)[^"']*["']|<form[^>]*>[\s\S]{80,}?<\/form>/i,
} as const;

function signal(id: string, kind: DetectorSignal['kind'], detail: string): DetectorSignal {
  return { id, kind, detail };
}

function countPasswordInputs(html: string): number {
  return (html.match(/<input[^>]*\btype=["']password["'][^>]*>/gi) ?? []).length;
}

/** True when a fillable non-auth submission form appears to be present. */
export function hasFillableSubmissionForm(html: string): boolean {
  if (!DETECTOR_CONFIG.submissionForm.test(html)) return false;
  // Login-only pages shouldn't count
  if (
    DETECTOR_CONFIG.passwordInput.test(html) &&
    DETECTOR_CONFIG.loginHeading.test(html) &&
    !/title|description|listing|company/i.test(html)
  ) {
    return false;
  }
  return true;
}

/**
 * Blocking check: obstacle must gate the next stage.
 * Login/CAPTCHA that coexists with a fillable submission form is NOT blocking.
 */
export function isObstacleBlocking(
  claim: TruthClaim,
  html: string,
  url: string
): { blocking: boolean; signals: DetectorSignal[] } {
  const signals: DetectorSignal[] = [];
  const fillable = hasFillableSubmissionForm(html);

  if (claim === 'Login Required' || claim === 'Registration Required') {
    // Auth URL as primary content → blocking
    if (DETECTOR_CONFIG.loginUrl.test(url) || DETECTOR_CONFIG.signupUrl.test(url)) {
      signals.push(signal('auth_url', 'url', url));
      signals.push(signal('blocking_auth_page', 'blocking', 'Primary auth URL'));
      return { blocking: true, signals };
    }
    // Login form is primary (password + heading) and no listing form → blocking
    if (DETECTOR_CONFIG.passwordInput.test(html) && DETECTOR_CONFIG.loginHeading.test(html) && !fillable) {
      signals.push(signal('blocking_login_primary', 'blocking', 'Login is primary page content'));
      return { blocking: true, signals };
    }
    // Fillable submission form present → login is NOT blocking (nav link / footer)
    if (fillable) {
      signals.push(
        signal('non_blocking_fillable_form', 'blocking', 'Submission form still fillable')
      );
      return { blocking: false, signals };
    }
    // Password form without listing fields → treat as blocking auth
    if (DETECTOR_CONFIG.passwordInput.test(html)) {
      signals.push(signal('blocking_password_gate', 'blocking', 'Password gate without listing form'));
      return { blocking: true, signals };
    }
    return { blocking: false, signals };
  }

  if (claim === 'CAPTCHA' || claim === 'Cloudflare / Anti-Bot') {
    // Challenge URL / interstitial → blocking
    if (DETECTOR_CONFIG.cloudflareUrl.test(url) || DETECTOR_CONFIG.cloudflareMarkers.test(html)) {
      signals.push(signal('blocking_challenge_page', 'blocking', 'Challenge interstitial'));
      return { blocking: true, signals };
    }
    if (!DETECTOR_CONFIG.captchaWidget.test(html)) {
      return { blocking: false, signals };
    }
    // Widget attached to a submission form, or page has no fillable listing form
    const forms = html.match(/<form[\s\S]*?<\/form>/gi) ?? [];
    const attached = forms.some(
      (f) =>
        DETECTOR_CONFIG.captchaWidget.test(f) &&
        /(type=["']submit["']|submit|title|description|listing|company)/i.test(f)
    );
    if (attached || !fillable) {
      signals.push(signal('blocking_captcha_widget', 'blocking', 'CAPTCHA gates the form'));
      return { blocking: true, signals };
    }
    signals.push(
      signal('captcha_widget_non_blocking', 'blocking', 'Widget present but not attached to target form')
    );
    return { blocking: false, signals };
  }

  // MFA / email / phone / approval — presence of flow is the block
  signals.push(signal('blocking_flow', 'blocking', `${claim} flow detected`));
  return { blocking: true, signals };
}

function runLogin(input: DetectorInput): DetectorResult {
  const html = input.html;
  const url = input.url ?? '';
  const signals: DetectorSignal[] = [];
  let matched = false;

  if (DETECTOR_CONFIG.passwordInput.test(html)) {
    signals.push(signal('password_input', 'selector', 'input[type=password]'));
  }
  if (DETECTOR_CONFIG.identityField.test(html)) {
    signals.push(signal('identity_field', 'selector', 'email/username input'));
  }
  if (DETECTOR_CONFIG.loginCta.test(html)) {
    signals.push(signal('login_cta', 'dom', 'Sign in / Log in control'));
  }
  if (DETECTOR_CONFIG.loginHeading.test(html)) {
    signals.push(signal('login_heading', 'dom', 'Login heading'));
  }
  if (DETECTOR_CONFIG.loginUrl.test(url)) {
    signals.push(signal('login_url', 'url', url));
  }

  const hasPw = DETECTOR_CONFIG.passwordInput.test(html);
  const identity = DETECTOR_CONFIG.identityField.test(html);
  const intent =
    DETECTOR_CONFIG.loginCta.test(html) ||
    DETECTOR_CONFIG.loginHeading.test(html) ||
    DETECTOR_CONFIG.loginUrl.test(url);
  const signup =
    DETECTOR_CONFIG.signupIntent.test(html) &&
    (DETECTOR_CONFIG.confirmPassword.test(html) || countPasswordInputs(html) >= 2);

  matched = Boolean(hasPw && (identity || intent) && !signup);

  const block = matched ? isObstacleBlocking('Login Required', html, url) : { blocking: false, signals: [] };
  signals.push(...block.signals);

  return {
    claim: 'Login Required',
    detectorId: 'login',
    matched: matched && block.blocking,
    blocking: block.blocking,
    confidence: matched && block.blocking ? 0.92 : matched ? 0.4 : 0,
    signals,
  };
}

function runSignup(input: DetectorInput): DetectorResult {
  const html = input.html;
  const url = input.url ?? '';
  const signals: DetectorSignal[] = [];
  const intent = DETECTOR_CONFIG.signupIntent.test(`${html}\n${url}`);
  if (intent) signals.push(signal('signup_intent', 'text', 'signup/register copy'));
  if (DETECTOR_CONFIG.signupUrl.test(url)) signals.push(signal('signup_url', 'url', url));
  if (DETECTOR_CONFIG.confirmPassword.test(html))
    signals.push(signal('confirm_password', 'selector', 'confirm password'));
  const matched =
    intent &&
    (DETECTOR_CONFIG.confirmPassword.test(html) ||
      (DETECTOR_CONFIG.passwordInput.test(html) && DETECTOR_CONFIG.identityField.test(html)));
  const block = matched
    ? isObstacleBlocking('Registration Required', html, url)
    : { blocking: false, signals: [] };
  signals.push(...block.signals);
  return {
    claim: 'Registration Required',
    detectorId: 'signup',
    matched: matched && block.blocking,
    blocking: block.blocking,
    confidence: matched && block.blocking ? 0.9 : 0,
    signals,
  };
}

function runCaptcha(input: DetectorInput): DetectorResult {
  const html = input.html;
  const url = input.url ?? '';
  const signals: DetectorSignal[] = [];
  const widget = DETECTOR_CONFIG.captchaWidget.test(html);
  if (widget) signals.push(signal('captcha_widget', 'dom', 'reCAPTCHA/hCaptcha/Turnstile widget'));
  // Explicitly ignore text-only "captcha" mentions
  const textOnly =
    !widget && /captcha/i.test(html) && !DETECTOR_CONFIG.captchaWidget.test(html);
  if (textOnly) signals.push(signal('captcha_text_ignored', 'text', 'word mention only — ignored'));
  const block = widget
    ? isObstacleBlocking('CAPTCHA', html, url)
    : { blocking: false, signals: [] };
  signals.push(...block.signals);
  return {
    claim: 'CAPTCHA',
    detectorId: 'captcha',
    matched: widget && block.blocking,
    blocking: block.blocking,
    confidence: widget && block.blocking ? 0.95 : 0,
    signals,
  };
}

function runCloudflare(input: DetectorInput): DetectorResult {
  const html = input.html;
  const url = input.url ?? '';
  const signals: DetectorSignal[] = [];
  const hit =
    DETECTOR_CONFIG.cloudflareMarkers.test(html) || DETECTOR_CONFIG.cloudflareUrl.test(url);
  if (hit) signals.push(signal('cloudflare_challenge', 'dom', 'Challenge markers'));
  const block = hit
    ? isObstacleBlocking('Cloudflare / Anti-Bot', html, url)
    : { blocking: false, signals: [] };
  signals.push(...block.signals);
  return {
    claim: 'Cloudflare / Anti-Bot',
    detectorId: 'cloudflare',
    matched: hit && block.blocking,
    blocking: block.blocking,
    confidence: hit && block.blocking ? 0.95 : 0,
    signals,
  };
}

function runMfa(input: DetectorInput): DetectorResult {
  const html = input.html;
  const signals: DetectorSignal[] = [];
  const matched = DETECTOR_CONFIG.mfa.test(html);
  if (matched) signals.push(signal('mfa_input', 'dom', 'OTP/MFA input or copy'));
  return {
    claim: 'OTP / MFA',
    detectorId: 'mfa',
    matched,
    blocking: matched,
    confidence: matched ? 0.88 : 0,
    signals,
  };
}

function runEmail(input: DetectorInput): DetectorResult {
  const matched = DETECTOR_CONFIG.emailVerify.test(input.html);
  return {
    claim: 'Email Verification',
    detectorId: 'email_verify',
    matched,
    blocking: matched,
    confidence: matched ? 0.85 : 0,
    signals: matched ? [signal('email_verify', 'text', 'email verification copy')] : [],
  };
}

function runPhone(input: DetectorInput): DetectorResult {
  const matched = DETECTOR_CONFIG.phoneVerify.test(input.html);
  return {
    claim: 'Phone Verification',
    detectorId: 'phone_verify',
    matched,
    blocking: matched,
    confidence: matched ? 0.85 : 0,
    signals: matched ? [signal('phone_verify', 'text', 'phone/SMS verification')] : [],
  };
}

function runManualApproval(input: DetectorInput): DetectorResult {
  const region = input.postSubmitHtml ?? input.html;
  const matched = DETECTOR_CONFIG.approvalPending.test(region);
  // Generic thank-you alone is NOT Manual Approval
  const thankYouOnly =
    /thank you|thanks for (your )?submi/i.test(region) &&
    !DETECTOR_CONFIG.approvalPending.test(region);
  return {
    claim: 'Manual Approval',
    detectorId: 'human_approval',
    matched: matched && !thankYouOnly,
    blocking: matched && !thankYouOnly,
    confidence: matched && !thankYouOnly ? 0.87 : 0,
    signals: matched
      ? [signal('approval_pending', 'text', 'under review / awaiting approval')]
      : thankYouOnly
        ? [signal('thank_you_ignored', 'text', 'generic thank-you — not Manual Approval')]
        : [],
  };
}

const DETECTORS: Array<(input: DetectorInput) => DetectorResult> = [
  runCloudflare,
  runCaptcha,
  runMfa,
  runEmail,
  runPhone,
  runLogin,
  runSignup,
  runManualApproval,
];

export type TruthEvaluation = {
  primary: DetectorResult | null;
  all: DetectorResult[];
  /** Gate key for BEE pauseForGate */
  gate: DetectorId | 'unknown' | null;
  needsAiReview: boolean;
};

/**
 * Run the full registry. Returns the highest-priority matched+blocking claim.
 * If nothing matches but caller marks the page as blocked, needsAiReview=true.
 */
export function evaluateDetectors(
  input: DetectorInput,
  opts?: { blockedButUnknown?: boolean }
): TruthEvaluation {
  const all = DETECTORS.map((d) => d(input));
  const primary = all.find((r) => r.matched && r.blocking) ?? null;
  const gate = primary ? primary.detectorId : null;
  return {
    primary,
    all,
    gate,
    needsAiReview: !primary && Boolean(opts?.blockedButUnknown),
  };
}

/** Map claim → BEE pause_reason / gate key */
export function gateFromClaim(claim: TruthClaim | null | undefined): string | null {
  switch (claim) {
    case 'Login Required':
      return 'login';
    case 'Registration Required':
      return 'signup';
    case 'CAPTCHA':
      return 'captcha';
    case 'Cloudflare / Anti-Bot':
      return 'cloudflare';
    case 'Manual Approval':
      return 'human_approval';
    case 'OTP / MFA':
      return 'mfa';
    case 'Email Verification':
      return 'email_verify';
    case 'Phone Verification':
      return 'phone_verify';
    case 'Unclassified':
      return 'unclassified';
    case 'Needs AI Review':
      return 'needs_ai_review';
    default:
      return null;
  }
}

/** Bridge: update InterventionSignals-compatible shape from truth evaluation */
export function signalsFromTruthEvaluation(ev: TruthEvaluation): {
  primaryGate: DetectorId | null;
  reason: string | null;
  explanation: string | null;
  evidence: string[];
  loginForm: boolean;
  signupForm: boolean;
  captcha: boolean;
  mfa: boolean;
  emailVerify: boolean;
  phoneVerify: boolean;
  verified: boolean;
  claim: TruthClaim | null;
} {
  const p = ev.primary;
  return {
    primaryGate: (p?.detectorId as DetectorId) ?? null,
    reason: p?.claim ?? null,
    explanation: p
      ? `Verified by detector ${p.detectorId}: ${p.signals.map((s) => s.id).join(', ')}`
      : null,
    evidence: p?.signals.map((s) => `${s.id}:${s.detail}`) ?? [],
    loginForm: p?.detectorId === 'login',
    signupForm: p?.detectorId === 'signup',
    captcha: p?.detectorId === 'captcha' || p?.detectorId === 'cloudflare',
    mfa: p?.detectorId === 'mfa',
    emailVerify: p?.detectorId === 'email_verify',
    phoneVerify: p?.detectorId === 'phone_verify',
    verified: Boolean(p?.matched && p.blocking),
    claim: p?.claim ?? null,
  };
}
