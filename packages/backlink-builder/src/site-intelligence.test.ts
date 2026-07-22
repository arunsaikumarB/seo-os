/**
 * Phase 5 Site Intelligence — mock-site fixtures (never hit real third-party sites).
 */
import { describe, expect, it } from 'vitest';
import { fingerprintSite } from '../src/site-fingerprint.js';
import {
  buildPrioritizedFrontier,
  linkPriority,
  SIE_CRAWL_DEFAULTS,
} from '../src/site-crawl.js';
import { classifyPageIntent, hasContentSubmissionForm } from '../src/page-intent-detectors.js';
import { selectSubmissionStrategy } from '../src/site-strategy.js';
import { extractGuidelines, detectGuidelinesMismatch } from '../src/site-guidelines.js';
import {
  analyzeFetchedSite,
  recordStrategyOutcome,
  emptyLearning,
} from '../src/site-intelligence.js';

const WP_HOME = `
<html><head><meta name="generator" content="WordPress 6.4" />
<link href="/wp-content/themes/x/style.css" /></head>
<body>
<nav>
  <a href="/write-for-us">Write For Us</a>
  <a href="/login">Sign in</a>
  <a href="/blog/post-1">Article One</a>
  <a href="/blog/post-2">Article Two</a>
</nav>
${Array.from({ length: 200 }, (_, i) => `<a href="/posts/p${i}">Post ${i}</a>`).join('\n')}
</body></html>`;

const WFU_FORM = `
<html><head><title>Write For Us</title></head>
<body>
<h1>Write For Us</h1>
<form method="post">
  <input name="title" placeholder="Article title" />
  <textarea name="description" placeholder="Pitch / description"></textarea>
  <input name="website" placeholder="Your website URL" />
  <input type="file" name="featured" />
  <button type="submit">Submit</button>
</form>
</body></html>`;

const GUIDELINES = `
<html><body>
<h1>Guest Post Guidelines</h1>
<p>Minimum 800 words. Maximum 2000 words.</p>
<p>Do not promote gambling. Topics: SEO, marketing, SaaS.</p>
<p>Required: author bio and headshot.</p>
<p>Email us at editor@example.com to submit.</p>
</body></html>`;

const DASHBOARD_HOME = `
<html><body>
<a href="/login">Sign in</a>
<a href="/dashboard">My Dashboard</a>
</body></html>`;

const LOGIN_PAGE = `
<html><body>
<h1>Sign in</h1>
<form><input type="email" name="email" /><input type="password" name="password" />
<button>Log in</button></form>
</body></html>`;

const DASHBOARD_PAGE = `
<html><body><h1>Contributor Dashboard</h1><a href="/dashboard/submit">Submit post</a></body></html>`;

const NEWSLETTER_PAGE = `
<html><body>
<form><input type="email" name="newsletter" placeholder="Subscribe" /><button>Subscribe</button></form>
<form role="search"><input type="search" name="q" /></form>
<textarea name="comment" placeholder="Leave a comment"></textarea>
</body></html>`;

describe('Phase 5 fingerprint', () => {
  it('fingerprints WordPress with marker evidence', () => {
    const fp = fingerprintSite({ html: WP_HOME, url: 'https://mock.wp.test/' });
    expect(fp.platform).toBe('WordPress');
    expect(fp.signals.length).toBeGreaterThan(0);
    expect(fp.hints.loginUrlPatterns).toContain('/wp-login.php');
  });

  it('fingerprints Google Forms', () => {
    const fp = fingerprintSite({
      html: '<html></html>',
      url: 'https://docs.google.com/forms/d/abc/viewform',
    });
    expect(fp.platform).toBe('Google Forms');
  });

  it('Unknown when markerless', () => {
    const fp = fingerprintSite({
      html: '<html><body>Hello</body></html>',
      url: 'https://custom.mock.test/',
    });
    expect(fp.platform).toBe('Custom / Unknown');
    expect(fp.confidence).toBe(0);
  });
});

describe('Phase 5 bounded crawl', () => {
  it('prioritizes Write For Us and caps frontier ≤ maxPages-1', () => {
    const frontier = buildPrioritizedFrontier({
      homepageUrl: 'https://mock.wp.test/',
      homepageHtml: WP_HOME,
      domain: 'mock.wp.test',
      maxPages: SIE_CRAWL_DEFAULTS.maxPages,
      maxDepth: SIE_CRAWL_DEFAULTS.maxDepth,
    });
    expect(frontier.length).toBeLessThanOrEqual(SIE_CRAWL_DEFAULTS.maxPages - 1);
    expect(frontier[0]!.url).toMatch(/write-for-us/i);
    expect(linkPriority('/write-for-us', 'Write For Us')).toBeGreaterThan(
      linkPriority('/posts/p1', 'Post 1')
    );
  });
});

describe('Phase 5 page intent + core fix', () => {
  it('homepage Sign in does not block choosing public submission form', () => {
    const home = classifyPageIntent({ html: WP_HOME, url: 'https://mock.wp.test/' });
    const form = classifyPageIntent({
      html: WFU_FORM,
      url: 'https://mock.wp.test/write-for-us',
    });
    expect(form.intent).toBe('Submission Form');
    const strategy = selectSubmissionStrategy([
      home,
      classifyPageIntent({ html: LOGIN_PAGE, url: 'https://mock.wp.test/login' }),
      form,
    ]);
    expect(strategy.chosen).toBe('Direct Submission Form');
    expect(strategy.entryUrl).toBe('https://mock.wp.test/write-for-us');
    expect(strategy.expectedInterventions).toEqual([]);
  });

  it('disambiguates newsletter/search/comment from Submission Form', () => {
    expect(hasContentSubmissionForm(NEWSLETTER_PAGE)).toBe(false);
    const c = classifyPageIntent({
      html: NEWSLETTER_PAGE,
      url: 'https://mock.wp.test/post/1',
    });
    expect(c.intent).not.toBe('Submission Form');
  });

  it('guidelines page is not Submission Form; email outreach strategy', () => {
    const g = classifyPageIntent({
      html: GUIDELINES,
      url: 'https://mock.wp.test/guidelines',
    });
    expect(g.intent).toBe('Guest Post Guidelines');
    const extracted = extractGuidelines({
      html: GUIDELINES,
      url: 'https://mock.wp.test/guidelines',
    });
    expect(extracted.wordCount.min).toBe(800);
    expect(extracted.emailAddress).toBe('editor@example.com');
    const result = analyzeFetchedSite({
      homepageUrl: 'https://mock.wp.test/',
      pages: [
        { url: 'https://mock.wp.test/', html: WP_HOME, status: 'fetched', depth: 0 },
        {
          url: 'https://mock.wp.test/guidelines',
          html: GUIDELINES,
          status: 'fetched',
          depth: 1,
        },
      ],
    });
    expect(result.strategy.chosen).toBe('Email Outreach');
    expect(result.guidelines?.emailAddress).toBe('editor@example.com');
  });

  it('dashboard strategy expects Login Required', () => {
    const result = analyzeFetchedSite({
      homepageUrl: 'https://mock.dash.test/',
      pages: [
        { url: 'https://mock.dash.test/', html: DASHBOARD_HOME, status: 'fetched', depth: 0 },
        { url: 'https://mock.dash.test/login', html: LOGIN_PAGE, status: 'fetched', depth: 1 },
        {
          url: 'https://mock.dash.test/dashboard',
          html: DASHBOARD_PAGE,
          status: 'fetched',
          depth: 1,
        },
      ],
    });
    expect(result.strategy.chosen).toBe('Dashboard Submission');
    expect(result.strategy.expectedInterventions).toContain('Login Required');
  });
});

describe('Phase 5 guidelines mismatch + learning', () => {
  it('flags guidelines_mismatch without changing generation', () => {
    const g = extractGuidelines({ html: GUIDELINES, url: 'https://x.test/g' });
    const m = detectGuidelinesMismatch(g, { wordCount: 200, assets: [] });
    expect(m.mismatch).toBe(true);
    expect(m.reasons.some((r) => /word count/i.test(r))).toBe(true);
  });

  it('records strategy outcomes for learning reuse', () => {
    let learning = emptyLearning();
    learning = recordStrategyOutcome(learning, {
      strategy: 'Direct Submission Form',
      entryUrl: 'https://mock.wp.test/write-for-us',
      success: true,
    });
    expect(learning.strategyStats['Direct Submission Form']?.successes).toBe(1);
    expect(learning.submissionUrls[0]).toContain('write-for-us');
  });

  it('fallback chain preserved on strategy plan', () => {
    const pages = [
      classifyPageIntent({ html: WFU_FORM, url: 'https://a.test/write-for-us' }),
      classifyPageIntent({
        html: `<html><body><h1>Contact us</h1><form><input name="message"/><button>Send</button></form></body></html>`,
        url: 'https://a.test/contact',
      }),
    ];
    const s = selectSubmissionStrategy(pages);
    expect(s.chosen).toBe('Direct Submission Form');
    expect(s.fallbacks.some((f) => f.strategy === 'Contact Form')).toBe(true);
  });
});
