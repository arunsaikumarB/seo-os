import { describe, expect, it } from 'vitest';
import { analyzeScannedPage } from './url-scanner.js';

function scan(partial: Parameters<typeof analyzeScannedPage>[0]) {
  return analyzeScannedPage(partial);
}

describe('url scanner verdicts', () => {
  it('stops on DNS, timeout, HTTP errors, SSL, and parked domains', () => {
    const dns = scan({
      requestedUrl: 'https://gone.example',
      finalUrl: null,
      httpStatus: null,
      fetchError: 'getaddrinfo ENOTFOUND gone.example',
      pages: [],
      renderedWith: 'fixture',
    });
    expect(dns.broken).toBe(true);
    expect(dns.stop).toBe(true);
    expect(dns.brokenReason).toMatch(/DNS failure/);
    expect(dns.truthStatus).toBe('broken');
    expect(dns.nextAction).toMatch(/Stop/);

    const timeout = scan({
      requestedUrl: 'https://slow.example',
      finalUrl: null,
      httpStatus: null,
      fetchError: 'The operation was aborted due to timeout',
      pages: [],
      renderedWith: 'fixture',
    });
    expect(timeout.brokenReason).toMatch(/Timeout/);

    const missing = scan({
      requestedUrl: 'https://missing.example/submit',
      finalUrl: 'https://missing.example/submit',
      httpStatus: 404,
      pages: [{ url: 'https://missing.example/submit', html: '<h1>Not found</h1>', httpStatus: 404 }],
      renderedWith: 'fixture',
    });
    expect(missing.brokenReason).toBe('HTTP 404');
    expect(missing.stop).toBe(true);

    const down = scan({
      requestedUrl: 'https://down.example',
      finalUrl: 'https://down.example',
      httpStatus: 503,
      pages: [{ url: 'https://down.example', html: '<h1>unavailable</h1>', httpStatus: 503 }],
      renderedWith: 'fixture',
    });
    expect(down.brokenReason).toBe('HTTP 503');

    const ssl = scan({
      requestedUrl: 'https://bad-cert.example',
      finalUrl: null,
      httpStatus: null,
      fetchError: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      pages: [],
      renderedWith: 'fixture',
    });
    expect(ssl.brokenReason).toMatch(/SSL error/);

    const parked = scan({
      requestedUrl: 'https://parked.example',
      finalUrl: 'https://parked.example',
      httpStatus: 200,
      pages: [{ url: 'https://parked.example', html: '<title>This domain is for sale</title>', httpStatus: 200 }],
      renderedWith: 'fixture',
    });
    expect(parked.parked).toBe(true);
    expect(parked.stop).toBe(true);
    expect(parked.brokenReason).toMatch(/Parked/);
  });

  it('reports the final URL after a redirect', () => {
    const verdict = scan({
      requestedUrl: 'http://dir.example/submit',
      finalUrl: 'https://dir.example/add.html',
      httpStatus: 200,
      pages: [{ url: 'https://dir.example/add.html', html: '<form><input name="url"><textarea name="description"></textarea><button>Submit</button></form>', httpStatus: 200 }],
      renderedWith: 'fixture',
    });
    expect(verdict.redirected).toBe(true);
    expect(verdict.finalUrl).toBe('https://dir.example/add.html');
    expect(verdict.broken).toBe(false);
  });

  it('says login required and does not treat the login form as a submission', () => {
    const html = '<form action="/login"><h1>Sign in</h1><input type="email" name="email"><input type="password"><button>Log in</button></form>';
    const verdict = scan({
      requestedUrl: 'https://forum.example/login',
      finalUrl: 'https://forum.example/login',
      httpStatus: 200,
      pages: [{ url: 'https://forum.example/login', html, httpStatus: 200 }],
      renderedWith: 'fixture',
    });
    expect(verdict.loginRequired).toBe(true);
    expect(verdict.truthStatus).toBe('login_required');
    expect(verdict.loginUrl).toContain('/login');
    expect(verdict.submissionFormIndex).toBeNull();
    expect(verdict.forms.some((f) => f.kind === 'login')).toBe(true);
    expect(verdict.nextAction).toMatch(/Login required first/);
  });

  it('pauses for captcha and cloudflare', () => {
    const captcha = scan({
      requestedUrl: 'https://dir.example/submit',
      finalUrl: 'https://dir.example/submit',
      httpStatus: 200,
      pages: [{
        url: 'https://dir.example/submit',
        html: '<form><input name="website"><textarea name="description"></textarea><div class="g-recaptcha"></div><button>Submit</button></form>',
        httpStatus: 200,
      }],
      renderedWith: 'fixture',
    });
    expect(captcha.captcha).toBe(true);
    expect(captcha.truthStatus).toBe('captcha');
    expect(captcha.nextAction).toMatch(/will not click Submit/);

    const cf = scan({
      requestedUrl: 'https://cf.example',
      finalUrl: 'https://cf.example',
      httpStatus: 403,
      pages: [{ url: 'https://cf.example', html: '<title>Just a moment...</title><div id="challenge-platform"></div>', httpStatus: 403 }],
      renderedWith: 'fixture',
    });
    expect(cf.broken).toBe(false);
    expect(cf.cloudflare).toBe(true);
    expect(cf.truthStatus).toBe('captcha');
    expect(cf.nextAction).toMatch(/person has to clear it/);

    const datadome = scan({
      requestedUrl: 'https://www.yelp.com/',
      finalUrl: 'https://www.yelp.com/',
      httpStatus: 403,
      pages: [{
        url: 'https://www.yelp.com/',
        html: '<p>Please enable JS and disable any ad blocker</p><script src="https://ct.captcha-delivery.com/c.js"></script>',
        httpStatus: 403,
      }],
      renderedWith: 'fixture',
    });
    expect(datadome.broken).toBe(false);
    expect(datadome.captcha).toBe(true);
    expect(datadome.truthStatus).toBe('captcha');
  });

  it('says no form and names the page, with outreach only when an email exists', () => {
    const article = scan({
      requestedUrl: 'https://blog.example/post',
      finalUrl: 'https://blog.example/post',
      httpStatus: 200,
      pages: [{
        url: 'https://blog.example/post',
        html: '<article><h1>How to bake</h1><p>Email editor@blog.example for guest posts.</p></article>',
        httpStatus: 200,
      }],
      renderedWith: 'fixture',
    });
    expect(article.noForm).toBe(true);
    expect(article.truthStatus).toBe('no_form');
    expect(article.pageKind).toBe('article');
    expect(article.contactEmails).toContain('editor@blog.example');
    expect(article.nextAction).toMatch(/outreach email to editor@blog.example/);

    const home = scan({
      requestedUrl: 'https://plain.example/',
      finalUrl: 'https://plain.example/',
      httpStatus: 200,
      pages: [{ url: 'https://plain.example/', html: '<html><body><h1>Welcome</h1><p>A company homepage.</p></body></html>', httpStatus: 200 }],
      renderedWith: 'fixture',
    });
    expect(home.pageKind).toBe('homepage');
    expect(home.nextAction).toMatch(/none/);
  });

  it('lists every form and marks the submission form', () => {
    const html = `
      <form action="/search"><input type="search" name="q"></form>
      <form action="/newsletter"><input type="email" name="email"><button>Subscribe</button></form>
      <form action="/contact"><input type="email" name="email"><textarea name="message"></textarea></form>
      <form action="/comment"><textarea name="comment"></textarea></form>
      <form action="/login"><input type="password" name="password"><button>Log in</button></form>
      <form action="/submit"><label for="u">Website URL</label><input id="u" name="url"><label for="d">Description</label><textarea id="d" name="description"></textarea><button>Submit site</button></form>
      <a href="https://other.example/about" rel="nofollow">Other</a>
      <a href="https://third.example/" >Third</a>
    `;
    const verdict = scan({
      requestedUrl: 'https://dir.example/submit',
      finalUrl: 'https://dir.example/submit',
      httpStatus: 200,
      pages: [{ url: 'https://dir.example/submit', html, httpStatus: 200 }],
      renderedWith: 'fixture',
      requestedCategory: 'directory',
    });
    const kinds = verdict.forms.map((f) => f.kind).sort();
    expect(kinds).toEqual(['comment', 'contact', 'login', 'newsletter', 'search', 'submission'].sort());
    expect(verdict.forms.filter((f) => f.isBacklinkSubmission)).toHaveLength(1);
    expect(verdict.submissionFormIndex).not.toBeNull();
    const submission = verdict.forms[verdict.submissionFormIndex!];
    expect(submission.fields.map((f) => f.name)).toEqual(expect.arrayContaining(['url', 'description']));
    expect(verdict.linkPolicy).toBe('mixed');
    expect(verdict.categoryFit).toBe('match');
    expect(verdict.stop).toBe(false);
  });

  it('does not treat an HTML comment as a comment form', () => {
    const verdict = scan({
      requestedUrl: 'https://dir.example/submit',
      finalUrl: 'https://dir.example/submit',
      httpStatus: 200,
      pages: [{
        url: 'https://dir.example/submit',
        html: '<form><!-- comment --><input name="URL"><input name="BUSINESS_NAME"><button>Add my Site</button></form>',
        httpStatus: 200,
      }],
      renderedWith: 'fixture',
    });
    expect(verdict.forms[0]?.kind).toBe('submission');
    expect(verdict.forms[0]?.isBacklinkSubmission).toBe(true);
  });

  it('reads noindex', () => {
    const verdict = scan({
      requestedUrl: 'https://blog.example/hidden',
      finalUrl: 'https://blog.example/hidden',
      httpStatus: 200,
      robotsMeta: 'noindex, nofollow',
      pages: [{ url: 'https://blog.example/hidden', html: '<p>Hidden</p>', httpStatus: 200 }],
      renderedWith: 'fixture',
    });
    expect(verdict.robotsNoindex).toBe(true);
    expect(verdict.indexable).toBe(false);
  });
});
