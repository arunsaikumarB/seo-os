/**
 * Capability 1 — WordPress Intelligence fixtures (mock sites only).
 */
import { describe, expect, it } from 'vitest';
import {
  detectWordPress,
  detectWordPressPlugins,
  detectWordPressCommentForm,
  detectWordPressTheme,
  selectWordPressStrategy,
  buildWordPressKnowledge,
  enrichWithWordPressIntelligence,
  summarizeWordPressHealth,
} from '../src/wordpress-intelligence.js';
import { analyzeFetchedSite } from '../src/site-intelligence.js';
import { fingerprintSite } from '../src/site-fingerprint.js';
import { classifyPageIntent } from '../src/page-intent-detectors.js';

const WP_HOME = `
<html><head>
<meta name="generator" content="WordPress 6.4" />
<link rel="https://api.w.org/" href="https://mock.wp.test/wp-json/" />
<link href="/wp-content/themes/twentytwentyfour/style.css" />
<script src="/wp-includes/js/jquery.min.js"></script>
<link href="/wp-content/plugins/contact-form-7/includes/css/styles.css" />
<link href="/wp-content/plugins/wordpress-seo/css/main.css" />
</head>
<body>
<a href="/write-for-us">Write For Us</a>
<a href="/wp-login.php">Sign in</a>
</body></html>`;

const COMMENT_ARTICLE = `
<html><body class="single-post">
<article class="post"><h1>Hello</h1></article>
<div id="respond">
<h3>Leave a Reply</h3>
<form action="/wp-comments-post.php" method="post">
<textarea name="comment"></textarea>
<input name="author" />
<input name="email" />
<input name="url" />
<input type="hidden" name="comment_post_ID" value="12" />
<input type="submit" value="Post Comment" />
</form>
</div>
</body></html>`;

const WFU_FORM = `
<html><head><title>Write For Us</title></head>
<body>
<h1>Write For Us</h1>
<form>
<input name="title" /><textarea name="description"></textarea>
<input name="website" /><button>Submit</button>
</form>
</body></html>`;

const CONTACT_CF7 = `
<html><body>
<div class="wpcf7"><form class="wpcf7-form">
<input type="email" name="your-email" />
<textarea name="your-message"></textarea>
</form></div>
</body></html>`;

const EMAIL_GUIDELINES = `
<html><body>
<h1>Guest Post Guidelines</h1>
<p>Minimum 800 words. Email us at editor@wp-mock.test</p>
</body></html>`;

describe('WordPress detection + plugins', () => {
  it('requires multiple signals', () => {
    const weak = detectWordPress({
      html: '<a href="/wp-content/x">x</a>',
      url: 'https://a.test/',
    });
    expect(weak.detected).toBe(false);

    const strong = detectWordPress({ html: WP_HOME, url: 'https://mock.wp.test/' });
    expect(strong.detected).toBe(true);
    expect(strong.signals.length).toBeGreaterThanOrEqual(2);
    expect(strong.confidence).toBeGreaterThan(0.5);
  });

  it('detects theme and plugins', () => {
    expect(detectWordPressTheme(WP_HOME)).toBe('twentytwentyfour');
    const plugins = detectWordPressPlugins(WP_HOME);
    expect(plugins).toContain('Contact Form 7');
    expect(plugins).toContain('Yoast');
  });
});

describe('WordPress workflows', () => {
  it('selects Comment Posting with field hints', () => {
    const knowledge = buildWordPressKnowledge({
      homepageUrl: 'https://mock.wp.test/',
      pages: [
        { url: 'https://mock.wp.test/', html: WP_HOME, status: 'fetched' },
        { url: 'https://mock.wp.test/hello', html: COMMENT_ARTICLE, status: 'fetched' },
      ],
    })!;
    const pages = [
      classifyPageIntent({ html: COMMENT_ARTICLE, url: 'https://mock.wp.test/hello' }),
    ];
    const s = selectWordPressStrategy({
      pages,
      knowledge,
      pageHtmlByUrl: { 'https://mock.wp.test/hello': COMMENT_ARTICLE },
    });
    expect(s.wordpressStrategy).toBe('Comment Posting');
    expect(s.payloadHints.fields).toEqual(['comment', 'author', 'email', 'website']);
    expect(s.payloadHints.skip).toContain('article');
  });

  it('prefers Guest Post over comment when form exists', () => {
    const result = analyzeFetchedSite({
      homepageUrl: 'https://mock.wp.test/',
      pages: [
        { url: 'https://mock.wp.test/', html: WP_HOME, status: 'fetched', depth: 0 },
        {
          url: 'https://mock.wp.test/write-for-us',
          html: WFU_FORM,
          status: 'fetched',
          depth: 1,
        },
        {
          url: 'https://mock.wp.test/hello',
          html: COMMENT_ARTICLE,
          status: 'fetched',
          depth: 1,
        },
      ],
    });
    expect(result.fingerprint.platform).toBe('WordPress');
    expect(result.wordpress?.detected).toBe(true);
    expect(result.strategy.wordpressStrategy).toBe('Guest Post');
    expect(result.strategy.entryUrl).toContain('write-for-us');
  });

  it('selects Contact Form Submission for CF7', () => {
    const knowledge = buildWordPressKnowledge({
      homepageUrl: 'https://mock.wp.test/',
      pages: [
        { url: 'https://mock.wp.test/', html: WP_HOME, status: 'fetched' },
        { url: 'https://mock.wp.test/contact', html: CONTACT_CF7, status: 'fetched' },
      ],
    })!;
    expect(knowledge.contactFormPlugins).toContain('Contact Form 7');
    const pages = [
      classifyPageIntent({ html: CONTACT_CF7, url: 'https://mock.wp.test/contact' }),
    ];
    const s = selectWordPressStrategy({
      pages,
      knowledge,
      pageHtmlByUrl: { 'https://mock.wp.test/contact': CONTACT_CF7 },
    });
    expect(s.wordpressStrategy).toBe('Contact Form Submission');
  });

  it('email guidelines → outreach hints, not browser', () => {
    const result = analyzeFetchedSite({
      homepageUrl: 'https://mock.wp.test/',
      pages: [
        { url: 'https://mock.wp.test/', html: WP_HOME, status: 'fetched', depth: 0 },
        {
          url: 'https://mock.wp.test/guidelines',
          html: EMAIL_GUIDELINES,
          status: 'fetched',
          depth: 1,
        },
      ],
    });
    expect(result.strategy.wordpressStrategy).toBe('Email Outreach');
    expect(result.strategy.payloadHints?.moveToOutreach).toBe(true);
    expect(result.strategy.payloadHints?.emailAddress).toMatch(/editor@/);
  });

  it('comment detector matches WP signals', () => {
    const c = detectWordPressCommentForm(COMMENT_ARTICLE);
    expect(c.matched).toBe(true);
    expect(c.signals.some((s) => s.id === 'comment_post_id')).toBe(true);
  });
});

describe('WordPress health summary', () => {
  it('aggregates workflow counts', () => {
    const summary = summarizeWordPressHealth([
      {
        fingerprint: {
          platform: 'WordPress',
          wordpress: { detected: true, workflow: 'comment' } as never,
        },
      },
      {
        fingerprint: {
          platform: 'WordPress',
          wordpress: { detected: true, workflow: 'guest_post' } as never,
        },
      },
      { fingerprint: { platform: 'Ghost' } },
    ]);
    expect(summary.detected).toBe(2);
    expect(summary.comment).toBe(1);
    expect(summary.guestPost).toBe(1);
  });
});

describe('enrichment preserves non-WP', () => {
  it('does not force WordPress on markerless sites', () => {
    const fp = fingerprintSite({
      html: '<html><body>Hello</body></html>',
      url: 'https://custom.test/',
    });
    const enriched = enrichWithWordPressIntelligence({
      fingerprint: fp,
      pageClassifications: [],
      strategy: {
        chosen: 'Unsupported',
        reasoning: 'none',
        entryUrl: null,
        expectedInterventions: [],
        fallbacks: [],
      },
      guidelines: null,
      pages: [
        {
          url: 'https://custom.test/',
          html: '<html><body>Hello</body></html>',
          status: 'fetched',
          depth: 0,
        },
      ],
      homepageUrl: 'https://custom.test/',
    });
    expect(enriched.wordpress).toBeNull();
    expect(enriched.fingerprint.platform).toBe('Custom / Unknown');
  });
});
