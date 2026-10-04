import { describe, expect, it } from 'vitest';
import { analyzeScannedPage } from '../../../../../packages/backlink-builder/src/url-scanner.ts';

describe('companion scanner verdict', () => {
  it('shows login required and does not treat the login form as a submission', () => {
    const verdict = analyzeScannedPage({
      requestedUrl: 'https://directory.test/login',
      finalUrl: 'https://directory.test/login',
      httpStatus: 200,
      renderedWith: 'browser',
      pages: [
        {
          url: 'https://directory.test/login',
          httpStatus: 200,
          html: '<h1>Log in</h1><form action="/session"><label>Email<input name="email"></label><input type="password" name="password"><button>Log in</button></form>',
        },
      ],
    });
    expect(verdict.truthStatus).toBe('login_required');
    expect(verdict.loginRequired).toBe(true);
    expect(verdict.submissionFormIndex).toBeNull();
  });

  it('shows captcha and no form as distinct verdicts', () => {
    const captcha = analyzeScannedPage({
      requestedUrl: 'https://directory.test/submit',
      finalUrl: 'https://directory.test/submit',
      httpStatus: 200,
      renderedWith: 'browser',
      pages: [
        {
          url: 'https://directory.test/submit',
          httpStatus: 200,
          html: '<form><input name="url"><div class="g-recaptcha"></div><button>Submit</button></form>',
        },
      ],
    });
    expect(captcha.truthStatus).toBe('captcha');
    const empty = analyzeScannedPage({
      requestedUrl: 'https://blog.test/post',
      finalUrl: 'https://blog.test/post',
      httpStatus: 200,
      renderedWith: 'browser',
      pages: [
        {
          url: 'https://blog.test/post',
          httpStatus: 200,
          html: '<article><h1>How to write</h1><p>No form here. Email editor@blog.test</p></article>',
        },
      ],
    });
    expect(empty.truthStatus).toBe('no_form');
    expect(empty.pageKind).toBe('article');
  });
});
