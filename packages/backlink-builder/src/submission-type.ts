/**
 * Deterministic backlink-type classification (no LLM).
 * Canonical taxonomy used everywhere — not free-text.
 * Existing `submissionType` fields stay as aliases of BacklinkType.
 */
export const BACKLINK_TYPES = [
  'WEB_DIRECTORY',
  'BUSINESS_DIRECTORY',
  'LOCAL_DIRECTORY',
  'SOCIAL_BOOKMARK',
  'WEB2_ARTICLE',
  'PROFILE',
  'FORUM',
  'BLOG_COMMENT',
  'CLASSIFIED',
  'PRESS_RELEASE',
  'RESOURCE_PAGE',
  'GUEST_POST',
  'QA',
  'OTHER',
  'UNKNOWN',
] as const;

/** Canonical enum. Prefer this name in new code. */
export type BacklinkType = (typeof BACKLINK_TYPES)[number];

/** @deprecated alias — same values as BacklinkType */
export const SUBMISSION_TYPES = BACKLINK_TYPES;
export type SubmissionType = BacklinkType;

export const PRICING_STATUSES = ['FREE', 'FREE_AND_PAID', 'PAID_ONLY', 'UNKNOWN'] as const;
export type PricingStatus = (typeof PRICING_STATUSES)[number];

export const SUBMISSION_METHODS = [
  'FORM',
  'ARTICLE_EDITOR',
  'PROFILE_EDITOR',
  'COMMENT_FORM',
  'FORUM_EDITOR',
  'EMAIL',
  'CONTACT_FORM',
  'API',
  'UNKNOWN',
] as const;
export type SubmissionMethod = (typeof SUBMISSION_METHODS)[number];

export const UNKNOWN_TYPE_MESSAGE = 'Submission type could not be confidently determined.';

export const BACKLINK_TYPE_LABELS: Record<BacklinkType, string> = {
  WEB_DIRECTORY: 'Web Directory',
  BUSINESS_DIRECTORY: 'Business Directory',
  LOCAL_DIRECTORY: 'Local Directory',
  SOCIAL_BOOKMARK: 'Social Bookmark',
  WEB2_ARTICLE: 'Web 2.0',
  PROFILE: 'Profile',
  FORUM: 'Forum',
  BLOG_COMMENT: 'Blog Comment',
  CLASSIFIED: 'Classified',
  PRESS_RELEASE: 'Press Release',
  RESOURCE_PAGE: 'Resource Page',
  GUEST_POST: 'Guest Post',
  QA: 'Q&A',
  OTHER: 'Other',
  UNKNOWN: 'Unknown',
};

export const BACKLINK_TYPE_FILTERS: Array<{ id: 'ALL' | BacklinkType; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'WEB_DIRECTORY', label: 'Web Directory' },
  { id: 'BUSINESS_DIRECTORY', label: 'Business Directory' },
  { id: 'LOCAL_DIRECTORY', label: 'Local Directory' },
  { id: 'SOCIAL_BOOKMARK', label: 'Social Bookmark' },
  { id: 'WEB2_ARTICLE', label: 'Web 2.0' },
  { id: 'PROFILE', label: 'Profile' },
  { id: 'FORUM', label: 'Forum' },
  { id: 'BLOG_COMMENT', label: 'Blog Comment' },
  { id: 'CLASSIFIED', label: 'Classified' },
  { id: 'PRESS_RELEASE', label: 'Press Release' },
  { id: 'RESOURCE_PAGE', label: 'Resource' },
  { id: 'GUEST_POST', label: 'Guest Post' },
  { id: 'QA', label: 'Q&A' },
  { id: 'UNKNOWN', label: 'Unknown' },
];

const TYPE_SET = new Set<string>(BACKLINK_TYPES);

export function isBacklinkType(value: string | null | undefined): value is BacklinkType {
  return !!value && TYPE_SET.has(value);
}

export function backlinkTypeLabel(type: string | null | undefined): string {
  if (isBacklinkType(type)) return BACKLINK_TYPE_LABELS[type];
  return 'Unknown';
}

/** Types that may be prepared but must never be auto-submitted. */
export function requiresHumanReview(type: BacklinkType): boolean {
  return type === 'FORUM' || type === 'BLOG_COMMENT' || type === 'QA' || type === 'GUEST_POST';
}

export type SubmissionTypeResult = {
  submissionType: SubmissionType;
  submissionTypeConfidence: number;
  submissionTypeEvidence: string[];
};

export type SubmissionTypeSignals = {
  url?: string | null;
  title?: string | null;
  headings?: string[] | null;
  labels?: string[] | null;
  fieldNames?: string[] | null;
  placeholders?: string[] | null;
  buttons?: string[] | null;
  visibleText?: string | null;
  formActions?: string[] | null;
};

function norm(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function blobOf(signals: SubmissionTypeSignals): string {
  return [
    signals.url,
    signals.title,
    ...(signals.headings ?? []),
    ...(signals.labels ?? []),
    ...(signals.fieldNames ?? []),
    ...(signals.placeholders ?? []),
    ...(signals.buttons ?? []),
    signals.visibleText?.slice(0, 8000),
    ...(signals.formActions ?? []),
  ]
    .filter(Boolean)
    .map((x) => norm(String(x)))
    .join('\n');
}

function countHits(blob: string, patterns: RegExp[]): { n: number; evidence: string[] } {
  const evidence: string[] = [];
  let n = 0;
  for (const p of patterns) {
    const m = blob.match(p);
    if (m) {
      n += 1;
      evidence.push(m[0].slice(0, 60));
    }
  }
  return { n, evidence };
}

const SOCIAL_BOOKMARK_PATTERNS = [
  /\bstory title\b/,
  /\barticle details\b/,
  /\bsubmit story\b/,
  /\bsubmit link\b/,
  /\bsave story\b/,
  /\bnews story\b/,
  /\bstory you are linking to\b/,
  /\bwrite your own description of the news story\b/,
  /\bexamples:\s*web,\s*programming/,
  /\bsocial bookmark\b/,
  /\bbookmark this\b/,
  /\bpligg\b/,
];

const WEB2_ARTICLE_PATTERNS = [
  /\barticle body\b/,
  /\bsubmit article\b/,
  /\bwrite article\b/,
  /\bnew article\b/,
  /\bcreate post\b/,
  /\bpublish (post|article|story)\b/,
  /\bfull article\b/,
  /\bpost content\b/,
  /\bauthor bio\b/,
  /\bfeatured image\b/,
  /\bheadline\b/,
];

const DIRECTORY_PATTERNS = [
  /\bbusiness name\b/,
  /\bcompany name\b/,
  /\blisting title\b/,
  /\bcategory\b/,
  /\bshort description\b/,
  /\blong description\b/,
  /\bowner (name|email)\b/,
  /\byour email\b/,
  /\bphone\b/,
  /\baddress\b/,
  /\bcity\b/,
  /\bstate\b/,
  /\bcountry\b/,
  /\bzip\b/,
  /\bsubmit.?listing\b/,
  /\badd.?listing\b/,
  /\bdirectory\b/,
];

const PROFILE_PATTERNS = [
  /\busername\b/,
  /\bdisplay name\b/,
  /\babout me\b/,
  /\bprofile (description|url|bio)\b/,
  /\bavatar\b/,
  /\bsocial links\b/,
  /\bcreate (your )?profile\b/,
];

const FORUM_PATTERNS = [
  /\bnew thread\b/,
  /\bpost reply\b/,
  /\bforum\b/,
  /\btopic title\b/,
  /\bmessage body\b/,
  /\bsignature\b/,
  /\bcommunity\b/,
];

const BLOG_COMMENT_PATTERNS = [
  /\bleave a comment\b/,
  /\bpost comment\b/,
  /\bcomment\b/,
  /\byour comment\b/,
];

const PRESS_PATTERNS = [
  /\bpress release\b/,
  /\bdateline\b/,
  /\brelease date\b/,
  /\bpublish release\b/,
  /\bcompany information\b/,
];

const LOCAL_DIRECTORY_PATTERNS = [
  /\bhours\b/,
  /\bopening hours\b/,
  /\bservice area\b/,
  /\blocal business\b/,
  /\bgoogle map\b/,
  /\bmap location\b/,
  /\bzip(?:code)?\b/,
  /\bpostal code\b/,
  /\bcitation\b/,
];

const WEB_DIRECTORY_PATTERNS = [
  /\bsubmit website\b/,
  /\badd website\b/,
  /\bsubmit (a )?url\b/,
  /\bwebsite directory\b/,
  /\bweb directory\b/,
  /\badd (a )?link\b/,
  /\bsuggest (a )?site\b/,
];

const CLASSIFIED_PATTERNS = [
  /\bpost (an )?ad\b/,
  /\bplace (an )?ad\b/,
  /\bclassified\b/,
  /\bcreate listing\b/,
  /\badvertisement\b/,
  /\bfor sale\b/,
];

const RESOURCE_PATTERNS = [
  /\badd resource\b/,
  /\bsuggest resource\b/,
  /\bsuggest a website\b/,
  /\brecommend a resource\b/,
  /\bsubmit resource\b/,
  /\buseful links\b/,
];

const GUEST_POST_PATTERNS = [
  /\bwrite for us\b/,
  /\bguest post\b/,
  /\bguest author\b/,
  /\bbecome a contributor\b/,
  /\bcontributor guidelines\b/,
  /\bsubmit (a )?guest\b/,
];

const QA_PATTERNS = [
  /\bask (a )?question\b/,
  /\bpost (an )?answer\b/,
  /\bcommunity questions\b/,
  /\byour answer\b/,
  /\bquestion title\b/,
];

function scoreType(
  blob: string,
  patterns: RegExp[],
  boost = 0
): { score: number; evidence: string[] } {
  const { n, evidence } = countHits(blob, patterns);
  if (n === 0) return { score: 0, evidence: [] };
  // 1 hit ≈ 0.35, 2 ≈ 0.55, 3+ ≈ 0.75+, capped
  const score = Math.min(0.99, 0.28 + n * 0.22 + boost);
  return { score, evidence: [...new Set(evidence)].slice(0, 8) };
}

/**
 * Classify the live form / page into a submission type.
 * Prefers SOCIAL_BOOKMARK when Pligg-style "Story Title + Tags + news story" signals dominate.
 */
export function classifySubmissionType(signals: SubmissionTypeSignals): SubmissionTypeResult {
  const blob = blobOf(signals);
  if (!blob.trim()) {
    return {
      submissionType: 'UNKNOWN',
      submissionTypeConfidence: 0,
      submissionTypeEvidence: [],
    };
  }

  const path = norm(signals.url ?? '');
  const pathBoost =
    /\/submit|\/submit-story|\/submit-link|\/submit-article|\/add-listing|\/new-story/.test(path)
      ? 0.08
      : 0;

  const social = scoreType(blob, SOCIAL_BOOKMARK_PATTERNS, pathBoost);
  // Extra boost when classic Pligg trio is present
  const hasStoryTitle = /\bstory title\b/.test(blob);
  const hasTags = /\btags?\b/.test(blob) && !/\bmeta keywords\b/.test(blob);
  const hasNewsDesc =
    /\bnews story\b/.test(blob) ||
    /\bstory you are linking\b/.test(blob) ||
    /\barticle details\b/.test(blob);
  if (hasStoryTitle && hasTags && hasNewsDesc) {
    social.score = Math.min(0.99, Math.max(social.score, 0.92));
    for (const e of ['Story Title', 'Tags', 'Article Details']) {
      if (!social.evidence.includes(e)) social.evidence.push(e);
    }
  }

  const web2 = scoreType(blob, WEB2_ARTICLE_PATTERNS, pathBoost);
  // Large article body + publish without "linking to" → WEB2
  if (/\barticle body\b/.test(blob) || (/\bpublish\b/.test(blob) && /\b(post|article)\b/.test(blob))) {
    if (!hasStoryTitle || /\barticle body\b/.test(blob)) {
      web2.score = Math.min(0.99, Math.max(web2.score, 0.7));
    }
  }

  const directory = scoreType(blob, DIRECTORY_PATTERNS, pathBoost);
  const local = scoreType(blob, LOCAL_DIRECTORY_PATTERNS, pathBoost);
  const webDir = scoreType(blob, WEB_DIRECTORY_PATTERNS, pathBoost);
  const profile = scoreType(blob, PROFILE_PATTERNS);
  const forum = scoreType(blob, FORUM_PATTERNS);
  const comment = scoreType(blob, BLOG_COMMENT_PATTERNS);
  const press = scoreType(blob, PRESS_PATTERNS);
  const classified = scoreType(blob, CLASSIFIED_PATTERNS);
  const resource = scoreType(blob, RESOURCE_PATTERNS);
  const guest = scoreType(blob, GUEST_POST_PATTERNS, pathBoost);
  const qa = scoreType(blob, QA_PATTERNS);

  // Disambiguate SOCIAL_BOOKMARK vs WEB2_ARTICLE
  if (social.score >= 0.55 && hasStoryTitle && hasNewsDesc && !/\barticle body\b/.test(blob)) {
    web2.score *= 0.45;
  }
  if (web2.score >= 0.7 && /\barticle body\b/.test(blob)) {
    social.score *= 0.5;
  }

  // Blog comment: name+email+comment without business fields
  if (comment.score >= 0.5 && directory.score < 0.45 && !hasStoryTitle) {
    // keep
  } else if (comment.score > 0 && (directory.score >= 0.5 || social.score >= 0.5)) {
    comment.score *= 0.3;
  }

  const businessListing =
    /\b(business|company) name\b/.test(blob) &&
    (/\b(address|phone|city)\b/.test(blob) || /\bsubmit (business|listing|company)\b/.test(blob));
  if (businessListing) {
    directory.score = Math.min(0.99, Math.max(directory.score, 0.72));
    webDir.score *= 0.4;
  }
  const localStrong =
    /\b(hours|service area|local business|postal code)\b/.test(blob) ||
    (/\bzip\b/.test(blob) && /\b(address|city)\b/.test(blob));
  if (localStrong && directory.score >= 0.35) {
    local.score = Math.min(0.99, Math.max(local.score, directory.score + 0.08));
  } else {
    local.score *= 0.45;
  }
  if (webDir.score >= 0.5 && !businessListing && !localStrong) {
    directory.score *= 0.55;
  }

  if (guest.score >= 0.5) {
    web2.score *= 0.45;
  }
  if (/\bpress release\b/.test(blob)) {
    press.score = Math.min(0.99, Math.max(press.score, 0.8));
    web2.score *= 0.4;
  }
  if (qa.score >= 0.5 && !/\bnew thread\b/.test(blob)) {
    forum.score *= 0.4;
  } else if (forum.score >= 0.5) {
    qa.score *= 0.35;
  }

  const ranked: Array<{ type: SubmissionType; score: number; evidence: string[] }> = [
    { type: 'SOCIAL_BOOKMARK', score: social.score, evidence: social.evidence },
    { type: 'WEB2_ARTICLE', score: web2.score, evidence: web2.evidence },
    { type: 'GUEST_POST', score: guest.score, evidence: guest.evidence },
    { type: 'LOCAL_DIRECTORY', score: local.score, evidence: local.evidence },
    { type: 'BUSINESS_DIRECTORY', score: directory.score, evidence: directory.evidence },
    { type: 'WEB_DIRECTORY', score: webDir.score, evidence: webDir.evidence },
    { type: 'PROFILE', score: profile.score, evidence: profile.evidence },
    { type: 'FORUM', score: forum.score, evidence: forum.evidence },
    { type: 'QA', score: qa.score, evidence: qa.evidence },
    { type: 'BLOG_COMMENT', score: comment.score, evidence: comment.evidence },
    { type: 'CLASSIFIED', score: classified.score, evidence: classified.evidence },
    { type: 'PRESS_RELEASE', score: press.score, evidence: press.evidence },
    { type: 'RESOURCE_PAGE', score: resource.score, evidence: resource.evidence },
  ];
  ranked.sort((a, b) => b.score - a.score);

  const best = ranked[0]!;
  if (best.score < 0.35) {
    return {
      submissionType: best.score > 0.15 ? 'OTHER' : 'UNKNOWN',
      submissionTypeConfidence: Math.round(best.score * 100) / 100,
      submissionTypeEvidence: best.evidence.slice(0, 6),
    };
  }

  return {
    submissionType: best.type,
    submissionTypeConfidence: Math.round(best.score * 100) / 100,
    submissionTypeEvidence: best.evidence.slice(0, 8),
  };
}

/** Map storage / classification ids into SubmissionType when live DOM is unavailable. */
export function submissionTypeFromStorage(
  storageType?: string | null,
  classificationId?: string | null
): SubmissionType {
  const blob = `${storageType ?? ''} ${classificationId ?? ''}`.toLowerCase();
  if (isBacklinkType(String(storageType ?? '').trim().toUpperCase())) {
    return String(storageType).trim().toUpperCase() as BacklinkType;
  }
  if (/social_bookmark/.test(blob)) return 'SOCIAL_BOOKMARK';
  if (/guest_post|write_for_us|contributor/.test(blob)) return 'GUEST_POST';
  if (/web2|blog_submission|wiki/.test(blob)) return 'WEB2_ARTICLE';
  if (/article_submission/.test(blob)) return 'WEB2_ARTICLE';
  if (/press/.test(blob)) return 'PRESS_RELEASE';
  if (/classified|post_ad/.test(blob)) return 'CLASSIFIED';
  if (/resource_page|suggest_resource/.test(blob)) return 'RESOURCE_PAGE';
  if (/\bqa\b|quora|question/.test(blob)) return 'QA';
  if (/forum|reddit/.test(blob)) return 'FORUM';
  if (/blog_comment|comment/.test(blob)) return 'BLOG_COMMENT';
  if (/profile/.test(blob)) return 'PROFILE';
  if (/local_directory|citation/.test(blob)) return 'LOCAL_DIRECTORY';
  if (/web_directory/.test(blob)) return 'WEB_DIRECTORY';
  if (/business_directory|directory|listing|marketplace/.test(blob)) return 'BUSINESS_DIRECTORY';
  return 'UNKNOWN';
}

export function inferSubmissionMethod(
  type: BacklinkType,
  signals: SubmissionTypeSignals = {}
): SubmissionMethod {
  const blob = blobOf(signals);
  if (/\bapi\b|\/api\//.test(blob) && type !== 'UNKNOWN') return 'API';
  switch (type) {
    case 'WEB2_ARTICLE':
      return 'ARTICLE_EDITOR';
    case 'PROFILE':
      return 'PROFILE_EDITOR';
    case 'BLOG_COMMENT':
      return 'COMMENT_FORM';
    case 'FORUM':
      return 'FORUM_EDITOR';
    case 'GUEST_POST':
      if (/\b(email|mailto:|contact)\b/.test(blob) && !/\b(article body|submit article)\b/.test(blob)) {
        return 'EMAIL';
      }
      if (/\barticle body\b|\bsubmit article\b/.test(blob)) return 'ARTICLE_EDITOR';
      return 'FORM';
    case 'QA':
      return 'FORUM_EDITOR';
    case 'UNKNOWN':
    case 'OTHER':
      return 'UNKNOWN';
    default:
      return 'FORM';
  }
}

export function pricingStatusFromListing(
  kind: string | null | undefined,
  opts?: { freeAndPaid?: boolean }
): PricingStatus {
  if (opts?.freeAndPaid) return 'FREE_AND_PAID';
  const k = String(kind ?? '').toLowerCase();
  if (k === 'free' || k === 'free_and_paid') return k === 'free_and_paid' ? 'FREE_AND_PAID' : 'FREE';
  if (k === 'paid' || k === 'paid_only') return 'PAID_ONLY';
  return 'UNKNOWN';
}

export type TypedContentViews = {
  businessDirectoryContent: {
    businessName: string;
    website: string;
    description: string;
    shortDescription: string;
    longDescription: string;
    email: string;
    phone: string;
    address: string;
    category: string;
    keywords: string;
  };
  socialBookmarkContent: {
    title: string;
    tags: string;
    description: string;
    url: string;
  };
  web2ArticleContent: {
    title: string;
    excerpt: string;
    body: string;
    tags: string;
    author: string;
    url: string;
  };
  profileContent: {
    displayName: string;
    bio: string;
    website: string;
    email: string;
  };
  forumContent: {
    topic: string;
    message: string;
    signature: string;
  };
  blogCommentContent: {
    name: string;
    email: string;
    website: string;
    comment: string;
  };
  pressReleaseContent: {
    headline: string;
    summary: string;
    body: string;
    contact: string;
  };
};

/** Build type-specific content views from a flat content source (project-scoped). */
export function buildTypedContentViews(input: {
  businessName?: string | null;
  title?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
  metaDescription?: string | null;
  articleBody?: string | null;
  body?: string | null;
  keywords?: string | null;
  url?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  category?: string | null;
  contactName?: string | null;
  excerpt?: string | null;
}): TypedContentViews {
  const businessName = String(input.businessName ?? '').trim();
  const title = String(input.title ?? businessName).trim();
  const shortDescription = String(
    input.shortDescription || input.metaDescription || input.longDescription || ''
  ).trim();
  const longDescription = String(
    input.longDescription || input.shortDescription || ''
  ).trim();
  const body = String(input.articleBody || input.body || longDescription || shortDescription).trim();
  const keywords = String(input.keywords ?? '').trim();
  const url = String(input.url ?? '').trim();
  const email = String(input.email ?? '').trim();
  const phone = String(input.phone ?? '').trim();
  const address = String(input.address ?? '').trim();
  const category = String(input.category ?? '').trim();
  const contactName = String(input.contactName || businessName).trim();
  const excerpt = String(input.excerpt || shortDescription).trim();

  // Social bookmark description: 2–4 sentences, not a full directory dump
  const socialDesc =
    shortDescription ||
    (longDescription.length <= 400 ? longDescription : longDescription.slice(0, 380).trim());

  return {
    businessDirectoryContent: {
      businessName,
      website: url,
      description: longDescription || shortDescription,
      shortDescription,
      longDescription,
      email,
      phone,
      address,
      category,
      keywords,
    },
    socialBookmarkContent: {
      title: title || businessName,
      tags: keywords,
      description: socialDesc,
      url,
    },
    web2ArticleContent: {
      title: title || businessName,
      excerpt,
      body,
      tags: keywords,
      author: contactName || businessName,
      url,
    },
    profileContent: {
      displayName: businessName || contactName,
      bio: shortDescription || longDescription,
      website: url,
      email,
    },
    forumContent: {
      topic: title || businessName,
      message: shortDescription || longDescription,
      signature: businessName && url ? `${businessName} — ${url}` : businessName,
    },
    blogCommentContent: {
      name: contactName || businessName,
      email,
      website: url,
      comment: shortDescription || longDescription,
    },
    pressReleaseContent: {
      headline: title || businessName,
      summary: shortDescription,
      body,
      contact: [contactName, email, phone].filter(Boolean).join(' · '),
    },
  };
}

/**
 * Flatten typed views into Companion ActivePackage field keys for the detected type.
 * Reuses existing fill roles: title, keywords, description, url, article, businessName, …
 */
export function activeFieldsForSubmissionType(
  type: SubmissionType,
  views: TypedContentViews
): Array<{ key: string; value: string }> {
  const put = (rows: Array<{ key: string; value: string }>, key: string, value: string) => {
    const v = value.trim();
    if (!key || !v) return;
    if (!rows.some((r) => r.key === key)) rows.push({ key, value: v });
  };
  const rows: Array<{ key: string; value: string }> = [];

  switch (type) {
    case 'SOCIAL_BOOKMARK': {
      const c = views.socialBookmarkContent;
      put(rows, 'title', c.title);
      put(rows, 'keywords', c.tags);
      put(rows, 'shortDescription', c.description);
      put(rows, 'description', c.description);
      put(rows, 'url', c.url);
      break;
    }
    case 'WEB2_ARTICLE': {
      const c = views.web2ArticleContent;
      put(rows, 'title', c.title);
      put(rows, 'article', c.body);
      put(rows, 'shortDescription', c.excerpt);
      put(rows, 'description', c.excerpt);
      put(rows, 'keywords', c.tags);
      put(rows, 'businessName', c.author);
      put(rows, 'url', c.url);
      break;
    }
    case 'PROFILE': {
      const c = views.profileContent;
      put(rows, 'businessName', c.displayName);
      put(rows, 'description', c.bio);
      put(rows, 'shortDescription', c.bio);
      put(rows, 'url', c.website);
      put(rows, 'email', c.email);
      break;
    }
    case 'FORUM': {
      const c = views.forumContent;
      put(rows, 'title', c.topic);
      put(rows, 'description', c.message);
      put(rows, 'article', c.message);
      put(rows, 'businessName', c.signature);
      break;
    }
    case 'BLOG_COMMENT': {
      const c = views.blogCommentContent;
      put(rows, 'businessName', c.name);
      put(rows, 'email', c.email);
      put(rows, 'url', c.website);
      put(rows, 'description', c.comment);
      break;
    }
    case 'PRESS_RELEASE': {
      const c = views.pressReleaseContent;
      put(rows, 'title', c.headline);
      put(rows, 'shortDescription', c.summary);
      put(rows, 'article', c.body);
      put(rows, 'description', c.summary);
      put(rows, 'businessName', c.contact);
      break;
    }
    case 'GUEST_POST': {
      const c = views.web2ArticleContent;
      put(rows, 'title', c.title);
      put(rows, 'article', c.body);
      put(rows, 'shortDescription', c.excerpt);
      put(rows, 'description', c.excerpt);
      put(rows, 'keywords', c.tags);
      put(rows, 'businessName', c.author);
      put(rows, 'url', c.url);
      break;
    }
    case 'RESOURCE_PAGE': {
      const c = views.socialBookmarkContent;
      put(rows, 'title', c.title);
      put(rows, 'url', c.url);
      put(rows, 'description', c.description);
      put(rows, 'shortDescription', c.description);
      put(rows, 'keywords', c.tags);
      break;
    }
    case 'CLASSIFIED': {
      const c = views.businessDirectoryContent;
      put(rows, 'title', c.businessName);
      put(rows, 'description', c.description);
      put(rows, 'phone', c.phone);
      put(rows, 'email', c.email);
      put(rows, 'url', c.website);
      put(rows, 'category', c.category);
      put(rows, 'address', c.address);
      break;
    }
    case 'QA': {
      const c = views.forumContent;
      put(rows, 'title', c.topic);
      put(rows, 'description', c.message);
      put(rows, 'article', c.message);
      break;
    }
    case 'WEB_DIRECTORY':
    case 'LOCAL_DIRECTORY':
    case 'BUSINESS_DIRECTORY':
    default: {
      const c = views.businessDirectoryContent;
      put(rows, 'businessName', c.businessName);
      put(rows, 'title', c.businessName);
      put(rows, 'url', c.website);
      put(rows, 'shortDescription', c.shortDescription);
      put(rows, 'description', c.longDescription || c.description);
      put(rows, 'email', c.email);
      put(rows, 'phone', c.phone);
      put(rows, 'address', c.address);
      put(rows, 'category', c.category);
      put(rows, 'keywords', c.keywords);
      break;
    }
  }
  return rows;
}

export type TypeContentPackage = {
  projectId: string;
  opportunityId: string;
  backlinkType: BacklinkType;
  submissionMethod: SubmissionMethod;
  fields: Array<{ key: string; value: string }>;
  humanReviewRequired: boolean;
};

export function buildTypeContentPackage(input: {
  projectId: string;
  opportunityId: string;
  backlinkType: BacklinkType;
  views: TypedContentViews;
  signals?: SubmissionTypeSignals;
}): TypeContentPackage {
  return {
    projectId: input.projectId,
    opportunityId: input.opportunityId,
    backlinkType: input.backlinkType,
    submissionMethod: inferSubmissionMethod(input.backlinkType, input.signals),
    fields: activeFieldsForSubmissionType(input.backlinkType, input.views),
    humanReviewRequired: requiresHumanReview(input.backlinkType),
  };
}

/** Stop if a package was generated for a different project. Never fall back. */
export function assertPackageProject(
  pkg: { projectId?: string | null },
  currentProjectId: string
): void {
  if (!pkg.projectId || pkg.projectId !== currentProjectId) {
    throw new Error('Content package project mismatch — refusing cross-project content');
  }
}

/** Extra aliases applied after domain knowledge, before generic aliases. */
export function typeAwareFieldAliases(
  type: BacklinkType
): Record<string, string[]> {
  switch (type) {
    case 'SOCIAL_BOOKMARK':
      return {
        title: ['story title', 'submit story', 'link title'],
        keywords: ['tags', 'story tags'],
        description: ['description', 'story description'],
        url: ['url', 'story url', 'link url'],
      };
    case 'WEB2_ARTICLE':
    case 'GUEST_POST':
      return {
        title: ['article title', 'headline'],
        article: ['article body', 'content', 'post content'],
        shortDescription: ['excerpt', 'summary'],
        keywords: ['tags'],
        businessName: ['author', 'guest author'],
      };
    case 'PROFILE':
      return {
        businessName: ['display name', 'username'],
        description: ['bio', 'about me', 'profile description'],
        url: ['website', 'profile url'],
      };
    case 'WEB_DIRECTORY':
    case 'BUSINESS_DIRECTORY':
    case 'LOCAL_DIRECTORY':
      return {
        businessName: ['business name', 'company name'],
        url: ['website', 'business url'],
        description: ['business description', 'company description'],
      };
    default:
      return {};
  }
}

export type BacklinkOpportunityDimensions = {
  backlinkType: BacklinkType;
  backlinkTypeConfidence: number;
  pricingStatus: PricingStatus;
  submissionMethod: SubmissionMethod;
};

/** Keep type, pricing, and method as independent dimensions. */
export function independentDimensions(input: {
  backlinkType: BacklinkType;
  confidence?: number;
  listingPricing?: string | null;
  freeAndPaid?: boolean;
  signals?: SubmissionTypeSignals;
}): BacklinkOpportunityDimensions {
  return {
    backlinkType: input.backlinkType,
    backlinkTypeConfidence: input.confidence ?? 0,
    pricingStatus: pricingStatusFromListing(input.listingPricing, {
      freeAndPaid: input.freeAndPaid,
    }),
    submissionMethod: inferSubmissionMethod(input.backlinkType, input.signals),
  };
}
