/**
 * Assisted Manual — missing package heal + Done/Verified UX helpers.
 */
import { describe, expect, it } from 'vitest';
import { gateIsOtp } from './assisted-manual.js';

/** Mirror of UI rule: Done & Verified only when no email/OTP confirmation remains. */
export function canDoneAndVerified(gate: string | null | undefined): boolean {
  const g = String(gate ?? 'none');
  if (gateIsOtp(g)) return false;
  return g === 'none' || g === '';
}

/** Post-Done label for OTP gates. */
export function submittedConfirmLabel(gate: string | null | undefined): string | null {
  const g = String(gate ?? '');
  if (g === 'otp_phone') {
    return 'Submitted — confirm via SMS, then Mark Verified.';
  }
  if (gateIsOtp(g)) {
    return 'Submitted — confirm via email, then Mark Verified.';
  }
  return null;
}

describe('Done / Verified UX rules', () => {
  it('allows Done & Verified only for gate=none', () => {
    expect(canDoneAndVerified('none')).toBe(true);
    expect(canDoneAndVerified(null)).toBe(true);
    expect(canDoneAndVerified('otp_email')).toBe(false);
    expect(canDoneAndVerified('otp_phone')).toBe(false);
    expect(canDoneAndVerified('captcha')).toBe(false);
    expect(canDoneAndVerified('login')).toBe(false);
  });

  it('labels OTP submissions for separate verify', () => {
    expect(submittedConfirmLabel('otp_email')).toMatch(/confirm via email/i);
    expect(submittedConfirmLabel('otp_phone')).toMatch(/confirm via SMS/i);
    expect(submittedConfirmLabel('none')).toBeNull();
  });
});
