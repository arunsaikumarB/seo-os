/**
 * Deterministic submission-type classification (no LLM).
 * Distinguishes business directories, social bookmarks, Web 2.0 articles, etc.
 */
export const SUBMISSION_TYPES = [
  'BUSINESS_DIRECTORY',
  'SOCIAL_BOOKMARK',
  'WEB2_ARTICLE',
  'PROFILE',
  'FORUM',
  'BLOG_COMMENT',
  'PRESS_RELEASE',
  'OTHER',
  'UNKNOWN',
] as const;

export type SubmissionType = (typeof SUBMISSION_TYPES)[number];

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
  /\bguest post\b/,
  /\bpost content\b/,
  /\bauthor bio\b/,
  /\bfeatured image\b/,
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
  /\bheadline\b/,
  /\bcompany information\b/,
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
  const profile = scoreType(blob, PROFILE_PATTERNS);
  const forum = scoreType(blob, FORUM_PATTERNS);
  const comment = scoreType(blob, BLOG_COMMENT_PATTERNS);
  const press = scoreType(blob, PRESS_PATTERNS);

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

  const ranked: Array<{ type: SubmissionType; score: number; evidence: string[] }> = [
    { type: 'SOCIAL_BOOKMARK' as const, score: social.score, evidence: social.evidence },
    { type: 'WEB2_ARTICLE' as const, score: web2.score, evidence: web2.evidence },
    { type: 'BUSINESS_DIRECTORY' as const, score: directory.score, evidence: directory.evidence },
    { type: 'PROFILE' as const, score: profile.score, evidence: profile.evidence },
    { type: 'FORUM' as const, score: forum.score, evidence: forum.evidence },
    { type: 'BLOG_COMMENT' as const, score: comment.score, evidence: comment.evidence },
    { type: 'PRESS_RELEASE' as const, score: press.score, evidence: press.evidence },
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
  if (/social_bookmark/.test(blob)) return 'SOCIAL_BOOKMARK';
  if (/web2|blog_submission|wiki/.test(blob)) return 'WEB2_ARTICLE';
  if (/article_submission|guest_post/.test(blob)) return 'WEB2_ARTICLE';
  if (/press/.test(blob)) return 'PRESS_RELEASE';
  if (/forum|reddit|quora|qa/.test(blob)) return 'FORUM';
  if (/blog_comment|comment/.test(blob)) return 'BLOG_COMMENT';
  if (/profile/.test(blob)) return 'PROFILE';
  if (/directory|citation|listing|marketplace/.test(blob)) return 'BUSINESS_DIRECTORY';
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
