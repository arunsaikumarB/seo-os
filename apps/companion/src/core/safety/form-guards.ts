import type { DetectedField } from '../types';

const LOGIN_HINTS =
  /\b(password|passwd|passcode|current.?password|new.?password|confirm.?password|username|user.?name|login|sign.?in|signin|otp|one.?time|verification.?code|auth.?code|2fa|mfa|totp)\b/i;

const PAYMENT_HINTS =
  /\b(credit.?card|card.?number|cardnumber|cvv|cvc|ccv|expiry|exp.?date|expiration|billing|iban|routing.?number|account.?number|sort.?code|payment|paypal|stripe|ssn|social.?security)\b/i;

const CAPTCHA_HINTS =
  /\b(captcha|recaptcha|hcaptcha|turnstile|cf-turnstile|g-recaptcha)\b/i;

function signalsBlob(field: DetectedField): string {
  return [...field.signals, field.type, field.name, field.id, field.autocomplete].join(' ');
}

export function isPasswordField(field: DetectedField): boolean {
  return field.type === 'password';
}

export function looksLikeLoginField(field: DetectedField): boolean {
  if (isPasswordField(field)) return true;
  return LOGIN_HINTS.test(signalsBlob(field));
}

export function looksLikePaymentField(field: DetectedField): boolean {
  if (field.type === 'password') return false;
  return (
    field.autocomplete.includes('cc-') ||
    PAYMENT_HINTS.test(signalsBlob(field)) ||
    /^(cc-|card)/i.test(field.name) ||
    /^(cc-|card)/i.test(field.id)
  );
}

/** True when the field's enclosing <form> contains a password control. */
export function isInsideLoginForm(el: Element): boolean {
  const form = el.closest('form');
  if (!form) return false;
  if (form.querySelector('input[type="password"]')) return true;
  const action =
    (form.getAttribute('action') ?? '') + ' ' + (form.id ?? '') + ' ' + (form.className ?? '');
  return LOGIN_HINTS.test(action);
}

export function isInsidePaymentForm(el: Element): boolean {
  const form = el.closest('form');
  if (!form) return false;
  const blob =
    (form.getAttribute('action') ?? '') +
    ' ' +
    (form.id ?? '') +
    ' ' +
    (form.className ?? '') +
    ' ' +
    (form.textContent?.slice(0, 400) ?? '');
  if (PAYMENT_HINTS.test(blob)) return true;
  const inputs = form.querySelectorAll('input, select, textarea');
  for (const input of Array.from(inputs).slice(0, 40)) {
    const name = `${input.getAttribute('name') ?? ''} ${input.id} ${input.getAttribute('autocomplete') ?? ''}`;
    if (PAYMENT_HINTS.test(name) || /cc-|cardnumber|cvv/i.test(name)) return true;
  }
  return false;
}

export function isNearCaptcha(el: Element): boolean {
  const form = el.closest('form') ?? el.parentElement;
  if (!form) return false;
  const html = form.innerHTML?.slice(0, 8000) ?? '';
  if (CAPTCHA_HINTS.test(html)) return true;
  return Boolean(
    form.querySelector(
      '.g-recaptcha, .h-captcha, .cf-turnstile, iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"]'
    )
  );
}

export type SkipReason =
  | 'password'
  | 'login_form'
  | 'payment_form'
  | 'captcha_context'
  | 'unknown_field'
  | 'empty_profile_value'
  | 'low_confidence'
  | 'not_fillable';

/**
 * Safety gate — Phase 1 hard rules:
 * - Never fill login / password fields
 * - Never fill payment fields
 * - Never interact with CAPTCHA widgets
 * - Never click Submit (enforced in filler)
 */
export function shouldSkipField(field: DetectedField): { skip: boolean; reason: SkipReason | null } {
  if (isPasswordField(field) || looksLikeLoginField(field)) {
    return { skip: true, reason: 'password' };
  }
  if (isInsideLoginForm(field.element)) {
    return { skip: true, reason: 'login_form' };
  }
  if (looksLikePaymentField(field) || isInsidePaymentForm(field.element)) {
    return { skip: true, reason: 'payment_form' };
  }
  if (CAPTCHA_HINTS.test(signalsBlob(field))) {
    return { skip: true, reason: 'captcha_context' };
  }
  return { skip: false, reason: null };
}

export const SAFETY_POLICY = {
  neverClickSubmit: true,
  neverSolveCaptcha: true,
  neverFillLogin: true,
  neverFillPayment: true,
} as const;
