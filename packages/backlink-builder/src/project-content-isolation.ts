/**
 * P0 — Project content isolation.
 * Every generated package / Assisted Manual / Companion payload must belong to exactly one project.
 */

export type ProjectContentContext = {
  projectId: string;
  projectName: string;
  businessName: string;
  brandName: string;
  website: string;
  projectDomain: string;
  industry?: string | null;
  locations?: string[];
  phone?: string | null;
  email?: string | null;
  description?: string | null;
  services?: string[];
  keywords?: string[];
  targetUrls?: string[];
};

/** Brands that must never appear in another project's generated copy. */
export const KNOWN_FOREIGN_BRAND_MARKERS: ReadonlyArray<{ id: string; markers: string[] }> = [
  {
    id: 'chefgaa',
    markers: [
      'ChefGaa',
      'Chefgaa',
      'chefgaa',
      'go.chefgaa.com',
      'chefgaa.com',
      'Restaurant Point of Sale POS Software',
      'restaurant POS and billing software',
      'ChefGaa POS',
    ],
  },
  {
    id: 'desidhamaka',
    markers: ['Desi Dhamaka', 'DesiDhamaka', 'desidhamaka'],
  },
];

function normalizeBrandKey(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** True when `candidate` is the same brand as `allowed` (fuzzy). */
export function brandsMatch(allowed: string | null | undefined, candidate: string | null | undefined): boolean {
  const a = normalizeBrandKey(String(allowed ?? ''));
  const c = normalizeBrandKey(String(candidate ?? ''));
  if (!a || !c) return false;
  return a === c || a.includes(c) || c.includes(a);
}

/**
 * Find foreign-brand markers in text that do not belong to the allowed project brand.
 * If allowed brand is ChefGaa, ChefGaa markers are OK; Desi Dhamaka markers are not.
 */
export function findForeignBrandContamination(
  text: string,
  allowedBrand: string | null | undefined
): string[] {
  const blob = String(text ?? '');
  if (!blob.trim()) return [];
  const allowedKey = normalizeBrandKey(String(allowedBrand ?? ''));
  const hits: string[] = [];
  for (const group of KNOWN_FOREIGN_BRAND_MARKERS) {
    if (allowedKey && (allowedKey.includes(group.id) || group.id.includes(allowedKey))) {
      continue;
    }
    for (const marker of group.markers) {
      if (blob.includes(marker)) hits.push(marker);
    }
  }
  return [...new Set(hits)];
}

export class ProjectMismatchError extends Error {
  readonly code = 'PROJECT_MISMATCH';
  constructor(
    message: string,
    readonly expectedProjectId?: string,
    readonly actualProjectId?: string
  ) {
    super(message);
    this.name = 'ProjectMismatchError';
  }
}

export class MissingProjectContentError extends Error {
  readonly code = 'MISSING_PROJECT_CONTENT';
  constructor(message: string) {
    super(message);
    this.name = 'MissingProjectContentError';
  }
}

export function assertProjectOwnership(
  contentProjectId: string | null | undefined,
  currentProjectId: string | null | undefined,
  label = 'content'
): void {
  const a = String(contentProjectId ?? '').trim();
  const b = String(currentProjectId ?? '').trim();
  if (!b) {
    throw new ProjectMismatchError(`Current project id is missing while loading ${label}`);
  }
  if (!a) {
    throw new ProjectMismatchError(
      `${label} is missing projectId — refusing to load (project isolation)`,
      b,
      a
    );
  }
  if (a !== b) {
    throw new ProjectMismatchError(
      `Package belongs to another project (${a} ≠ ${b})`,
      b,
      a
    );
  }
}

export type IsolationValidationResult = {
  ok: boolean;
  errors: string[];
  foreignMarkers: string[];
};

/**
 * Development / pre-activation validator for cross-project contamination.
 */
export function validateProjectContentIsolation(input: {
  currentProjectId: string;
  packageProjectId?: string | null;
  opportunityProjectId?: string | null;
  businessName?: string | null;
  expectedBusinessName?: string | null;
  title?: string | null;
  description?: string | null;
  articleBody?: string | null;
  keywords?: string | null;
  targetUrl?: string | null;
  expectedDomain?: string | null;
}): IsolationValidationResult {
  const errors: string[] = [];
  const current = String(input.currentProjectId ?? '').trim();
  if (!current) errors.push('currentProjectId is required');

  if (input.packageProjectId != null && String(input.packageProjectId).trim() !== current) {
    errors.push(
      `package.projectId mismatch: ${input.packageProjectId} ≠ ${current}`
    );
  }
  if (
    input.opportunityProjectId != null &&
    String(input.opportunityProjectId).trim() !== current
  ) {
    errors.push(
      `opportunity.projectId mismatch: ${input.opportunityProjectId} ≠ ${current}`
    );
  }

  const expectedBiz = String(input.expectedBusinessName ?? '').trim();
  const biz = String(input.businessName ?? '').trim();
  if (expectedBiz && biz && !brandsMatch(expectedBiz, biz)) {
    errors.push(`businessName mismatch: "${biz}" vs expected "${expectedBiz}"`);
  }

  const blob = [
    input.title,
    input.description,
    input.articleBody,
    input.keywords,
    input.businessName,
  ]
    .filter(Boolean)
    .join('\n');
  const foreignMarkers = findForeignBrandContamination(blob, expectedBiz || biz);
  if (foreignMarkers.length) {
    errors.push(`foreign brand contamination: ${foreignMarkers.slice(0, 8).join(', ')}`);
  }

  if (input.expectedDomain && input.targetUrl) {
    const host = (() => {
      try {
        return new URL(String(input.targetUrl)).hostname.replace(/^www\./i, '').toLowerCase();
      } catch {
        return String(input.targetUrl).toLowerCase();
      }
    })();
    const expected = String(input.expectedDomain)
      .replace(/^www\./i, '')
      .toLowerCase();
    // Target is the directory domain — do not require it to match project domain.
    void host;
    void expected;
  }

  return { ok: errors.length === 0, errors, foreignMarkers };
}

export function buildProjectContentContext(input: {
  projectId: string;
  projectName?: string | null;
  businessName?: string | null;
  brandName?: string | null;
  website?: string | null;
  projectDomain?: string | null;
  industry?: string | null;
  phone?: string | null;
  email?: string | null;
  description?: string | null;
  services?: string[] | null;
  keywords?: string[] | null;
  locations?: string[] | null;
  targetUrls?: string[] | null;
}): ProjectContentContext {
  const projectId = String(input.projectId ?? '').trim();
  if (!projectId) {
    throw new MissingProjectContentError('projectId is required for ProjectContentContext');
  }
  const brandName = String(
    input.brandName || input.businessName || input.projectName || ''
  ).trim();
  if (!brandName) {
    throw new MissingProjectContentError(
      `Project ${projectId} has no business/brand name — refusing silent fallback`
    );
  }
  const projectDomain = String(input.projectDomain ?? '')
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .trim();
  const website =
    String(input.website ?? '').trim() ||
    (projectDomain ? `https://${projectDomain}` : '');

  return {
    projectId,
    projectName: String(input.projectName || brandName).trim(),
    businessName: String(input.businessName || brandName).trim(),
    brandName,
    website,
    projectDomain,
    industry: input.industry ?? null,
    locations: input.locations ?? [],
    phone: input.phone ?? null,
    email: input.email ?? null,
    description: input.description ?? null,
    services: input.services ?? [],
    keywords: input.keywords ?? [],
    targetUrls: input.targetUrls ?? [],
  };
}

/** Submission platform families for Web 2.0 / article vs classic directory. */
export const SUBMISSION_PLATFORM_TYPES = [
  'DIRECTORY',
  'SOCIAL_PROFILE',
  'BUSINESS_LISTING',
  'ARTICLE',
  'BLOG',
  'WEB_2_0',
  'FORUM',
  'PRESS_RELEASE',
  'COMMENT',
  'OTHER',
] as const;

export type SubmissionPlatformType = (typeof SUBMISSION_PLATFORM_TYPES)[number];

/** Map storage / classification ids → platform family. */
export function resolveSubmissionPlatformType(input: {
  storageType?: string | null;
  classificationId?: string | null;
  classificationLabel?: string | null;
  domain?: string | null;
  url?: string | null;
}): SubmissionPlatformType {
  const blob = [
    input.storageType,
    input.classificationId,
    input.classificationLabel,
    input.domain,
    input.url,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/\b(social_bookmark|dirstop|webcastlist|pligg)\b/.test(blob)) return 'SOCIAL_PROFILE';
  if (/\b(medium\.com|substack|hashnode|dev\.to|blogspot|wordpress\.com|tumblr)\b/.test(blob)) {
    return 'WEB_2_0';
  }
  if (/\b(article_submission|guest_post|article)\b/.test(blob)) return 'ARTICLE';
  if (/\b(blog_submission|blog|web2|web_?2)\b/.test(blob)) return 'WEB_2_0';
  if (/\b(press_release|digital_pr|haro)\b/.test(blob)) return 'PRESS_RELEASE';
  if (/\b(forum|reddit|quora|qa_site)\b/.test(blob)) return 'FORUM';
  if (/\b(blog_comment|comment)\b/.test(blob)) return 'COMMENT';
  if (/\b(profile|social_bookmark|citation)\b/.test(blob)) return 'SOCIAL_PROFILE';
  if (/\b(directory|business.?listing)\b/.test(blob)) return 'DIRECTORY';
  if (/\b(directory|listing)\b/.test(blob)) return 'BUSINESS_LISTING';
  return 'OTHER';
}

export function isArticleLikePlatform(t: SubmissionPlatformType): boolean {
  return t === 'ARTICLE' || t === 'BLOG' || t === 'WEB_2_0' || t === 'PRESS_RELEASE';
}
