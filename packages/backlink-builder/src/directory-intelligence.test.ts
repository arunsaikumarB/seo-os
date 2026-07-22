/**
 * Capability 2 — Directory Intelligence fixtures (mock sites only).
 */
import { describe, expect, it } from 'vitest';
import {
  detectDirectory,
  detectDirectoryPlatform,
  detectDirectoryPricing,
  detectDirectoryApproval,
  extractDirectoryFieldMap,
  extractDirectoryCategories,
  matchDirectoryCategory,
  selectDirectoryStrategy,
  buildDirectoryKnowledge,
  classifyDirectoryPageIntent,
  summarizeDirectoryHealth,
} from '../src/directory-intelligence.js';
import { analyzeFetchedSite } from '../src/site-intelligence.js';
import { classifyPageIntent } from '../src/page-intent-detectors.js';

const DIR_HOME = `
<html><head><title>Local Business Directory</title></head>
<body>
<h1>Business Directory</h1>
<p>Browse company listings and local listings in our yellow pages.</p>
<a href="/add-listing">Add Listing</a>
<a href="/categories">Business Categories</a>
<a href="/pricing">Pricing</a>
</body></html>`;

const ADD_LISTING = `
<html><head><title>Submit Listing</title></head>
<body>
<h1>Add Business</h1>
<p>Free listing — submit your business profile.</p>
<p>Listings pending approval within 2–3 business days.</p>
<form action="/submit" method="post">
<input name="business_name" />
<input name="website" />
<textarea name="description"></textarea>
<select name="category">
  <option>Technology</option>
  <option>Software</option>
  <option>Restaurants</option>
  <option>Business Services</option>
</select>
<input name="phone" />
<input name="email" />
<input name="city" />
<input name="state" />
<input name="zip" />
<button type="submit">Submit Listing</button>
</form>
</body></html>`;

const BDP_HOME = `
<html><head>
<link href="/wp-content/plugins/business-directory-plugin/assets/css/bdp.css" />
<meta name="generator" content="WordPress 6.4" />
</head>
<body>
<h1>Company Directory</h1>
<a href="/add-listing">Submit Listing</a>
<a href="/wpbdp_category/technology">Technology</a>
</body></html>`;

const PAID_ONLY = `
<html><body>
<h1>Business Directory</h1>
<p>Premium listing required. Pay to submit — $49/month paid listing.</p>
<a href="/pricing">Pricing plans</a>
<a href="/add-listing">Add Listing</a>
</body></html>`;

const CATEGORY_PAGE = `
<html><body>
<h1>Technology</h1>
<a href="/listings/acme">Acme Software</a>
</body></html>`;

describe('Directory detection + platform', () => {
  it('requires multiple signals', () => {
    const weak = detectDirectory({
      html: '<p>Directory of recipes</p>',
      url: 'https://a.test/',
    });
    expect(weak.detected).toBe(false);

    const strong = detectDirectory({ html: DIR_HOME, url: 'https://dir-mock.test/' });
    expect(strong.detected).toBe(true);
    expect(strong.signals.length).toBeGreaterThanOrEqual(2);
    expect(strong.confidence).toBeGreaterThan(0.5);
  });

  it('detects Business Directory Plugin', () => {
    const p = detectDirectoryPlatform(BDP_HOME, 'https://bdp-mock.test/');
    expect(p.platform).toBe('Business Directory Plugin');
    expect(p.confidence).toBeGreaterThanOrEqual(0.85);
  });
});

describe('Page intent — category vs submission', () => {
  it('never confuses category with submission', () => {
    const cat = classifyDirectoryPageIntent({
      html: CATEGORY_PAGE,
      url: 'https://dir-mock.test/category/technology',
    });
    expect(cat?.intent).toBe('Category');

    const sub = classifyDirectoryPageIntent({
      html: ADD_LISTING,
      url: 'https://dir-mock.test/add-listing',
    });
    expect(sub?.intent).toBe('Submission Form');
  });
});

describe('Fields, categories, pricing, approval', () => {
  it('extracts listing field map', () => {
    const map = extractDirectoryFieldMap(ADD_LISTING);
    expect(map.businessName).toBe(true);
    expect(map.website).toBe(true);
    expect(map.description).toBe(true);
    expect(map.category).toBe(true);
    expect(map.phone).toBe(true);
    expect(map.email).toBe(true);
    expect(map.city).toBe(true);
  });

  it('suggests category from business text', () => {
    const cats = extractDirectoryCategories(ADD_LISTING, 'https://dir-mock.test/add-listing');
    const suggestion = matchDirectoryCategory({
      businessText: 'Restaurant POS Software for cafes',
      categories: cats.length
        ? cats
        : [
            { name: 'Technology', url: null, parent: null },
            { name: 'Software', url: null, parent: null },
            { name: 'Restaurants', url: null, parent: null },
            { name: 'Business Services', url: null, parent: null },
          ],
    });
    expect(suggestion).not.toBeNull();
    expect(suggestion!.confidence).toBeGreaterThan(0.3);
    expect(['Technology', 'Software', 'Restaurants', 'Business Services']).toContain(
      suggestion!.category
    );
  });

  it('detects free + pending approval', () => {
    const pricing = detectDirectoryPricing(ADD_LISTING, 'https://dir-mock.test/add-listing');
    expect(pricing.freeListing).toBe(true);

    const approval = detectDirectoryApproval(ADD_LISTING);
    expect(approval.pendingApproval || approval.manualReview).toBe(true);
  });

  it('flags paid-only directories', () => {
    const pricing = detectDirectoryPricing(PAID_ONLY, 'https://paid.test/');
    expect(pricing.paidListing).toBe(true);
    expect(pricing.freeListing).toBe(false);
  });
});

describe('Directory strategies', () => {
  it('selects Direct Submission for free add-listing', () => {
    const knowledge = buildDirectoryKnowledge({
      homepageUrl: 'https://dir-mock.test/',
      pages: [
        { url: 'https://dir-mock.test/', html: DIR_HOME, status: 'fetched' },
        { url: 'https://dir-mock.test/add-listing', html: ADD_LISTING, status: 'fetched' },
      ],
      businessText: 'Restaurant POS Software',
    })!;
    expect(knowledge.detected).toBe(true);
    expect(knowledge.entryUrl).toContain('add-listing');

    const pages = [
      classifyPageIntent({ html: ADD_LISTING, url: 'https://dir-mock.test/add-listing' }),
    ];
    const s = selectDirectoryStrategy({
      pages,
      knowledge,
      pageHtmlByUrl: { 'https://dir-mock.test/add-listing': ADD_LISTING },
    });
    expect(s.directoryStrategy).toBe('Direct Submission');
    expect(s.entryUrl).toContain('add-listing');
    expect(s.payloadHints.paidListing).not.toBe(true);
  });

  it('routes paid-only to Premium Listing / Needs Review', () => {
    const knowledge = buildDirectoryKnowledge({
      homepageUrl: 'https://paid.test/',
      pages: [
        { url: 'https://paid.test/', html: PAID_ONLY, status: 'fetched' },
        {
          url: 'https://paid.test/add-listing',
          html: '<html><body><h1>Add Listing</h1><p>Pay $49 to submit</p><form></form></body></html>',
          status: 'fetched',
        },
      ],
    })!;
    const pages = [
      classifyPageIntent({
        html: '<form></form>',
        url: 'https://paid.test/add-listing',
      }),
    ];
    const s = selectDirectoryStrategy({
      pages,
      knowledge: {
        ...knowledge,
        pricing: {
          ...knowledge.pricing,
          paidListing: true,
          freeListing: false,
        },
      },
      pageHtmlByUrl: {},
    });
    expect(s.directoryStrategy).toBe('Premium Listing');
    expect(s.payloadHints.needsReview).toBe(true);
    expect(s.payloadHints.skip).toContain('payment');
  });

  it('analyzeFetchedSite wires entry_url + category suggestion', () => {
    const result = analyzeFetchedSite({
      homepageUrl: 'https://dir-mock.test/',
      pages: [
        {
          url: 'https://dir-mock.test/',
          html: DIR_HOME,
          status: 'fetched',
          depth: 0,
        },
        {
          url: 'https://dir-mock.test/add-listing',
          html: ADD_LISTING,
          status: 'fetched',
          depth: 1,
        },
      ],
      businessText: 'Restaurant POS Software',
    });
    expect(result.directory?.detected).toBe(true);
    expect(result.strategy.entryUrl).toContain('add-listing');
    expect(result.strategy.directoryStrategy).toBe('Direct Submission');
    expect(result.strategy.payloadHints?.categorySuggestion).toBeTruthy();
    expect(result.profileStatus).toBe('complete');
  });

  it('paid analyzeFetchedSite stays complete but needs review', () => {
    const result = analyzeFetchedSite({
      homepageUrl: 'https://paid.test/',
      pages: [
        { url: 'https://paid.test/', html: PAID_ONLY, status: 'fetched', depth: 0 },
        {
          url: 'https://paid.test/add-listing',
          html: '<html><body><h1>Business Directory</h1><p>Paid listing $99</p><form><input name="business_name"/></form></body></html>',
          status: 'fetched',
          depth: 1,
        },
      ],
    });
    expect(result.directory?.detected).toBe(true);
    expect(result.strategy.directoryStrategy).toBe('Premium Listing');
    expect(result.strategy.payloadHints?.needsReview).toBe(true);
    expect(result.profileStatus).toBe('complete');
  });
});

describe('Directory Health', () => {
  it('summarizes free/paid/supported counts', () => {
    const health = summarizeDirectoryHealth([
      {
        fingerprint: {
          directory: {
            detected: true,
            pricing: { freeListing: true, paidListing: false },
            workflow: 'direct_submission',
          },
        },
        strategy: { directoryStrategy: 'Direct Submission' },
      },
      {
        fingerprint: {
          directory: {
            detected: true,
            pricing: { freeListing: false, paidListing: true },
            workflow: 'premium',
          },
        },
        strategy: { directoryStrategy: 'Premium Listing', payloadHints: { paidListing: true } },
      },
    ] as Parameters<typeof summarizeDirectoryHealth>[0]);
    expect(health.detected).toBe(2);
    expect(health.free).toBe(1);
    expect(health.paid).toBe(1);
  });
});
