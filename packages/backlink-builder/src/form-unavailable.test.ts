import { describe, expect, it } from 'vitest';
import {
  FORM_UNAVAILABLE_MESSAGE,
  formUnavailableMessage,
  htmlHasFormElement,
  isFormUnavailableFailure,
  looksLikeSpaShell,
} from './form-unavailable.js';

describe('form-unavailable', () => {
  it('detects SPA shells without forms', () => {
    const spa = `<!doctype html><html><body><div id="root"></div>
      <script src="/assets/index-react.js"></script></body></html>`;
    expect(looksLikeSpaShell(spa)).toBe(true);
    expect(htmlHasFormElement(spa)).toBe(false);
  });

  it('does not flag a normal form page as SPA-only', () => {
    const page = `<form id="submit"><input name="title"/><button>Go</button></form>`;
    expect(htmlHasFormElement(page)).toBe(true);
  });

  it('classifies no-form / no-html failures as form_unavailable', () => {
    expect(isFormUnavailableFailure('No submission form found — page has no <form> elements')).toBe(
      true
    );
    expect(isFormUnavailableFailure('No HTML fetched — HTTP blocked')).toBe(true);
    expect(isFormUnavailableFailure(FORM_UNAVAILABLE_MESSAGE)).toBe(true);
    expect(isFormUnavailableFailure('Gate: captcha — needs a person')).toBe(false);
    expect(formUnavailableMessage()).toBe(FORM_UNAVAILABLE_MESSAGE);
  });
});
