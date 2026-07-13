/**
 * PageWatcher / gate clearance — never bypasses protected steps.
 */
import { describe, expect, it } from 'vitest';
import {
  evaluateGateClearance,
  watchingStatusForGate,
  blockedStatusForGate,
} from '../src/page-watcher.js';
import {
  watchingStatusFromBlocker,
  isWatchableGate,
  gateStatusFromBlocker,
} from '../src/browser-execution.js';

describe('page watcher gate clearance', () => {
  it('does not clear captcha while iframe/container present', () => {
    const r = evaluateGateClearance('captcha', {
      html: '<div class="g-recaptcha" data-sitekey="x"></div>',
      url: 'https://example.com/submit',
      probes: { captchaIframeVisible: true, captchaContainerVisible: true },
    });
    expect(r.cleared).toBe(false);
    expect(r.stillPresent).toBe(true);
  });

  it('clears captcha when gone and submit enabled', () => {
    const r = evaluateGateClearance('captcha', {
      html: '<form><button type="submit">Send</button></form>',
      url: 'https://example.com/submit',
      previousUrl: 'https://example.com/submit?captcha=1',
      probes: {
        captchaIframeVisible: false,
        captchaContainerVisible: false,
        submitDisabled: false,
      },
    });
    expect(r.cleared).toBe(true);
    expect(r.reasons).toContain('captcha_gone');
  });

  it('clears login when logout + auth cookie and no password field', () => {
    const r = evaluateGateClearance('login', {
      html: '<a href="/logout">Log out</a><div class="avatar"></div>',
      url: 'https://example.com/dashboard',
      cookieNames: ['session', 'sid'],
      probes: { logoutVisible: true, avatarVisible: true },
    });
    expect(r.cleared).toBe(true);
    expect(r.reasons).toEqual(
      expect.arrayContaining(['logout_visible', 'avatar_visible', 'auth_cookie', 'dashboard_url'])
    );
  });

  it('clears email verify on verified badge', () => {
    const r = evaluateGateClearance('email_verify', {
      html: '<div>Email verified — account activated</div>',
      url: 'https://example.com/welcome',
      previousUrl: 'https://example.com/verify-email',
      probes: { verifiedBadgeVisible: true, successBannerVisible: true },
    });
    expect(r.cleared).toBe(true);
  });

  it('clears phone/otp when verification success appears', () => {
    const r = evaluateGateClearance('phone_verify', {
      html: '<div role="alert">Phone verified successfully</div>',
      url: 'https://example.com/account',
      previousUrl: 'https://example.com/verify-phone',
      probes: { successBannerVisible: true },
    });
    expect(r.cleared).toBe(true);
  });

  it('never auto-clears human_approval', () => {
    const r = evaluateGateClearance('human_approval', {
      html: '<div>Approve</div>',
      url: 'https://example.com',
    });
    expect(r.cleared).toBe(false);
  });

  it('maps watching / blocked statuses', () => {
    expect(watchingStatusForGate('captcha')).toBe('watching_captcha');
    expect(blockedStatusForGate('login')).toBe('needs_approval');
    expect(watchingStatusFromBlocker('mfa')).toBe('watching_mfa');
    expect(gateStatusFromBlocker('email_verify')).toBe('blocked_email_verify');
    expect(isWatchableGate('captcha')).toBe(true);
    expect(isWatchableGate('human_approval')).toBe(false);
  });
});
