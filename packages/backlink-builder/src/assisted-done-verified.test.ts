/**
 * Assisted Manual — missing package heal + Done/Verified UX helpers.
 */
import { describe, expect, it } from 'vitest';
import {
  gateIsOtp,
  resolveAssistedVisualStatus,
} from './assisted-manual.js';

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

describe('canonical visual status (icon + badge)', () => {
  it('Submitted wins over stale blocked/login failureReason', () => {
    const v = resolveAssistedVisualStatus({
      status: 'done',
      submittedAt: '2026-07-28T10:00:00Z',
      blocked: true,
      failureReason: 'Gate: login — needs a person',
      bucket: 'needs_person',
      gate: 'login',
    });
    expect(v.visualStatus).toBe('submitted');
    expect(v.tone).toBe('ok');
    expect(v.badgeLabel).toBe('Submitted');
    expect(v.blocked).toBe(false);
    expect(v.needsHumanReview).toBe(false);
    expect(v.completedAt).toBe('2026-07-28T10:00:00Z');
  });

  it('Verified wins over submitted', () => {
    const v = resolveAssistedVisualStatus({
      status: 'done',
      submittedAt: '2026-07-28T10:00:00Z',
      userVerified: true,
      verifiedAt: '2026-07-28T11:00:00Z',
      blocked: true,
      gate: 'captcha',
    });
    expect(v.visualStatus).toBe('verified');
    expect(v.tone).toBe('ok');
    expect(v.badgeLabel).toBe('Verified');
  });

  it('OTP after submit stays green Submitted with needsHumanReview', () => {
    const v = resolveAssistedVisualStatus({
      status: 'done',
      submittedAt: '2026-07-28T10:00:00Z',
      gate: 'otp_email',
      bucket: 'check_fields',
    });
    expect(v.tone).toBe('ok');
    expect(v.badgeLabel).toBe('Submitted');
    expect(v.needsHumanReview).toBe(true);
  });

  it('unsubmitted login gate stays blocked Ban', () => {
    const v = resolveAssistedVisualStatus({
      status: 'not_started',
      blocked: true,
      gate: 'login',
      bucket: 'needs_person',
      failureReason: 'Login required',
    });
    expect(v.tone).toBe('block');
    expect(v.badgeLabel).toBeNull();
    expect(v.blocked).toBe(true);
  });
});
