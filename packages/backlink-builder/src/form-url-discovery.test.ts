/**
 * Form URL discovery — intent links, form scoring, honest failure copy.
 */
import { describe, expect, it } from 'vitest';
import {
  collectKnownFormUrlHints,
  extractSubmissionCandidateLinks,
  formDiscoveryFailureMessage,
  isSubmissionIntentLink,
  pickBestFormPage,
  scoreSubmissionFormPage,
  submissionLinkScore,
} from './form-url-discovery.js';
import { buildAssistedPackage, buildSiteRecipe } from './assisted-manual.js';

const LANDING_HTML = `
<html><body>
  <a href="/about">About</a>
  <a href="/submit">Submit your site</a>
  <a href="/newsletter">Subscribe</a>
  <form><input type="search" name="q" /></form>
</body></html>`;

const FORM_HTML = `
<html><body>
  <h1>Add your site</h1>
  <form method="post">
    <label for="title">Title</label>
    <input id="title" name="title" type="text" />
    <label for="website">Website URL</label>
    <input id="website" name="website" type="url" />
    <label for="description">Description</label>
    <textarea id="description" name="description"></textarea>
    <label for="email">Email</label>
    <input id="email" name="email" type="email" />
    <button type="submit">Submit</button>
  </form>
</body></html>`;

const NEWSLETTER_HTML = `
<html><body>
  <form>
    <input type="email" name="email" placeholder="Subscribe to newsletter" />
    <button>Subscribe</button>
  </form>
</body></html>`;

describe('form-url-discovery', () => {
  it('scores submission intent links', () => {
    expect(isSubmissionIntentLink('/submit', 'Submit')).toBe(true);
    expect(isSubmissionIntentLink('/write-for-us', 'Write for us')).toBe(true);
    expect(isSubmissionIntentLink('/Linkman/form.php', 'Add URL')).toBe(true);
    expect(isSubmissionIntentLink('/about', 'About us')).toBe(false);
    expect(submissionLinkScore('https://ex.com/submit', 'Add your site')).toBeGreaterThan(
      submissionLinkScore('https://ex.com/blog', 'Latest post')
    );
  });

  it('extracts submission candidates from landing HTML', () => {
    const links = extractSubmissionCandidateLinks(
      LANDING_HTML,
      'https://ex.com/',
      'ex.com',
      0
    );
    expect(links.some((l) => l.url.includes('/submit'))).toBe(true);
    expect(links.every((l) => !l.url.includes('/about'))).toBe(true);
  });

  it('scores real submission forms above newsletter/search', () => {
    const form = scoreSubmissionFormPage(FORM_HTML);
    const news = scoreSubmissionFormPage(NEWSLETTER_HTML);
    const landing = scoreSubmissionFormPage(LANDING_HTML);
    expect(form.score).toBeGreaterThanOrEqual(4);
    expect(form.hasUrl).toBe(true);
    expect(news.ignorable || news.score < form.score).toBe(true);
    expect(landing.score).toBeLessThan(form.score);
  });

  it('picks the form page among fetched candidates', () => {
    const best = pickBestFormPage([
      { url: 'https://ex.com/', html: LANDING_HTML },
      { url: 'https://ex.com/submit', html: FORM_HTML },
      { url: 'https://ex.com/newsletter', html: NEWSLETTER_HTML },
    ]);
    expect(best?.url).toContain('/submit');
  });

  it('orders SI / cache hints ahead of meta', () => {
    const hints = collectKnownFormUrlHints('ex.com', {
      resolvedFormUrl: 'https://ex.com/submit',
      strategyEntryUrl: 'https://ex.com/write-for-us',
      metaEntryUrl: 'https://ex.com/',
    });
    expect(hints[0]).toContain('/submit');
    expect(hints).toContain('https://ex.com/write-for-us');
  });

  it('reports honest crawl failure copy', () => {
    const msg = formDiscoveryFailureMessage([
      'https://ex.com/',
      'https://ex.com/about',
      'https://ex.com/contact',
    ]);
    expect(msg).toMatch(/No submission form found after crawling 3 pages/);
    expect(msg).toContain('/');
    expect(msg).toContain('/about');
  });

  it('stores resolvedFormUrl on recipe and uses it as package Open URL', () => {
    const recipe = buildSiteRecipe({
      domain: 'ex.com',
      entryUrl: 'https://ex.com/',
      resolvedFormUrl: 'https://ex.com/submit',
      formDiscoveryPagesChecked: ['https://ex.com/', 'https://ex.com/submit'],
      formDiscoverySource: 'crawl',
      html: FORM_HTML,
    });
    expect(recipe.resolvedFormUrl).toBe('https://ex.com/submit');
    expect(recipe.entryUrl).toBe('https://ex.com/');

    const pkg = buildAssistedPackage({
      recipe,
      content: {
        title: 'T',
        businessName: 'B',
        shortDescription: 'Short description here.',
        longDescription:
          'A longer description that is definitely more than forty characters for the self-check.',
        url: 'https://go.ex.com',
        email: 'a@ex.com',
        phone: '+1 555 0100',
        address: '1 Main',
        categoryHints: [],
      },
      formFound: true,
    });
    expect(pkg.entryUrl).toBe('https://ex.com/submit');
    expect(pkg.importedEntryUrl).toBe('https://ex.com/');
  });

  it('uses discovery failure reason instead of bare No form found', () => {
    const recipe = buildSiteRecipe({
      domain: 'ex.com',
      entryUrl: 'https://ex.com/',
      html: LANDING_HTML,
    });
    const empty = {
      ...recipe,
      fields: [],
      formFingerprint: 'fp_missing',
      formDiscoveryPagesChecked: ['https://ex.com/', 'https://ex.com/about'],
      formDiscoverySource: 'none' as const,
    };
    const pkg = buildAssistedPackage({
      recipe: empty,
      content: {
        title: 'T',
        businessName: 'B',
        shortDescription: 'Short description here.',
        longDescription:
          'A longer description that is definitely more than forty characters for the self-check.',
        url: 'https://go.ex.com',
        email: 'a@ex.com',
        phone: '+1 555 0100',
        address: '1 Main',
        categoryHints: [],
      },
      formFound: false,
      discoveryFailureReason: formDiscoveryFailureMessage([
        'https://ex.com/',
        'https://ex.com/about',
      ]),
    });
    expect(pkg.failureReason).toMatch(/No submission form found after crawling 2 pages/);
    expect(pkg.failureReason).not.toBe('No form found');
  });
});
