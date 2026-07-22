/**
 * Capability 1 — WordPress Intelligence.
 * Extends Site Intelligence with deep WordPress knowledge.
 * Does not replace SIE, CSM, BEE, or AI Review.
 */
import type { DetectorSignal } from './detector-registry.js';
import type { ClassifiedPage, PageIntent } from './page-intent-detectors.js';
import { classifyPageIntent, hasContentSubmissionForm } from './page-intent-detectors.js';
import { extractGuidelines, type SiteGuidelines } from './site-guidelines.js';
import type { SiteFingerprint } from './site-fingerprint.js';
import type {
  ExpectedIntervention,
  StrategyPlan,
  SubmissionStrategyName,
} from './site-strategy.js';

export const WP_PLUGINS = [
  'Contact Form 7',
  'Gravity Forms',
  'WPForms',
  'Ninja Forms',
  'Elementor Forms',
  'Fluent Forms',
  'Jetpack Forms',
  'Yoast',
  'RankMath',
  'Classic Editor',
  'Gutenberg',
  'WooCommerce',
  'MemberPress',
  'Ultimate Member',
  'BuddyPress',
] as const;

export type WpPluginName = (typeof WP_PLUGINS)[number];

export type WordPressAuthorSystem = {
  hasWpLogin: boolean;
  hasWpAdmin: boolean;
  hasRegistration: boolean;
  hasBecomeAuthor: boolean;
  hasDashboard: boolean;
  membershipPlugins: WpPluginName[];
};

export type WordPressKnowledge = {
  detected: boolean;
  confidence: number;
  signals: DetectorSignal[];
  theme: string | null;
  plugins: WpPluginName[];
  authorSystem: WordPressAuthorSystem;
  commentForms: Array<{ url: string; signals: string[] }>;
  contactFormPlugins: WpPluginName[];
  writeForUs: {
    urls: string[];
    guidelines: SiteGuidelines | null;
  };
  workflow:
    | 'comment'
    | 'guest_post'
    | 'dashboard'
    | 'registration'
    | 'contact_form'
    | 'email'
    | 'google_form'
    | 'unsupported'
    | null;
};

export type WordPressLearning = {
  theme: string | null;
  plugins: string[];
  submissionMethod: string | null;
  successfulUrl: string | null;
  successfulForm: string | null;
  requiredFields: string[];
  executionTimeMs: number | null;
  successRate: number | null;
  failures: Array<{ at: string; reason: string }>;
};

function sig(id: string, kind: DetectorSignal['kind'], detail: string): DetectorSignal {
  return { id, kind, detail };
}

const WP_SIGNAL_TESTS: Array<{
  id: string;
  kind: DetectorSignal['kind'];
  test: (html: string, url: string) => boolean;
  detail: string;
}> = [
  { id: 'wp_content', kind: 'dom', test: (h) => /wp-content\//i.test(h), detail: 'wp-content' },
  { id: 'wp_includes', kind: 'dom', test: (h) => /wp-includes\//i.test(h), detail: 'wp-includes' },
  { id: 'wp_json', kind: 'dom', test: (h) => /wp-json\//i.test(h), detail: 'wp-json' },
  { id: 'xmlrpc', kind: 'dom', test: (h) => /xmlrpc\.php/i.test(h), detail: 'xmlrpc.php' },
  {
    id: 'wp_admin',
    kind: 'url',
    test: (h, u) => /wp-admin/i.test(h) || /wp-admin/i.test(u),
    detail: 'wp-admin',
  },
  {
    id: 'wp_login',
    kind: 'url',
    test: (h, u) => /wp-login\.php/i.test(h) || /wp-login\.php/i.test(u),
    detail: 'wp-login.php',
  },
  {
    id: 'generator',
    kind: 'dom',
    test: (h) => /<meta[^>]+name=["']generator["'][^>]*wordpress/i.test(h),
    detail: 'generator meta',
  },
  {
    id: 'rest_link',
    kind: 'dom',
    test: (h) => /<link[^>]+wp-json/i.test(h) || /rel=["']https:\/\/api\.w\.org\//i.test(h),
    detail: 'REST API link',
  },
  {
    id: 'rss',
    kind: 'dom',
    test: (h) => /application\/rss\+xml|\/feed\/?/i.test(h),
    detail: 'RSS / feed',
  },
  {
    id: 'theme_assets',
    kind: 'dom',
    test: (h) => /wp-content\/themes\//i.test(h),
    detail: 'theme assets',
  },
];

const PLUGIN_PATTERNS: Array<{ name: WpPluginName; re: RegExp }> = [
  { name: 'Contact Form 7', re: /contact-form-7|wpcf7/i },
  { name: 'Gravity Forms', re: /gravityforms|gform_|gf_browser/i },
  { name: 'WPForms', re: /wpforms/i },
  { name: 'Ninja Forms', re: /ninja-forms|nf-form/i },
  { name: 'Elementor Forms', re: /elementor-form|elementor-widget-form/i },
  { name: 'Fluent Forms', re: /fluentform|fluent-form/i },
  { name: 'Jetpack Forms', re: /jetpack.*form|jp-contact-form|grunion/i },
  { name: 'Yoast', re: /yoast|wordpress-seo|yoast-schema/i },
  { name: 'RankMath', re: /rank-math|rankmath/i },
  { name: 'Classic Editor', re: /classic-editor/i },
  { name: 'Gutenberg', re: /wp-block-|wp-includes\/js\/dist\/blocks/i },
  { name: 'WooCommerce', re: /woocommerce|wc-block/i },
  { name: 'MemberPress', re: /memberpress|mepr-/i },
  { name: 'Ultimate Member', re: /ultimate-member|um-/i },
  { name: 'BuddyPress', re: /buddypress|bp-nouveau/i },
];

const CONTACT_FORM_PLUGINS: WpPluginName[] = [
  'Contact Form 7',
  'Gravity Forms',
  'WPForms',
  'Ninja Forms',
  'Elementor Forms',
  'Fluent Forms',
  'Jetpack Forms',
];

const MEMBERSHIP_PLUGINS: WpPluginName[] = [
  'MemberPress',
  'Ultimate Member',
  'BuddyPress',
];

/** Multi-signal WordPress detection — never a single marker. */
export function detectWordPress(params: {
  html: string;
  url: string;
  robotsTxt?: string | null;
  feedHtml?: string | null;
}): { detected: boolean; confidence: number; signals: DetectorSignal[] } {
  const html = `${params.html}\n${params.robotsTxt ?? ''}\n${params.feedHtml ?? ''}`;
  const url = params.url;
  const signals: DetectorSignal[] = [];
  for (const t of WP_SIGNAL_TESTS) {
    if (t.test(html, url)) signals.push(sig(t.id, t.kind, t.detail));
  }
  if (params.robotsTxt && /wp-admin|wp-includes/i.test(params.robotsTxt)) {
    signals.push(sig('robots_wp', 'text', 'robots.txt WordPress paths'));
  }
  // Require ≥2 independent signals for a positive claim
  const detected = signals.length >= 2;
  const confidence = detected
    ? Math.min(0.99, 0.4 + signals.length * 0.08)
    : signals.length === 1
      ? 0.35
      : 0;
  return { detected, confidence, signals };
}

export function detectWordPressTheme(html: string): string | null {
  const m = html.match(/wp-content\/themes\/([a-z0-9_-]+)/i);
  return m?.[1] ?? null;
}

export function detectWordPressPlugins(html: string): WpPluginName[] {
  const found: WpPluginName[] = [];
  for (const p of PLUGIN_PATTERNS) {
    if (p.re.test(html) && !found.includes(p.name)) found.push(p.name);
  }
  return found;
}

/** WordPress comment form — Comment Posting strategy signals. */
export function detectWordPressCommentForm(html: string): {
  matched: boolean;
  confidence: number;
  signals: DetectorSignal[];
} {
  const signals: DetectorSignal[] = [];
  if (/textarea[^>]*(name|id)=["']comment["']/i.test(html))
    signals.push(sig('comment_textarea', 'selector', 'textarea[name=comment]'));
  if (/name=["']comment_post_ID["']|comment_post_ID/i.test(html))
    signals.push(sig('comment_post_id', 'dom', 'comment_post_ID'));
  if (/name=["']author["']/i.test(html)) signals.push(sig('author', 'dom', 'author field'));
  if (/name=["']email["']/i.test(html) && /comment/i.test(html))
    signals.push(sig('email', 'dom', 'email field'));
  if (/name=["']url["']/i.test(html) && /comment/i.test(html))
    signals.push(sig('website', 'dom', 'website/url field'));
  if (/leave\s+a?\s*reply|post\s+comment|add\s+comment/i.test(html))
    signals.push(sig('reply_copy', 'text', 'Leave Reply / Post Comment'));
  const matched = signals.length >= 2;
  return {
    matched,
    confidence: matched ? Math.min(0.95, 0.5 + signals.length * 0.1) : 0,
    signals,
  };
}

export function detectWordPressAuthorSystem(
  html: string,
  url: string,
  plugins: WpPluginName[]
): WordPressAuthorSystem {
  const blob = `${html}\n${url}`;
  return {
    hasWpLogin: /wp-login\.php/i.test(blob),
    hasWpAdmin: /wp-admin/i.test(blob),
    hasRegistration:
      /wp-login\.php\?action=register|\/register|\/signup|create.?account/i.test(blob),
    hasBecomeAuthor: /become\s+(an?\s+)?author|contributor|guest\s+contributor/i.test(blob),
    hasDashboard: /wp-admin|dashboard|member\s+area/i.test(blob),
    membershipPlugins: plugins.filter((p) => MEMBERSHIP_PLUGINS.includes(p)),
  };
}

export function detectWriteForUsSignals(html: string, url: string): {
  matched: boolean;
  signals: DetectorSignal[];
} {
  const signals: DetectorSignal[] = [];
  if (/write[\s-]?for[\s-]?us|guest[\s-]?post|become\s+author|contributor/i.test(url))
    signals.push(sig('wfu_url', 'url', url));
  if (
    /<(?:h1|h2)[^>]*>[^<]*(write\s+for\s+us|guest\s+post|become\s+an?\s+author|write\s+an?\s+article)[^<]*</i.test(
      html
    )
  ) {
    signals.push(sig('wfu_heading', 'text', 'WFU heading'));
  }
  if (/guest\s+contributor|write\s+an?\s+article|submit\s+a\s+guest/i.test(html))
    signals.push(sig('wfu_copy', 'text', 'guest contributor copy'));
  return { matched: signals.length > 0, signals };
}

/** WordPress-specific page intents (Blog / Tag / Archive / Search / Author). */
export function classifyWordPressPageIntent(params: {
  html: string;
  url: string;
}): ClassifiedPage | null {
  const { html, url } = params;
  const path = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  })();

  const comment = detectWordPressCommentForm(html);
  if (comment.matched && !hasContentSubmissionForm(html)) {
    return {
      url,
      intent: 'Comment Form',
      confidence: comment.confidence,
      detectorId: 'page_comment',
      signals: comment.signals,
    };
  }

  if (/\/tag\//i.test(path) || /rel=["']tag["']/i.test(html)) {
    return {
      url,
      intent: 'Category',
      confidence: 0.75,
      detectorId: 'page_category',
      signals: [sig('wp_tag', 'url', path)],
    };
  }
  if (/\/category\//i.test(path)) {
    return {
      url,
      intent: 'Category',
      confidence: 0.8,
      detectorId: 'page_category',
      signals: [sig('wp_category', 'url', path)],
    };
  }
  if (/\/author\//i.test(path) || /class=["'][^"']*author["']/i.test(html)) {
    return {
      url,
      intent: 'Article',
      confidence: 0.7,
      detectorId: 'page_article',
      signals: [sig('wp_author', 'url', path)],
    };
  }
  if (/[?&]s=/i.test(url) || /search-results|search-form/i.test(html)) {
    return {
      url,
      intent: 'Unsupported',
      confidence: 0.6,
      detectorId: 'unsupported',
      signals: [sig('wp_search', 'url', url)],
    };
  }
  if (/\/(page\/\d+|archive)/i.test(path) || /class=["'][^"']*archive["']/i.test(html)) {
    return {
      url,
      intent: 'Category',
      confidence: 0.65,
      detectorId: 'page_category',
      signals: [sig('wp_archive', 'url', path)],
    };
  }
  if (
    /single-post|postid-|type-post|class=["'][^"']*\bpost\b/i.test(html) &&
    !hasContentSubmissionForm(html)
  ) {
    return {
      url,
      intent: 'Article',
      confidence: 0.72,
      detectorId: 'page_article',
      signals: [sig('wp_article', 'dom', 'post markers')],
    };
  }
  if (/blog|posts-page/i.test(path) && !hasContentSubmissionForm(html)) {
    return {
      url,
      intent: 'Category',
      confidence: 0.68,
      detectorId: 'page_category',
      signals: [sig('wp_blog', 'url', path)],
    };
  }
  return null;
}

export type WpStrategyName =
  | 'Comment Posting'
  | 'Guest Post'
  | 'Dashboard Submission'
  | 'Registration Strategy'
  | 'Contact Form Submission'
  | 'Email Outreach'
  | 'Platform Form'
  | 'Unsupported';

const WP_STRATEGY_ORDER: WpStrategyName[] = [
  'Guest Post',
  'Platform Form',
  'Comment Posting',
  'Dashboard Submission',
  'Registration Strategy',
  'Contact Form Submission',
  'Email Outreach',
];

/** Map WP strategy names onto SubmissionStrategyName for SIE compatibility. */
export function toSieStrategyName(wp: WpStrategyName): SubmissionStrategyName {
  switch (wp) {
    case 'Comment Posting':
      return 'Comment Posting';
    case 'Guest Post':
      return 'Guest Post';
    case 'Dashboard Submission':
      return 'Dashboard Submission';
    case 'Registration Strategy':
      return 'Registration Strategy';
    case 'Contact Form Submission':
      return 'Contact Form';
    case 'Email Outreach':
      return 'Email Outreach';
    case 'Platform Form':
      return 'Platform Form';
    default:
      return 'Unsupported';
  }
}

export type StrategyPayloadHints = {
  /** Comment strategy: only these fields */
  fields?: string[];
  /** Skip generation assets */
  skip?: string[];
  emailAddress?: string | null;
  emailSubject?: string | null;
  moveToOutreach?: boolean;
};

/**
 * Select WordPress submission strategy from classifications + WP knowledge.
 */
export function selectWordPressStrategy(params: {
  pages: ClassifiedPage[];
  knowledge: WordPressKnowledge;
  pageHtmlByUrl: Record<string, string>;
}): StrategyPlan & { wordpressStrategy: WpStrategyName; payloadHints: StrategyPayloadHints } {
  const { pages, knowledge, pageHtmlByUrl } = params;
  const candidates: Array<{
    strategy: WpStrategyName;
    page: ClassifiedPage;
    expected: ExpectedIntervention[];
    reason: string;
    hints: StrategyPayloadHints;
  }> = [];

  const find = (intent: PageIntent | PageIntent[]) => {
    const set = new Set(Array.isArray(intent) ? intent : [intent]);
    return pages
      .filter((p) => set.has(p.intent) && p.confidence >= 0.55)
      .sort((a, b) => b.confidence - a.confidence)[0];
  };

  const submission = find('Submission Form');
  const writeForUs = find('Write For Us');
  if (submission) {
    candidates.push({
      strategy: 'Guest Post',
      page: submission,
      expected: [],
      reason: `WordPress guest-post form at ${submission.url}`,
      hints: {},
    });
  } else if (writeForUs && /write-for-us|guest-post|contribute/i.test(writeForUs.url)) {
    candidates.push({
      strategy: 'Guest Post',
      page: writeForUs,
      expected: [],
      reason: `WordPress Write For Us at ${writeForUs.url}`,
      hints: {},
    });
  }

  const google = find(['Google Form', 'Typeform']);
  if (google) {
    candidates.push({
      strategy: 'Platform Form',
      page: google,
      expected: [],
      reason: `Platform form at ${google.url}`,
      hints: {},
    });
  }

  const commentPage =
    find('Comment Form') ??
    pages.find((p) => {
      const html = pageHtmlByUrl[p.url] ?? '';
      return detectWordPressCommentForm(html).matched;
    });
  if (commentPage) {
    const html = pageHtmlByUrl[commentPage.url] ?? '';
    const det = detectWordPressCommentForm(html);
    if (det.matched) {
      candidates.push({
        strategy: 'Comment Posting',
        page: { ...commentPage, intent: 'Comment Form', confidence: det.confidence },
        expected: [],
        reason: `WordPress comment form at ${commentPage.url}`,
        hints: {
          fields: ['comment', 'author', 'email', 'website'],
          skip: ['article', 'images', 'metadata', 'video'],
        },
      });
    }
  }

  const login = find('Login');
  const registration = find('Registration');
  const dashboard = find('Dashboard');
  const author = knowledge.authorSystem;
  if (
    (dashboard || author.hasDashboard || author.hasWpAdmin) &&
    (login || author.hasWpLogin || registration || author.hasRegistration)
  ) {
    const entry =
      login ??
      registration ??
      dashboard ??
      ({
        url: author.hasWpLogin
          ? `https://${new URL(pages[0]?.url ?? 'https://example.com').hostname}/wp-login.php`
          : pages[0]!.url,
        intent: 'Login' as PageIntent,
        confidence: 0.8,
        detectorId: 'page_login' as const,
        signals: [],
      });
    candidates.push({
      strategy: 'Dashboard Submission',
      page: entry,
      expected: registration && !login ? ['Registration Required'] : ['Login Required'],
      reason: 'WordPress dashboard / author system requires account',
      hints: {},
    });
  }

  if (registration || author.hasRegistration || author.hasBecomeAuthor) {
    const page =
      registration ??
      ({
        url: pages[0]?.url ?? '',
        intent: 'Registration' as PageIntent,
        confidence: 0.7,
        detectorId: 'page_registration' as const,
        signals: [],
      });
    candidates.push({
      strategy: 'Registration Strategy',
      page,
      expected: ['Registration Required'],
      reason: 'WordPress registration / become author path',
      hints: {},
    });
  }

  const contact = find('Contact');
  const hasLiveContactForm = pages.some((p) => {
    const html = pageHtmlByUrl[p.url] ?? '';
    return CONTACT_FORM_PLUGINS.some((pl) => {
      const re = PLUGIN_PATTERNS.find((x) => x.name === pl)?.re;
      return re ? re.test(html) && /<form/i.test(html) : false;
    });
  });
  if (contact || hasLiveContactForm) {
    const page =
      contact ??
      pages.find((p) => {
        const html = pageHtmlByUrl[p.url] ?? '';
        return CONTACT_FORM_PLUGINS.some((pl) => {
          const re = PLUGIN_PATTERNS.find((x) => x.name === pl)?.re;
          return re ? re.test(html) && /<form/i.test(html) : false;
        });
      }) ??
      pages[0];
    if (page) {
      candidates.push({
        strategy: 'Contact Form Submission',
        page,
        expected: [],
        reason: `WordPress contact form (${knowledge.contactFormPlugins.join(', ') || 'detected'})`,
        hints: {},
      });
    }
  }

  const emailPage =
    find('Email Only') ??
    pages.find((p) => p.intent === 'Guest Post Guidelines' && p.emailAddress);
  const guidelinesEmail = knowledge.writeForUs.guidelines?.emailAddress;
  const guidelinesMethod = knowledge.writeForUs.guidelines?.submissionMethod;
  if (emailPage || guidelinesEmail || guidelinesMethod === 'email') {
    const page =
      emailPage ??
      ({
        url: knowledge.writeForUs.guidelines?.sourceUrl ?? pages[0]?.url ?? '',
        intent: 'Email Only' as PageIntent,
        confidence: 0.85,
        detectorId: 'page_email_only' as const,
        signals: [],
        emailAddress: guidelinesEmail,
      });
    candidates.push({
      strategy: 'Email Outreach',
      page,
      expected: [],
      reason: `WordPress email submission (${page.emailAddress ?? guidelinesEmail})`,
      hints: {
        emailAddress: page.emailAddress ?? guidelinesEmail ?? null,
        emailSubject: 'Guest post submission',
        moveToOutreach: true,
        skip: ['browser_automation'],
      },
    });
  }

  // When guidelines explicitly say email, prefer Email over Contact Form plugin noise
  if (guidelinesMethod === 'email') {
    candidates.sort((a, b) => {
      if (a.strategy === 'Email Outreach') return -1;
      if (b.strategy === 'Email Outreach') return 1;
      return WP_STRATEGY_ORDER.indexOf(a.strategy) - WP_STRATEGY_ORDER.indexOf(b.strategy);
    });
  } else {
    candidates.sort(
      (a, b) => WP_STRATEGY_ORDER.indexOf(a.strategy) - WP_STRATEGY_ORDER.indexOf(b.strategy)
    );
  }

  if (candidates.length === 0) {
    return {
      chosen: 'Unsupported',
      reasoning: 'No WordPress submission workflow identified',
      entryUrl: null,
      expectedInterventions: [],
      fallbacks: [],
      wordpressStrategy: 'Unsupported',
      payloadHints: {},
    };
  }

  const [primary, ...rest] = candidates;
  return {
    chosen: toSieStrategyName(primary!.strategy),
    reasoning: primary!.reason,
    entryUrl: primary!.page.url,
    expectedInterventions: primary!.expected,
    fallbacks: rest.map((c) => ({
      strategy: toSieStrategyName(c.strategy),
      entryUrl: c.page.url,
      reason: c.reason,
    })),
    wordpressStrategy: primary!.strategy,
    payloadHints: primary!.hints,
  };
}

/**
 * Build full WordPress knowledge + reclassify pages when WP is detected.
 */
export function buildWordPressKnowledge(params: {
  homepageUrl: string;
  pages: Array<{ url: string; html: string; status: string }>;
  robotsTxt?: string | null;
}): WordPressKnowledge | null {
  const home =
    params.pages.find((p) => p.status === 'fetched') ??
    ({ url: params.homepageUrl, html: '', status: 'failed' } as const);
  const combinedHtml = params.pages.map((p) => p.html).join('\n');
  const det = detectWordPress({
    html: home.html || combinedHtml,
    url: params.homepageUrl,
    robotsTxt: params.robotsTxt,
  });
  if (!det.detected && det.confidence < 0.5) return null;

  const plugins = detectWordPressPlugins(combinedHtml);
  const theme = detectWordPressTheme(combinedHtml);
  const authorSystem = detectWordPressAuthorSystem(combinedHtml, params.homepageUrl, plugins);
  const commentForms: WordPressKnowledge['commentForms'] = [];
  for (const p of params.pages) {
    if (p.status !== 'fetched') continue;
    const c = detectWordPressCommentForm(p.html);
    if (c.matched) {
      commentForms.push({
        url: p.url,
        signals: c.signals.map((s) => s.id),
      });
    }
  }

  let guidelines: SiteGuidelines | null = null;
  const writeUrls: string[] = [];
  for (const p of params.pages) {
    if (p.status !== 'fetched') continue;
    const wfu = detectWriteForUsSignals(p.html, p.url);
    if (wfu.matched) writeUrls.push(p.url);
    if (/guideline/i.test(p.url) || /guest\s+post\s+guidelines/i.test(p.html)) {
      guidelines = extractGuidelines({ html: p.html, url: p.url });
    }
  }

  return {
    detected: det.detected || det.confidence >= 0.5,
    confidence: det.confidence,
    signals: det.signals,
    theme,
    plugins,
    authorSystem,
    commentForms,
    contactFormPlugins: plugins.filter((p) => CONTACT_FORM_PLUGINS.includes(p)),
    writeForUs: { urls: writeUrls, guidelines },
    workflow: null,
  };
}

/**
 * Enrich an SIE result with WordPress intelligence (additive).
 * Re-runs page classification with WP detectors and selects WP strategy when WP.
 */
export function enrichWithWordPressIntelligence(params: {
  fingerprint: SiteFingerprint;
  pageClassifications: ClassifiedPage[];
  strategy: StrategyPlan;
  guidelines: SiteGuidelines | null;
  pages: Array<{ url: string; html: string; status: string; depth: number }>;
  homepageUrl: string;
}): {
  fingerprint: SiteFingerprint;
  pageClassifications: ClassifiedPage[];
  strategy: StrategyPlan;
  guidelines: SiteGuidelines | null;
  wordpress: WordPressKnowledge | null;
} {
  const knowledge = buildWordPressKnowledge({
    homepageUrl: params.homepageUrl,
    pages: params.pages,
  });

  // Soft WP claim from existing fingerprint
  const fpIsWp = params.fingerprint.platform === 'WordPress';
  if (!knowledge && !fpIsWp) {
    return {
      fingerprint: params.fingerprint,
      pageClassifications: params.pageClassifications,
      strategy: params.strategy,
      guidelines: params.guidelines,
      wordpress: null,
    };
  }

  const wp =
    knowledge ??
    ({
      detected: true,
      confidence: params.fingerprint.confidence,
      signals: params.fingerprint.signals,
      theme: null,
      plugins: [],
      authorSystem: detectWordPressAuthorSystem('', params.homepageUrl, []),
      commentForms: [],
      contactFormPlugins: [],
      writeForUs: { urls: [], guidelines: params.guidelines },
      workflow: null,
    } satisfies WordPressKnowledge);

  // Reclassify with WP-aware detectors (prefer higher confidence)
  const pageHtmlByUrl: Record<string, string> = {};
  const classifications = params.pageClassifications.map((c) => ({ ...c }));
  for (const page of params.pages) {
    if (page.status !== 'fetched') continue;
    pageHtmlByUrl[page.url] = page.html;
    const wpIntent = classifyWordPressPageIntent({ html: page.html, url: page.url });
    const base = classifyPageIntent({ html: page.html, url: page.url });
    const best =
      wpIntent && wpIntent.confidence >= base.confidence ? wpIntent : base;
    const idx = classifications.findIndex((c) => c.url === page.url);
    if (idx >= 0) classifications[idx] = best;
    else classifications.push(best);
  }

  const wpStrategy = selectWordPressStrategy({
    pages: classifications,
    knowledge: wp,
    pageHtmlByUrl,
  });
  wp.workflow = (() => {
    switch (wpStrategy.wordpressStrategy) {
      case 'Comment Posting':
        return 'comment';
      case 'Guest Post':
        return 'guest_post';
      case 'Dashboard Submission':
        return 'dashboard';
      case 'Registration Strategy':
        return 'registration';
      case 'Contact Form Submission':
        return 'contact_form';
      case 'Email Outreach':
        return 'email';
      case 'Platform Form':
        return 'google_form';
      default:
        return 'unsupported';
    }
  })();

  const fingerprint: SiteFingerprint = {
    ...params.fingerprint,
    platform: 'WordPress',
    confidence: Math.max(params.fingerprint.confidence, wp.confidence),
    signals:
      wp.signals.length > params.fingerprint.signals.length
        ? wp.signals
        : params.fingerprint.signals,
    hints: {
      ...params.fingerprint.hints,
      loginUrlPatterns: [
        ...new Set([
          ...params.fingerprint.hints.loginUrlPatterns,
          '/wp-login.php',
          '/wp-admin',
        ]),
      ],
      formHints: [
        ...new Set([
          ...params.fingerprint.hints.formHints,
          ...wp.plugins.map((p) => p.toLowerCase().replace(/\s+/g, '_')),
          ...(wp.commentForms.length ? ['wordpress_comment'] : []),
        ]),
      ],
    },
    wordpress: wp as unknown as Record<string, unknown>,
  };

  return {
    fingerprint,
    pageClassifications: classifications,
    strategy: {
      chosen: wpStrategy.chosen,
      reasoning: wpStrategy.reasoning,
      entryUrl: wpStrategy.entryUrl,
      expectedInterventions: wpStrategy.expectedInterventions,
      fallbacks: wpStrategy.fallbacks,
      wordpressStrategy: wpStrategy.wordpressStrategy,
      payloadHints: wpStrategy.payloadHints,
    },
    guidelines: wp.writeForUs.guidelines ?? params.guidelines,
    wordpress: wp,
  };
}

export function emptyWordPressLearning(): WordPressLearning {
  return {
    theme: null,
    plugins: [],
    submissionMethod: null,
    successfulUrl: null,
    successfulForm: null,
    requiredFields: [],
    executionTimeMs: null,
    successRate: null,
    failures: [],
  };
}

export function recordWordPressLearning(
  prev: WordPressLearning | null | undefined,
  update: Partial<WordPressLearning> & { failureReason?: string }
): WordPressLearning {
  const base = prev ?? emptyWordPressLearning();
  const next: WordPressLearning = {
    ...base,
    ...update,
    failures: base.failures,
  };
  if (update.failureReason) {
    next.failures = [
      { at: new Date().toISOString(), reason: update.failureReason },
      ...base.failures,
    ].slice(0, 20);
  }
  delete (next as { failureReason?: string }).failureReason;
  return next;
}

export function summarizeWordPressHealth(
  profiles: Array<{
    fingerprint?: { platform?: string; wordpress?: WordPressKnowledge };
    strategy?: { wordpressStrategy?: string; chosen?: string };
    learning?: { wordpress?: WordPressLearning; strategyStats?: Record<string, { successRate?: number }> };
  }>
) {
  const wp = profiles.filter(
    (p) =>
      p.fingerprint?.platform === 'WordPress' || p.fingerprint?.wordpress?.detected
  );
  const byWorkflow: Record<string, number> = {
    comment: 0,
    guest_post: 0,
    dashboard: 0,
    contact_form: 0,
    email: 0,
    unsupported: 0,
    registration: 0,
    google_form: 0,
  };
  let successSum = 0;
  let successN = 0;
  for (const p of wp) {
    const w =
      p.fingerprint?.wordpress?.workflow ??
      (p.strategy?.wordpressStrategy === 'Comment Posting'
        ? 'comment'
        : p.strategy?.wordpressStrategy === 'Guest Post'
          ? 'guest_post'
          : p.strategy?.chosen === 'Contact Form'
            ? 'contact_form'
            : p.strategy?.chosen === 'Email Outreach'
              ? 'email'
              : p.strategy?.chosen === 'Dashboard Submission'
                ? 'dashboard'
                : 'unsupported');
    if (w && w in byWorkflow) byWorkflow[w]!++;
    const rate = p.learning?.wordpress?.successRate;
    if (rate != null) {
      successSum += rate;
      successN++;
    }
  }
  return {
    detected: wp.length,
    comment: byWorkflow.comment,
    guestPost: byWorkflow.guest_post,
    dashboard: byWorkflow.dashboard,
    contactForm: byWorkflow.contact_form,
    email: byWorkflow.email,
    registration: byWorkflow.registration,
    unsupported: byWorkflow.unsupported,
    successRate: successN > 0 ? Math.round((successSum / successN) * 10) / 10 : null,
  };
}
