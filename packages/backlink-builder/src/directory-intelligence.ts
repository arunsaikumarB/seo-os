/**
 * Capability 2 — Directory Intelligence.
 * Extends Site Intelligence for Business Directory workflows.
 * Does not modify CSM, BEE, AI Review, WordPress Intelligence, or SIE core design.
 */
import type { DetectorSignal } from './detector-registry.js';
import type { ClassifiedPage, PageIntent } from './page-intent-detectors.js';
import { classifyPageIntent } from './page-intent-detectors.js';
import type { SiteFingerprint } from './site-fingerprint.js';
import type {
  ExpectedIntervention,
  StrategyPlan,
  SubmissionStrategyName,
} from './site-strategy.js';

export const DIRECTORY_PLATFORMS = [
  'PHP Link Directory',
  'eSyndiCat',
  'Arfooo',
  'IndexU',
  'Business Directory Plugin',
  'GeoDirectory',
  'Directorist',
  'Sabai Directory',
  'Brilliant Directories',
  'HivePress',
  'WordPress Directory Plugin',
  'Custom PHP Directory',
  'Unknown Directory',
] as const;

export type DirectoryPlatform = (typeof DIRECTORY_PLATFORMS)[number];

export type DirectoryPricing = {
  freeListing: boolean;
  paidListing: boolean;
  sponsored: boolean;
  featured: boolean;
  trial: boolean;
  pricingPageUrl: string | null;
  signals: DetectorSignal[];
};

export type DirectoryApproval = {
  immediate: boolean;
  manualReview: boolean;
  pendingApproval: boolean;
  emailVerification: boolean;
  adminApproval: boolean;
  expectedTimeline: string | null;
  signals: DetectorSignal[];
};

export type DirectoryFieldMap = {
  businessName: boolean;
  website: boolean;
  description: boolean;
  shortDescription: boolean;
  category: boolean;
  subcategory: boolean;
  keywords: boolean;
  phone: boolean;
  email: boolean;
  address: boolean;
  city: boolean;
  state: boolean;
  country: boolean;
  zip: boolean;
  logo: boolean;
  gallery: boolean;
  socialLinks: boolean;
  businessHours: boolean;
  rawFields: string[];
};

export type DirectoryCategoryNode = {
  name: string;
  url: string | null;
  parent: string | null;
};

export type DirectoryCategorySuggestion = {
  category: string;
  subcategory: string | null;
  confidence: number;
  path: string[];
  reasoning: string;
};

export type DirectoryKnowledge = {
  detected: boolean;
  confidence: number;
  signals: DetectorSignal[];
  platform: DirectoryPlatform;
  platformConfidence: number;
  platformVersion: string | null;
  entryUrl: string | null;
  categories: DirectoryCategoryNode[];
  suggestedCategory: DirectoryCategorySuggestion | null;
  fieldMap: DirectoryFieldMap | null;
  pricing: DirectoryPricing;
  approval: DirectoryApproval;
  workflow:
    | 'direct_submission'
    | 'dashboard'
    | 'registration'
    | 'contact_form'
    | 'email'
    | 'premium'
    | 'unsupported'
    | null;
};

export type DirectoryLearning = {
  platform: string | null;
  categories: string[];
  submissionUrl: string | null;
  requiredFields: string[];
  approvalFlow: string | null;
  pricing: string | null;
  executionTimeMs: number | null;
  successRate: number | null;
  failures: Array<{ at: string; reason: string }>;
  knownStrategy: string | null;
};

export type DirectoryStrategyName =
  | 'Direct Submission'
  | 'Dashboard Submission'
  | 'Registration Required'
  | 'Contact Form'
  | 'Email Submission'
  | 'Premium Listing'
  | 'Unsupported';

function sig(id: string, kind: DetectorSignal['kind'], detail: string): DetectorSignal {
  return { id, kind, detail };
}

const DIRECTORY_SIGNAL_TESTS: Array<{
  id: string;
  kind: DetectorSignal['kind'];
  test: (html: string, url: string) => boolean;
  detail: string;
}> = [
  {
    id: 'business_directory',
    kind: 'text',
    test: (h) => /business\s+directory|company\s+directory|category\s+directory/i.test(h),
    detail: 'Business Directory copy',
  },
  {
    id: 'add_listing',
    kind: 'text',
    test: (h, u) =>
      /add\s+listing|submit\s+listing|add\s+business|submit\s+business|create\s+listing/i.test(
        `${h}\n${u}`
      ),
    detail: 'Add / Submit Listing',
  },
  {
    id: 'listings',
    kind: 'text',
    test: (h) => /\blistings?\b|local\s+listings|yellow\s+pages/i.test(h),
    detail: 'Listings / Yellow Pages',
  },
  {
    id: 'browse_categories',
    kind: 'text',
    test: (h) => /business\s+categories|browse\s+categories|directory\s+categories/i.test(h),
    detail: 'Directory categories',
  },
  {
    id: 'business_profile',
    kind: 'text',
    test: (h) => /business\s+profile|company\s+profile|claim\s+(your\s+)?listing/i.test(h),
    detail: 'Business profile / claim listing',
  },
  {
    id: 'submit_url',
    kind: 'url',
    test: (_h, u) =>
      /\/(add-listing|submit-listing|add-business|submit-url|submit-site|add-url)(\/|$|\?)/i.test(u),
    detail: 'Submission URL pattern',
  },
];

const PLATFORM_RULES: Array<{
  platform: Exclude<DirectoryPlatform, 'Unknown Directory'>;
  re: RegExp;
  versionRe?: RegExp;
}> = [
  { platform: 'PHP Link Directory', re: /phplinkdirectory|php\s*link\s*directory|phpLD/i },
  { platform: 'eSyndiCat', re: /esyndicat/i },
  { platform: 'Arfooo', re: /arfooo/i },
  { platform: 'IndexU', re: /indexu\b/i },
  {
    platform: 'Business Directory Plugin',
    re: /business-directory-plugin|wpbdp_|bd-plugin/i,
  },
  { platform: 'GeoDirectory', re: /geodirectory|geodir_/i },
  { platform: 'Directorist', re: /directorist/i },
  { platform: 'Sabai Directory', re: /sabai-directory|sabai_directory/i },
  { platform: 'Brilliant Directories', re: /brilliantdirectories|brilliant.directories/i },
  { platform: 'HivePress', re: /hivepress/i },
  {
    platform: 'WordPress Directory Plugin',
    re: /wp-job-manager|listing.?plugin|connections.?directory/i,
  },
  {
    platform: 'Custom PHP Directory',
    re: /submit\.php|add_link\.php|addurl\.php|links\/add/i,
  },
];

/** Multi-signal directory detection — never one marker. */
export function detectDirectory(params: {
  html: string;
  url: string;
}): { detected: boolean; confidence: number; signals: DetectorSignal[] } {
  const signals: DetectorSignal[] = [];
  for (const t of DIRECTORY_SIGNAL_TESTS) {
    if (t.test(params.html, params.url)) signals.push(sig(t.id, t.kind, t.detail));
  }
  const detected = signals.length >= 2;
  return {
    detected,
    confidence: detected
      ? Math.min(0.98, 0.4 + signals.length * 0.1)
      : signals.length === 1
        ? 0.35
        : 0,
    signals,
  };
}

export function detectDirectoryPlatform(html: string, url: string): {
  platform: DirectoryPlatform;
  confidence: number;
  version: string | null;
  signals: DetectorSignal[];
} {
  const blob = `${html}\n${url}`;
  for (const rule of PLATFORM_RULES) {
    if (!rule.re.test(blob)) continue;
    const signals = [sig('platform', 'dom', rule.platform)];
    let version: string | null = null;
    if (rule.versionRe) {
      const m = blob.match(rule.versionRe);
      version = m?.[1] ?? null;
    }
    return {
      platform: rule.platform,
      confidence: 0.9,
      version,
      signals,
    };
  }
  return {
    platform: 'Unknown Directory',
    confidence: 0,
    version: null,
    signals: [],
  };
}

export function detectDirectoryPricing(html: string, url: string): DirectoryPricing {
  const blob = `${html}\n${url}`;
  const signals: DetectorSignal[] = [];
  const freeListing = /free\s+listing|submit\s+for\s+free|no\s+cost|complimentary\s+listing/i.test(
    blob
  );
  const paidListing =
    /paid\s+listing|premium\s+listing|\$\d+|price\s*:\s*\$|membership\s+fee|pay\s+to\s+(list|submit)/i.test(
      blob
    );
  const sponsored = /sponsored\s+listing/i.test(blob);
  const featured = /featured\s+listing|feature\s+your\s+business/i.test(blob);
  const trial = /free\s+trial|trial\s+listing/i.test(blob);
  if (freeListing) signals.push(sig('free', 'text', 'Free listing'));
  if (paidListing) signals.push(sig('paid', 'text', 'Paid listing'));
  if (sponsored) signals.push(sig('sponsored', 'text', 'Sponsored'));
  if (featured) signals.push(sig('featured', 'text', 'Featured'));
  if (trial) signals.push(sig('trial', 'text', 'Trial'));
  let pricingPageUrl: string | null = null;
  const priceLink = html.match(
    /href=["']([^"']*(pricing|plans|packages|premium)[^"']*)["']/i
  );
  if (priceLink) pricingPageUrl = priceLink[1]!;
  return {
    freeListing,
    paidListing,
    sponsored,
    featured,
    trial,
    pricingPageUrl,
    signals,
  };
}

export function detectDirectoryApproval(html: string): DirectoryApproval {
  const signals: DetectorSignal[] = [];
  const immediate = /instant\s+approval|immediate\s+approval|auto[- ]?approve|live\s+instantly/i.test(
    html
  );
  const manualReview = /manual\s+review|reviewed\s+by\s+(an?\s+)?admin|moderat/i.test(html);
  const pendingApproval = /pending\s+approval|awaiting\s+approval|under\s+review/i.test(html);
  const emailVerification = /email\s+verif|confirm\s+your\s+email|activation\s+link/i.test(html);
  const adminApproval = /admin\s+approval|editor\s+approval/i.test(html);
  if (immediate) signals.push(sig('immediate', 'text', 'Immediate approval'));
  if (manualReview) signals.push(sig('manual', 'text', 'Manual review'));
  if (pendingApproval) signals.push(sig('pending', 'text', 'Pending approval'));
  if (emailVerification) signals.push(sig('email_verify', 'text', 'Email verification'));
  if (adminApproval) signals.push(sig('admin', 'text', 'Admin approval'));
  let expectedTimeline: string | null = null;
  const tl = html.match(/(\d+)\s*[–-]?\s*(\d+)?\s*(business\s+)?days?/i);
  if (tl) expectedTimeline = tl[0]!;
  else if (immediate) expectedTimeline = 'immediate';
  else if (manualReview || adminApproval) expectedTimeline = '1–7 days';
  return {
    immediate,
    manualReview,
    pendingApproval,
    emailVerification,
    adminApproval,
    expectedTimeline,
    signals,
  };
}

const FIELD_PATTERNS: Array<{ key: keyof Omit<DirectoryFieldMap, 'rawFields'>; re: RegExp }> = [
  { key: 'businessName', re: /name=["'][^"']*(business|company|title|listing.?name|site.?name)[^"']*["']/i },
  { key: 'website', re: /name=["'][^"']*(url|website|web.?site|link)[^"']*["']/i },
  { key: 'description', re: /name=["'][^"']*(description|desc|about|details)[^"']*["']|<textarea[^>]*(description|desc)/i },
  { key: 'shortDescription', re: /name=["'][^"']*(short.?desc|summary|tagline|excerpt)[^"']*["']/i },
  { key: 'category', re: /name=["'][^"']*(categor|cat_id|listing.?cat)[^"']*["']|<select[^>]*(categor)/i },
  { key: 'subcategory', re: /name=["'][^"']*(sub.?categor)[^"']*["']/i },
  { key: 'keywords', re: /name=["'][^"']*(keyword|tags?)[^"']*["']/i },
  { key: 'phone', re: /name=["'][^"']*(phone|tel|mobile)[^"']*["']/i },
  { key: 'email', re: /name=["'][^"']*(e?-?mail)[^"']*["']|type=["']email["']/i },
  { key: 'address', re: /name=["'][^"']*(address|street)[^"']*["']/i },
  { key: 'city', re: /name=["'][^"']*(city|town)[^"']*["']/i },
  { key: 'state', re: /name=["'][^"']*(state|province|region)[^"']*["']/i },
  { key: 'country', re: /name=["'][^"']*(country)[^"']*["']/i },
  { key: 'zip', re: /name=["'][^"']*(zip|postal|post.?code)[^"']*["']/i },
  { key: 'logo', re: /name=["'][^"']*(logo|image)[^"']*["']|type=["']file["']/i },
  { key: 'gallery', re: /name=["'][^"']*(gallery|photos|images)[^"']*["']/i },
  { key: 'socialLinks', re: /name=["'][^"']*(facebook|twitter|linkedin|instagram|social)[^"']*["']/i },
  { key: 'businessHours', re: /name=["'][^"']*(hours|opening|schedule)[^"']*["']/i },
];

export function extractDirectoryFieldMap(html: string): DirectoryFieldMap {
  const map: DirectoryFieldMap = {
    businessName: false,
    website: false,
    description: false,
    shortDescription: false,
    category: false,
    subcategory: false,
    keywords: false,
    phone: false,
    email: false,
    address: false,
    city: false,
    state: false,
    country: false,
    zip: false,
    logo: false,
    gallery: false,
    socialLinks: false,
    businessHours: false,
    rawFields: [],
  };
  for (const f of FIELD_PATTERNS) {
    if (f.re.test(html)) {
      map[f.key] = true;
      map.rawFields.push(f.key);
    }
  }
  const names = html.matchAll(/name=["']([^"']+)["']/gi);
  for (const m of names) {
    const n = m[1]!;
    if (!map.rawFields.includes(n) && map.rawFields.length < 40) map.rawFields.push(n);
  }
  return map;
}

export function extractDirectoryCategories(html: string, pageUrl: string): DirectoryCategoryNode[] {
  const cats: DirectoryCategoryNode[] = [];
  const seen = new Set<string>();
  const re =
    /<a\s+[^>]*href=["']([^"']*(?:categor|listing-cat|\/cat\/)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const name = m[2]!.replace(/<[^>]+>/g, '').trim();
    if (!name || name.length > 80 || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    cats.push({ name, url: m[1]!, parent: null });
    if (cats.length >= 50) break;
  }
  // Option lists inside category selects
  const optRe = /<option[^>]*>([^<]{2,60})<\/option>/gi;
  while ((m = optRe.exec(html))) {
    const name = m[1]!.trim();
    if (!name || /select|choose|category/i.test(name) || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    cats.push({ name, url: null, parent: null });
    if (cats.length >= 80) break;
  }
  void pageUrl;
  return cats;
}

export function findDirectoryEntryUrl(pages: Array<{ url: string; html: string }>): string | null {
  const scored: Array<{ url: string; score: number }> = [];
  for (const p of pages) {
    let score = 0;
    const blob = `${p.url}\n${p.html}`;
    if (/\/(add-listing|submit-listing|add-business|submit-url|add-url|submit-site)(\/|$|\?)/i.test(p.url))
      score += 100;
    if (/add\s+listing|submit\s+listing|add\s+business|create\s+listing/i.test(p.html)) score += 60;
    if (/become\s+member|register.*list/i.test(blob)) score += 40;
    if (/submit\s+url/i.test(blob)) score += 50;
    if (score > 0) scored.push({ url: p.url, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.url ?? null;
}

/**
 * Smart category matching — deterministic keyword scoring (no live AI required).
 * Returns confidence 0–100 style as 0–1.
 */
export function matchDirectoryCategory(params: {
  businessText: string;
  categories: DirectoryCategoryNode[];
}): DirectoryCategorySuggestion | null {
  if (!params.categories.length) return null;
  const biz = params.businessText.toLowerCase();
  const tokens = biz.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  let best: { cat: DirectoryCategoryNode; score: number; hits: string[] } | null = null;
  for (const cat of params.categories) {
    const name = cat.name.toLowerCase();
    const hits: string[] = [];
    let score = 0;
    for (const t of tokens) {
      if (name.includes(t)) {
        score += t.length > 5 ? 3 : 2;
        hits.push(t);
      }
    }
    // Domain synonym boosts
    if (/software|saas|tech|pos|app/.test(biz) && /tech|software|comput|internet/.test(name)) {
      score += 4;
      hits.push('tech-synonym');
    }
    if (/restaur|food|cafe|dining/.test(biz) && /food|restaur|dining|hospitality/.test(name)) {
      score += 4;
      hits.push('food-synonym');
    }
    if (/health|medic|clinic|dental/.test(biz) && /health|medic|dental/.test(name)) {
      score += 4;
      hits.push('health-synonym');
    }
    if (!best || score > best.score) best = { cat, score, hits };
  }
  if (!best || best.score <= 0) {
    return {
      category: params.categories[0]!.name,
      subcategory: null,
      confidence: 0.35,
      path: [params.categories[0]!.name],
      reasoning: 'Default top category — low confidence; override recommended',
    };
  }
  const confidence = Math.min(0.98, 0.45 + best.score * 0.08);
  return {
    category: best.cat.name,
    subcategory: null,
    confidence: Math.round(confidence * 1000) / 1000,
    path: [best.cat.name],
    reasoning: `Matched tokens: ${best.hits.slice(0, 6).join(', ') || 'heuristic'}`,
  };
}

export function classifyDirectoryPageIntent(params: {
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

  if (/\/(pricing|plans|packages|premium)(\/|$|\?)/i.test(path) || /pricing\s+plans/i.test(html)) {
    return {
      url,
      intent: 'Unsupported',
      confidence: 0.7,
      detectorId: 'unsupported',
      signals: [sig('pricing_page', 'url', url)],
    };
  }

  if (
    /\/(add-listing|submit-listing|add-business|submit-url|add-url)(\/|$|\?)/i.test(path) ||
    (/add\s+listing|submit\s+(your\s+)?(business|listing)/i.test(html) &&
      /<form[\s\S]+?<\/form>/i.test(html))
  ) {
    return {
      url,
      intent: 'Submission Form',
      confidence: 0.92,
      detectorId: 'page_submission_form',
      signals: [sig('add_listing_page', 'url', url)],
    };
  }

  if (/\/(register|signup|sign-up|join)(\/|$|\?)/i.test(path)) {
    return {
      url,
      intent: 'Registration',
      confidence: 0.85,
      detectorId: 'page_registration',
      signals: [sig('dir_register', 'url', url)],
    };
  }

  if (/\/(login|signin|sign-in|members\/login)(\/|$|\?)/i.test(path)) {
    return {
      url,
      intent: 'Login',
      confidence: 0.85,
      detectorId: 'page_login',
      signals: [sig('dir_login', 'url', url)],
    };
  }

  if (/\/(dashboard|account|member|my-listings)(\/|$|\?)/i.test(path)) {
    return {
      url,
      intent: 'Dashboard',
      confidence: 0.85,
      detectorId: 'page_dashboard',
      signals: [sig('dir_dashboard', 'url', url)],
    };
  }

  if (
    /\/(categor(?:y|ies)?|listings?|browse)(\/|$|\?)/i.test(path) &&
    !/<form[\s\S]{80,}?<\/form>/i.test(html)
  ) {
    return {
      url,
      intent: 'Category',
      confidence: 0.8,
      detectorId: 'page_category',
      signals: [sig('dir_category', 'url', url)],
    };
  }

  if (/directory|listings?\s+home/i.test(html) && (/^\/?$/.test(path) || /\/directory/i.test(path))) {
    return {
      url,
      intent: 'Homepage',
      confidence: 0.75,
      detectorId: 'page_homepage',
      signals: [sig('dir_home', 'url', url)],
    };
  }

  return null;
}

function toSieStrategy(name: DirectoryStrategyName): SubmissionStrategyName {
  switch (name) {
    case 'Direct Submission':
      return 'Direct Submission Form';
    case 'Dashboard Submission':
      return 'Dashboard Submission';
    case 'Registration Required':
      return 'Registration Strategy';
    case 'Contact Form':
      return 'Contact Form';
    case 'Email Submission':
      return 'Email Outreach';
    case 'Premium Listing':
      return 'Unsupported'; // never auto-pay — gated as needs review
    default:
      return 'Unsupported';
  }
}

export function selectDirectoryStrategy(params: {
  pages: ClassifiedPage[];
  knowledge: DirectoryKnowledge;
  pageHtmlByUrl: Record<string, string>;
}): StrategyPlan & {
  directoryStrategy: DirectoryStrategyName;
  payloadHints: {
    needsReview?: boolean;
    paidListing?: boolean;
    categorySuggestion?: DirectoryCategorySuggestion | null;
    fieldMap?: DirectoryFieldMap | null;
    approval?: DirectoryApproval;
    moveToOutreach?: boolean;
    emailAddress?: string | null;
    skip?: string[];
  };
} {
  const { pages, knowledge } = params;
  const find = (intent: PageIntent | PageIntent[]) => {
    const set = new Set(Array.isArray(intent) ? intent : [intent]);
    return pages
      .filter((p) => set.has(p.intent) && p.confidence >= 0.55)
      .sort((a, b) => b.confidence - a.confidence)[0];
  };

  // Paid / premium — never attempt payment
  if (knowledge.pricing.paidListing && !knowledge.pricing.freeListing) {
    const entry =
      find('Submission Form') ??
      ({
        url: knowledge.entryUrl ?? pages[0]?.url ?? '',
        intent: 'Submission Form' as PageIntent,
        confidence: 0.7,
        detectorId: 'page_submission_form' as const,
        signals: [],
      });
    return {
      chosen: 'Unsupported',
      reasoning: 'Paid / premium directory — needs human review; never auto-pay',
      entryUrl: entry.url,
      expectedInterventions: [],
      fallbacks: [],
      directoryStrategy: 'Premium Listing',
      payloadHints: {
        needsReview: true,
        paidListing: true,
        categorySuggestion: knowledge.suggestedCategory,
        fieldMap: knowledge.fieldMap,
        approval: knowledge.approval,
        skip: ['payment', 'browser_automation'],
      },
    };
  }

  const candidates: Array<{
    strategy: DirectoryStrategyName;
    page: ClassifiedPage;
    expected: ExpectedIntervention[];
    reason: string;
    hints: StrategyPlan['payloadHints'];
  }> = [];

  const submission = find('Submission Form');
  if (submission || knowledge.entryUrl) {
    const page =
      submission ??
      ({
        url: knowledge.entryUrl!,
        intent: 'Submission Form' as PageIntent,
        confidence: 0.85,
        detectorId: 'page_submission_form' as const,
        signals: [],
      });
    candidates.push({
      strategy: 'Direct Submission',
      page,
      expected: knowledge.approval.emailVerification ? [] : [],
      reason: `Directory listing form at ${page.url}`,
      hints: {
        categorySuggestion: knowledge.suggestedCategory,
        fieldMap: knowledge.fieldMap,
      },
    });
  }

  const login = find('Login');
  const registration = find('Registration');
  const dashboard = find('Dashboard');
  if (dashboard && (login || registration)) {
    candidates.push({
      strategy: 'Dashboard Submission',
      page: login ?? registration ?? dashboard,
      expected: registration && !login ? ['Registration Required'] : ['Login Required'],
      reason: 'Directory requires member dashboard submission',
      hints: { categorySuggestion: knowledge.suggestedCategory },
    });
  } else if (registration && !submission) {
    candidates.push({
      strategy: 'Registration Required',
      page: registration,
      expected: ['Registration Required'],
      reason: 'Directory requires registration before listing',
      hints: {},
    });
  }

  const contact = find('Contact');
  if (contact) {
    candidates.push({
      strategy: 'Contact Form',
      page: contact,
      expected: [],
      reason: `Directory contact form at ${contact.url}`,
      hints: {},
    });
  }

  const email = find('Email Only');
  if (email) {
    candidates.push({
      strategy: 'Email Submission',
      page: email,
      expected: [],
      reason: `Directory email submission (${email.emailAddress ?? ''})`,
      hints: {
        moveToOutreach: true,
        emailAddress: email.emailAddress ?? null,
        skip: ['browser_automation'],
      },
    });
  }

  // Free+paid hybrid: free path preferred
  const order: DirectoryStrategyName[] = [
    'Direct Submission',
    'Dashboard Submission',
    'Registration Required',
    'Contact Form',
    'Email Submission',
  ];
  candidates.sort((a, b) => order.indexOf(a.strategy) - order.indexOf(b.strategy));

  if (!candidates.length) {
    return {
      chosen: 'Unsupported',
      reasoning: 'No directory submission path verified',
      entryUrl: null,
      expectedInterventions: [],
      fallbacks: [],
      directoryStrategy: 'Unsupported',
      payloadHints: {
        categorySuggestion: knowledge.suggestedCategory,
        fieldMap: knowledge.fieldMap,
        approval: knowledge.approval,
      },
    };
  }

  const [primary, ...rest] = candidates;
  // Mixed free/paid with free available — still allow direct but flag pricing awareness
  const hints = {
    ...primary!.hints,
    paidListing: knowledge.pricing.paidListing,
    needsReview: Boolean(knowledge.pricing.paidListing && knowledge.pricing.freeListing === false),
    categorySuggestion: knowledge.suggestedCategory,
    fieldMap: knowledge.fieldMap,
    approval: knowledge.approval,
  };

  return {
    chosen: toSieStrategy(primary!.strategy),
    reasoning: primary!.reason,
    entryUrl: primary!.page.url,
    expectedInterventions: primary!.expected,
    fallbacks: rest.map((c) => ({
      strategy: toSieStrategy(c.strategy),
      entryUrl: c.page.url,
      reason: c.reason,
    })),
    directoryStrategy: primary!.strategy,
    payloadHints: hints,
  };
}

export function buildDirectoryKnowledge(params: {
  homepageUrl: string;
  pages: Array<{ url: string; html: string; status: string }>;
  businessText?: string | null;
}): DirectoryKnowledge | null {
  const combined = params.pages.map((p) => p.html).join('\n');
  const home = params.pages.find((p) => p.status === 'fetched') ?? {
    url: params.homepageUrl,
    html: '',
    status: 'failed',
  };
  const det = detectDirectory({ html: home.html || combined, url: params.homepageUrl });
  // Also scan all pages for directory signals
  let bestSignals = det.signals;
  let bestConf = det.confidence;
  let detected = det.detected;
  for (const p of params.pages) {
    if (p.status !== 'fetched') continue;
    const d = detectDirectory({ html: p.html, url: p.url });
    if (d.signals.length > bestSignals.length) {
      bestSignals = d.signals;
      bestConf = d.confidence;
      detected = d.detected;
    }
  }
  if (!detected && bestConf < 0.5) return null;

  const platform = detectDirectoryPlatform(combined, params.homepageUrl);
  const fetched = params.pages.filter((p) => p.status === 'fetched');
  const entryUrl = findDirectoryEntryUrl(fetched);
  const categories = extractDirectoryCategories(combined, params.homepageUrl);
  const entryHtml = fetched.find((p) => p.url === entryUrl)?.html ?? combined;
  const fieldMap = entryUrl ? extractDirectoryFieldMap(entryHtml) : null;
  const pricing = detectDirectoryPricing(combined, params.homepageUrl);
  const approval = detectDirectoryApproval(combined);
  const suggestedCategory = matchDirectoryCategory({
    businessText: params.businessText ?? '',
    categories,
  });

  return {
    detected: true,
    confidence: Math.max(bestConf, platform.confidence * 0.5),
    signals: bestSignals,
    platform: platform.platform,
    platformConfidence: platform.confidence,
    platformVersion: platform.version,
    entryUrl,
    categories,
    suggestedCategory,
    fieldMap,
    pricing,
    approval,
    workflow: null,
  };
}

export function enrichWithDirectoryIntelligence(params: {
  fingerprint: SiteFingerprint;
  pageClassifications: ClassifiedPage[];
  strategy: StrategyPlan;
  pages: Array<{ url: string; html: string; status: string; depth: number }>;
  homepageUrl: string;
  businessText?: string | null;
  /** When WordPress already claimed the profile, still attach directory if BDP/GeoDir etc. */
  allowAlongsideWordPress?: boolean;
}): {
  fingerprint: SiteFingerprint;
  pageClassifications: ClassifiedPage[];
  strategy: StrategyPlan;
  directory: DirectoryKnowledge | null;
} {
  const knowledge = buildDirectoryKnowledge({
    homepageUrl: params.homepageUrl,
    pages: params.pages,
    businessText: params.businessText,
  });

  if (!knowledge) {
    return {
      fingerprint: params.fingerprint,
      pageClassifications: params.pageClassifications,
      strategy: params.strategy,
      directory: null,
    };
  }

  // Prefer not to override pure WP comment/guest-post unless directory platform is explicit
  const wp = params.fingerprint.platform === 'WordPress';
  const explicitDirPlugin =
    knowledge.platformConfidence >= 0.85 &&
    knowledge.platform !== 'Unknown Directory';
  if (wp && !explicitDirPlugin && !params.allowAlongsideWordPress) {
    // Soft attach knowledge without strategy override
    return {
      fingerprint: {
        ...params.fingerprint,
        directory: knowledge as unknown as Record<string, unknown>,
      },
      pageClassifications: params.pageClassifications,
      strategy: params.strategy,
      directory: knowledge,
    };
  }

  const pageHtmlByUrl: Record<string, string> = {};
  const classifications = params.pageClassifications.map((c) => ({ ...c }));
  for (const page of params.pages) {
    if (page.status !== 'fetched') continue;
    pageHtmlByUrl[page.url] = page.html;
    const dirIntent = classifyDirectoryPageIntent({ html: page.html, url: page.url });
    const base = classifyPageIntent({ html: page.html, url: page.url });
    const best = dirIntent && dirIntent.confidence >= base.confidence ? dirIntent : base;
    const idx = classifications.findIndex((c) => c.url === page.url);
    if (idx >= 0) classifications[idx] = best;
    else classifications.push(best);
  }

  const dirStrategy = selectDirectoryStrategy({
    pages: classifications,
    knowledge,
    pageHtmlByUrl,
  });
  knowledge.workflow = (() => {
    switch (dirStrategy.directoryStrategy) {
      case 'Direct Submission':
        return 'direct_submission';
      case 'Dashboard Submission':
        return 'dashboard';
      case 'Registration Required':
        return 'registration';
      case 'Contact Form':
        return 'contact_form';
      case 'Email Submission':
        return 'email';
      case 'Premium Listing':
        return 'premium';
      default:
        return 'unsupported';
    }
  })();

  const fingerprint: SiteFingerprint = {
    ...params.fingerprint,
    // Keep WordPress platform if set; directory lives under .directory
    hints: {
      ...params.fingerprint.hints,
      submissionUrlPatterns: [
        ...new Set([
          ...params.fingerprint.hints.submissionUrlPatterns,
          '/add-listing',
          '/submit-listing',
          '/add-business',
        ]),
      ],
      formHints: [
        ...new Set([
          ...params.fingerprint.hints.formHints,
          'directory_listing',
          knowledge.platform.toLowerCase().replace(/\s+/g, '_'),
        ]),
      ],
    },
    directory: knowledge as unknown as Record<string, unknown>,
  };

  return {
    fingerprint,
    pageClassifications: classifications,
    strategy: {
      chosen: dirStrategy.chosen,
      reasoning: dirStrategy.reasoning,
      entryUrl: dirStrategy.entryUrl ?? knowledge.entryUrl,
      expectedInterventions: dirStrategy.expectedInterventions,
      fallbacks: dirStrategy.fallbacks,
      directoryStrategy: dirStrategy.directoryStrategy,
      payloadHints: {
        ...params.strategy.payloadHints,
        ...dirStrategy.payloadHints,
      },
    },
    directory: knowledge,
  };
}

export function emptyDirectoryLearning(): DirectoryLearning {
  return {
    platform: null,
    categories: [],
    submissionUrl: null,
    requiredFields: [],
    approvalFlow: null,
    pricing: null,
    executionTimeMs: null,
    successRate: null,
    failures: [],
    knownStrategy: null,
  };
}

export function recordDirectoryLearning(
  prev: DirectoryLearning | null | undefined,
  update: Partial<DirectoryLearning> & { failureReason?: string }
): DirectoryLearning {
  const base = prev ?? emptyDirectoryLearning();
  const next: DirectoryLearning = { ...base, ...update, failures: base.failures };
  if (update.failureReason) {
    next.failures = [
      { at: new Date().toISOString(), reason: update.failureReason },
      ...base.failures,
    ].slice(0, 20);
  }
  delete (next as { failureReason?: string }).failureReason;
  return next;
}

export function summarizeDirectoryHealth(
  profiles: Array<{
    fingerprint?: { directory?: DirectoryKnowledge | Record<string, unknown> };
    strategy?: {
      directoryStrategy?: string;
      chosen?: string;
      payloadHints?: { paidListing?: boolean; needsReview?: boolean };
    };
    learning?: { directory?: DirectoryLearning };
  }>
) {
  const dirs = profiles.filter((p) => {
    const d = p.fingerprint?.directory as DirectoryKnowledge | undefined;
    return Boolean(d && (d as DirectoryKnowledge).detected);
  });
  let free = 0;
  let paid = 0;
  let dashboard = 0;
  let email = 0;
  let contact = 0;
  let unsupported = 0;
  let supported = 0;
  let successSum = 0;
  let successN = 0;
  for (const p of dirs) {
    const d = p.fingerprint!.directory as DirectoryKnowledge;
    const strat = p.strategy?.directoryStrategy ?? p.strategy?.chosen;
    if (d.pricing?.paidListing && !d.pricing?.freeListing) paid++;
    else if (d.pricing?.freeListing || strat === 'Direct Submission') free++;
    if (strat === 'Dashboard Submission' || d.workflow === 'dashboard') dashboard++;
    if (strat === 'Email Submission' || strat === 'Email Outreach' || d.workflow === 'email')
      email++;
    if (strat === 'Contact Form' || d.workflow === 'contact_form') contact++;
    if (strat === 'Unsupported' || d.workflow === 'unsupported' || d.workflow === 'premium')
      unsupported++;
    else supported++;
    const rate = p.learning?.directory?.successRate;
    if (rate != null) {
      successSum += rate;
      successN++;
    }
  }
  return {
    detected: dirs.length,
    supported,
    free,
    paid,
    dashboard,
    email,
    contactForm: contact,
    unsupported,
    successRate: successN > 0 ? Math.round((successSum / successN) * 10) / 10 : null,
  };
}
