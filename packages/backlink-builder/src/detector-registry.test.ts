import { describe, expect, it } from 'vitest';
import {
  evaluateDetectors,
  hasFillableSubmissionForm,
} from '../src/detector-registry.js';
import { detectInterventionSignals } from '../src/intervention-signals.js';

/** Mock-page fixtures — never hit real third-party sites (Phase 4.5 §11). */

const FIXTURES = {
  loginGated: `
    <html><body>
      <h1>Sign in</h1>
      <form action="/login">
        <input type="email" name="email" />
        <input type="password" name="password" />
        <button type="submit">Log in</button>
      </form>
    </body></html>`,
  navSignInWithForm: `
    <html><body>
      <header><nav><a href="/login">Sign in</a></nav></header>
      <form id="listing">
        <input name="title" placeholder="Listing title" />
        <textarea name="description"></textarea>
        <input name="website" placeholder="https://example.com" />
        <button type="submit">Submit listing</button>
      </form>
    </body></html>`,
  captchaGated: `
    <html><body>
      <form>
        <input name="title" />
        <textarea name="description"></textarea>
        <div class="g-recaptcha" data-sitekey="x"></div>
        <button type="submit">Submit</button>
      </form>
    </body></html>`,
  captchaTextOnly: `
    <html><body>
      <p>This site is protected by CAPTCHA technology.</p>
      <form>
        <input name="title" />
        <textarea name="description"></textarea>
        <button type="submit">Submit</button>
      </form>
    </body></html>`,
  approvalPending: `
    <html><body>
      <div class="result">Your submission is under review and awaiting approval.</div>
    </body></html>`,
  thankYou: `
    <html><body>
      <h1>Thank you</h1>
      <p>Thanks for your submission!</p>
    </body></html>`,
  unknownBlock: `
    <html><body>
      <div class="wall">Access restricted by custom enterprise SSO portal token exchange.</div>
      <button disabled>Continue</button>
    </body></html>`,
};

describe('Detector Registry — Phase 4.5 fixtures', () => {
  it('TP login: gated login form → Login Required', () => {
    const ev = evaluateDetectors({
      html: FIXTURES.loginGated,
      url: 'https://fixture.test/login',
    });
    expect(ev.primary?.claim).toBe('Login Required');
    expect(ev.primary?.matched).toBe(true);
    expect(ev.primary?.signals.some((s) => s.id === 'password_input')).toBe(true);
    expect(
      detectInterventionSignals(FIXTURES.loginGated, 'https://fixture.test/login').primaryGate
    ).toBe('login');
  });

  it('FP login killed: Sign in nav + fillable form → NOT Login Required', () => {
    expect(hasFillableSubmissionForm(FIXTURES.navSignInWithForm)).toBe(true);
    const ev = evaluateDetectors({
      html: FIXTURES.navSignInWithForm,
      url: 'https://fixture.test/submit',
    });
    expect(ev.primary?.detectorId === 'login').toBeFalsy();
    expect(detectInterventionSignals(FIXTURES.navSignInWithForm).primaryGate).not.toBe('login');
  });

  it('TP CAPTCHA: widget attached to form → CAPTCHA', () => {
    const ev = evaluateDetectors({ html: FIXTURES.captchaGated, url: 'https://fixture.test/f' });
    expect(ev.primary?.claim).toBe('CAPTCHA');
    expect(ev.primary?.signals.some((s) => s.id.includes('captcha'))).toBe(true);
  });

  it('FP CAPTCHA killed: text mention only → not CAPTCHA', () => {
    const ev = evaluateDetectors({ html: FIXTURES.captchaTextOnly, url: 'https://fixture.test/f' });
    expect(ev.primary?.detectorId === 'captcha').toBeFalsy();
    expect(detectInterventionSignals(FIXTURES.captchaTextOnly).primaryGate).not.toBe('captcha');
  });

  it('TP Manual Approval: under review message', () => {
    const ev = evaluateDetectors({
      html: FIXTURES.approvalPending,
      url: 'https://fixture.test/done',
      postSubmitHtml: FIXTURES.approvalPending,
    });
    expect(ev.primary?.claim).toBe('Manual Approval');
  });

  it('FP Manual Approval: thank-you page is not Manual Approval', () => {
    const ev = evaluateDetectors({
      html: FIXTURES.thankYou,
      url: 'https://fixture.test/thanks',
      postSubmitHtml: FIXTURES.thankYou,
    });
    expect(ev.primary?.claim === 'Manual Approval').toBeFalsy();
  });

  it('Unknown obstacle → Needs AI Review path (no Login guess)', () => {
    const signals = detectInterventionSignals(FIXTURES.unknownBlock, 'https://fixture.test/x', {
      blockedButUnknown: true,
    });
    expect(signals.primaryGate).toBe('needs_ai_review');
    expect(signals.primaryGate).not.toBe('login');
    const ev = evaluateDetectors(
      { html: FIXTURES.unknownBlock, url: 'https://fixture.test/x' },
      { blockedButUnknown: true }
    );
    expect(ev.primary).toBeNull();
    expect(ev.needsAiReview).toBe(true);
  });
});
