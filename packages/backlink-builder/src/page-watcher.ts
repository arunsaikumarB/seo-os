/**
 * PageWatcher signal evaluation — pure domain logic (no Playwright).
 * Detects that the *user* completed a protected gate. Never solves or bypasses gates.
 */

import type { ExecutionGate } from './browser-execution.js';

export type GateClearanceReason =
  | 'captcha_gone'
  | 'captcha_solved_flag'
  | 'submit_enabled'
  | 'url_changed'
  | 'success_banner'
  | 'logout_visible'
  | 'avatar_visible'
  | 'auth_cookie'
  | 'dashboard_url'
  | 'verified_badge'
  | 'account_activated'
  | 'otp_cleared'
  | 'mfa_cleared'
  | 'login_form_gone';

export interface PageWatcherSnapshot {
  html: string;
  url: string;
  title?: string;
  previousUrl?: string;
  cookieNames?: string[];
  /** Optional live DOM probes from runtime */
  probes?: {
    captchaIframeVisible?: boolean;
    captchaContainerVisible?: boolean;
    submitDisabled?: boolean;
    logoutVisible?: boolean;
    avatarVisible?: boolean;
    verifiedBadgeVisible?: boolean;
    successBannerVisible?: boolean;
  };
}

export interface GateClearanceResult {
  cleared: boolean;
  reasons: GateClearanceReason[];
  stillPresent: boolean;
  detail: Record<string, unknown>;
}

const AUTH_COOKIE_RE = /^(session|sid|ssid|auth|token|access_token|refresh_token|jwt|logged[_-]?in|__session)/i;

const SUCCESS_RE =
  /verification (complete|successful)|email (verified|confirmed)|account activated|phone verified|success(fully)? (submitted|verified)|thank you for verif/i;

const CAPTCHA_RE = /g-recaptcha|h-captcha|hcaptcha|cf-turnstile|data-sitekey|captcha-container|id=["']captcha/i;
const MFA_RE = /two[\s-]?factor|authenticator app|enter (your )?otp|verification code|mfa|2fa/i;
const EMAIL_VERIFY_RE = /verify your email|email verification|confirm your email|check your inbox/i;
const PHONE_VERIFY_RE = /verify.*(phone|sms)|sms code|phone verification|enter the code (we )?sent/i;
const LOGIN_FORM_RE = /type=["']password["']|sign[\s-]?in|log[\s-]?in/i;
const LOGOUT_RE = /log[\s-]?out|sign[\s-]?out|sign out/i;
const AVATAR_RE = /avatar|user-menu|account-menu|profile-menu/i;
const DASHBOARD_RE = /\/(dashboard|account|home|profile|settings|member|portal)(\/|$|\?)/i;
const VERIFIED_RE = /verified badge|email verified|phone verified|account verified|verification complete/i;

export function evaluateGateClearance(
  gate: ExecutionGate,
  snap: PageWatcherSnapshot
): GateClearanceResult {
  if (!gate) {
    return { cleared: true, reasons: [], stillPresent: false, detail: {} };
  }

  const html = snap.html ?? '';
  const htmlLower = html.toLowerCase();
  const url = snap.url ?? '';
  const probes = snap.probes ?? {};
  const cookies = snap.cookieNames ?? [];
  const reasons: GateClearanceReason[] = [];
  const detail: Record<string, unknown> = { url, title: snap.title };

  const urlChanged =
    Boolean(snap.previousUrl) && snap.previousUrl !== url && !urlIncludesGate(url, gate);
  if (urlChanged) reasons.push('url_changed');

  const successBanner =
    probes.successBannerVisible === true || SUCCESS_RE.test(html) || SUCCESS_RE.test(snap.title ?? '');
  if (successBanner) reasons.push('success_banner');

  switch (gate) {
    case 'captcha': {
      const captchaInHtml = CAPTCHA_RE.test(html);
      const iframeVisible = probes.captchaIframeVisible === true;
      const containerVisible = probes.captchaContainerVisible === true;
      const stillPresent = captchaInHtml || iframeVisible || containerVisible;
      if (!stillPresent) reasons.push('captcha_gone');
      if (/grecaptcha\.getresponse|captcha[_-]?solved|data-captcha-solved=["']true/i.test(html)) {
        reasons.push('captcha_solved_flag');
      }
      if (probes.submitDisabled === false) reasons.push('submit_enabled');
      const cleared =
        (!stillPresent && (reasons.includes('captcha_gone') || urlChanged || successBanner)) ||
        (reasons.includes('captcha_solved_flag') && !iframeVisible) ||
        (reasons.includes('submit_enabled') && !stillPresent);
      return {
        cleared: Boolean(cleared),
        reasons: [...new Set(reasons)],
        stillPresent,
        detail: { ...detail, captchaInHtml, iframeVisible, containerVisible },
      };
    }
    case 'login': {
      const loginForm = LOGIN_FORM_RE.test(htmlLower);
      const logout = probes.logoutVisible === true || LOGOUT_RE.test(htmlLower);
      const avatar = probes.avatarVisible === true || AVATAR_RE.test(htmlLower);
      const authCookie = cookies.some((c) => AUTH_COOKIE_RE.test(c));
      const dashboard = DASHBOARD_RE.test(url);
      if (logout) reasons.push('logout_visible');
      if (avatar) reasons.push('avatar_visible');
      if (authCookie) reasons.push('auth_cookie');
      if (dashboard) reasons.push('dashboard_url');
      if (!loginForm) reasons.push('login_form_gone');
      const cleared =
        (!loginForm && (logout || avatar || authCookie || dashboard || urlChanged)) ||
        ((logout || avatar || authCookie) && !loginForm);
      return {
        cleared: Boolean(cleared),
        reasons: [...new Set(reasons)],
        stillPresent: loginForm && !logout && !avatar,
        detail: { ...detail, loginForm, logout, avatar, authCookie, dashboard },
      };
    }
    case 'mfa': {
      const mfaPresent = MFA_RE.test(htmlLower);
      if (!mfaPresent) reasons.push('mfa_cleared');
      if (successBanner) reasons.push('success_banner');
      const cleared = (!mfaPresent && (urlChanged || successBanner || reasons.includes('mfa_cleared'))) || successBanner;
      return {
        cleared: Boolean(cleared) && !mfaPresent,
        reasons: [...new Set(reasons)],
        stillPresent: mfaPresent,
        detail,
      };
    }
    case 'email_verify': {
      const present = EMAIL_VERIFY_RE.test(htmlLower);
      const verified =
        probes.verifiedBadgeVisible === true || VERIFIED_RE.test(htmlLower) || successBanner;
      if (verified) reasons.push('verified_badge');
      if (!present) reasons.push('account_activated');
      const cleared = verified || (!present && (urlChanged || successBanner));
      return {
        cleared: Boolean(cleared),
        reasons: [...new Set(reasons)],
        stillPresent: present && !verified,
        detail,
      };
    }
    case 'phone_verify': {
      const present = PHONE_VERIFY_RE.test(htmlLower) || (/otp|sms/i.test(htmlLower) && /verify/i.test(htmlLower));
      const verified = successBanner || VERIFIED_RE.test(htmlLower);
      if (verified) reasons.push('otp_cleared');
      if (!present) reasons.push('account_activated');
      const cleared = verified || (!present && urlChanged);
      return {
        cleared: Boolean(cleared),
        reasons: [...new Set(reasons)],
        stillPresent: present && !verified,
        detail,
      };
    }
    case 'human_approval':
      return { cleared: false, reasons: [], stillPresent: true, detail: { note: 'Requires explicit user approve' } };
    default:
      return { cleared: false, reasons: [], stillPresent: true, detail };
  }
}

function urlIncludesGate(url: string, gate: ExecutionGate): boolean {
  const u = url.toLowerCase();
  if (gate === 'captcha') return /captcha|challenge|turnstile/.test(u);
  if (gate === 'login') return /login|signin|sign-in|auth/.test(u);
  if (gate === 'mfa') return /mfa|2fa|otp|verify/.test(u);
  if (gate === 'email_verify') return /verify|confirm.*email|activation/.test(u);
  if (gate === 'phone_verify') return /phone|sms|otp|verify/.test(u);
  return false;
}

export function watchingStatusForGate(gate: ExecutionGate): string {
  switch (gate) {
    case 'captcha':
      return 'watching_captcha';
    case 'login':
      return 'watching_login';
    case 'mfa':
      return 'watching_mfa';
    case 'email_verify':
      return 'watching_email';
    case 'phone_verify':
      return 'watching_phone';
    default:
      return 'watching';
  }
}

export function blockedStatusForGate(gate: ExecutionGate): string {
  switch (gate) {
    case 'captcha':
      return 'blocked_captcha';
    case 'login':
      return 'needs_approval';
    case 'mfa':
      return 'blocked_mfa';
    case 'email_verify':
      return 'blocked_email_verify';
    case 'phone_verify':
      return 'blocked_phone_verify';
    case 'human_approval':
      return 'needs_approval';
    default:
      return 'paused';
  }
}
