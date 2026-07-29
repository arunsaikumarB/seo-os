/**
 * Web 2.0 / article platform intelligence.
 * Public HTML study (article + signup/login) + curated publish recipes.
 * Post editors stay behind login — we never invent scraped compose fields.
 */
import { normalizeSiteDomain } from './site-crawl.js';

export type Web2PlatformFamily =
  | 'free_blog_network'
  | 'medium'
  | 'blogger'
  | 'wordpress_com'
  | 'hashnode'
  | 'devto'
  | 'substack'
  | 'tumblr'
  | 'vocal'
  | 'wix'
  | 'weebly'
  | 'livejournal'
  | 'unknown_web2';

export type Web2PublishField =
  | 'title'
  | 'body'
  | 'tags'
  | 'featuredImage'
  | 'excerpt'
  | 'metaDescription'
  | 'metaTitle'
  | 'slug'
  | 'category';

export type Web2PublishedArticleHints = {
  title: string | null;
  wordCount: number;
  h2Count: number;
  hasStructuredData: boolean;
};

export type Web2Intelligence = {
  detected: boolean;
  confidence: number;
  family: Web2PlatformFamily | null;
  platformLabel: string | null;
  host: string;
  /** True for all known Web 2.0 publish platforms */
  loginRequiredForPublish: boolean;
  /** Public page only has comment + search forms — not compose */
  commentOnlyPublicForm: boolean;
  /** Signup / login field names seen on public pages */
  signupFields: string[];
  loginFields: string[];
  publishedArticle: Web2PublishedArticleHints | null;
  /** Curated expected publish fields (recipe — not scraped from editor) */
  publishFields: Web2PublishField[];
  storageType: 'web2';
  classificationHint: 'blog_submission' | 'article_submission';
  reasons: string[];
};

const FREE_BLOG_NETWORK_HOSTS = [
  'widblog.com',
  'post-blogs.com',
  'blogerus.com',
  'mybloglicious.com',
  'designertoblog.com',
  'mpeblog.com',
  'ivasdesign.com',
  'blogocial.com',
  'bloggeriew.com',
  'blogdigy.com',
  'bloguetechno.com',
  'blogolize.com',
  'bloggin-ads.com',
  'bloggazos.com',
];

const DEFAULT_PUBLISH_FIELDS: Web2PublishField[] = [
  'title',
  'body',
  'tags',
  'featuredImage',
  'excerpt',
  'metaDescription',
];

const FAMILY_RECIPES: Record<
  Exclude<Web2PlatformFamily, 'unknown_web2'>,
  { label: string; fields: Web2PublishField[]; classification: 'blog_submission' | 'article_submission' }
> = {
  free_blog_network: {
    label: 'Free blog network',
    fields: ['title', 'body', 'tags', 'featuredImage', 'excerpt', 'category'],
    classification: 'blog_submission',
  },
  medium: {
    label: 'Medium',
    fields: ['title', 'body', 'tags', 'featuredImage', 'excerpt'],
    classification: 'article_submission',
  },
  blogger: {
    label: 'Blogger',
    fields: ['title', 'body', 'tags', 'featuredImage', 'metaDescription'],
    classification: 'blog_submission',
  },
  wordpress_com: {
    label: 'WordPress.com',
    fields: ['title', 'body', 'tags', 'featuredImage', 'excerpt', 'slug', 'category'],
    classification: 'blog_submission',
  },
  hashnode: {
    label: 'Hashnode',
    fields: ['title', 'body', 'tags', 'featuredImage', 'metaTitle', 'metaDescription', 'slug'],
    classification: 'article_submission',
  },
  devto: {
    label: 'Dev.to',
    fields: ['title', 'body', 'tags', 'featuredImage'],
    classification: 'article_submission',
  },
  substack: {
    label: 'Substack',
    fields: ['title', 'body', 'featuredImage', 'excerpt'],
    classification: 'article_submission',
  },
  tumblr: {
    label: 'Tumblr',
    fields: ['title', 'body', 'tags'],
    classification: 'blog_submission',
  },
  vocal: {
    label: 'Vocal',
    fields: ['title', 'body', 'tags', 'featuredImage'],
    classification: 'article_submission',
  },
  wix: {
    label: 'Wix Blog',
    fields: ['title', 'body', 'tags', 'featuredImage', 'excerpt'],
    classification: 'blog_submission',
  },
  weebly: {
    label: 'Weebly Blog',
    fields: ['title', 'body', 'tags', 'featuredImage'],
    classification: 'blog_submission',
  },
  livejournal: {
    label: 'LiveJournal',
    fields: ['title', 'body', 'tags'],
    classification: 'blog_submission',
  },
};

function hostOf(urlOrHost: string): string {
  return normalizeSiteDomain(urlOrHost);
}

/** Match apex or subdomain (pramitihr.widblog.com → widblog.com). */
function matchesApex(host: string, apex: string): boolean {
  return host === apex || host.endsWith(`.${apex}`);
}

export function detectWeb2PlatformFamily(
  urlOrHost: string
): { family: Web2PlatformFamily; label: string } | null {
  const host = hostOf(urlOrHost);
  if (!host) return null;

  for (const apex of FREE_BLOG_NETWORK_HOSTS) {
    if (matchesApex(host, apex)) {
      return { family: 'free_blog_network', label: `Free blog (${apex})` };
    }
  }
  if (matchesApex(host, 'medium.com')) return { family: 'medium', label: 'Medium' };
  if (matchesApex(host, 'blogger.com') || matchesApex(host, 'blogspot.com')) {
    return { family: 'blogger', label: 'Blogger' };
  }
  if (matchesApex(host, 'wordpress.com')) {
    return { family: 'wordpress_com', label: 'WordPress.com' };
  }
  if (matchesApex(host, 'hashnode.dev') || matchesApex(host, 'hashnode.com')) {
    return { family: 'hashnode', label: 'Hashnode' };
  }
  if (matchesApex(host, 'dev.to')) return { family: 'devto', label: 'Dev.to' };
  if (matchesApex(host, 'substack.com')) return { family: 'substack', label: 'Substack' };
  if (matchesApex(host, 'tumblr.com')) return { family: 'tumblr', label: 'Tumblr' };
  if (matchesApex(host, 'vocal.media')) return { family: 'vocal', label: 'Vocal' };
  if (matchesApex(host, 'wixsite.com') || matchesApex(host, 'wix.com')) {
    return { family: 'wix', label: 'Wix Blog' };
  }
  if (matchesApex(host, 'weebly.com')) return { family: 'weebly', label: 'Weebly Blog' };
  if (matchesApex(host, 'livejournal.com')) {
    return { family: 'livejournal', label: 'LiveJournal' };
  }
  return null;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFieldNames(formHtml: string): string[] {
  const names = new Set<string>();
  for (const m of formHtml.matchAll(/\b(?:name|id)=["']([^"']+)["']/gi)) {
    const n = m[1]?.trim();
    if (n && n.length < 64) names.add(n);
  }
  return [...names];
}

export function isCommentOnlyPublicForm(html: string): boolean {
  if (!html?.trim()) return false;
  const forms = [...html.matchAll(/<form\b[\s\S]*?<\/form>/gi)].map((m) => m[0]!);
  if (!forms.length) return false;
  let sawComment = false;
  for (const f of forms) {
    const names = extractFieldNames(f).map((n) => n.toLowerCase());
    const blob = f.toLowerCase();
    const isSearch =
      names.includes('s') ||
      /type=["']search["']/i.test(f) ||
      /\bname=["']s["']/i.test(f);
    const isComment =
      names.includes('comment') ||
      names.includes('commentform') ||
      /comment_post_id|leave a reply|leave a comment/i.test(blob);
    const isAuth =
      /\b(password|passwd|pass)\b/i.test(blob) &&
      /\b(usr|user|email|login|username)\b/i.test(blob);
    if (isSearch) continue;
    if (isComment) {
      sawComment = true;
      continue;
    }
    if (isAuth) continue;
    // Any other form → not comment-only
    return false;
  }
  return sawComment;
}

export function extractSignupLoginFields(html: string): {
  signupFields: string[];
  loginFields: string[];
} {
  const signupFields: string[] = [];
  const loginFields: string[] = [];
  if (!html?.trim()) return { signupFields, loginFields };

  for (const m of html.matchAll(/<form\b[\s\S]*?<\/form>/gi)) {
    const f = m[0]!;
    const names = extractFieldNames(f);
    const blob = f.toLowerCase();
    const hasPass = /\b(pass|password|passwd)\b/i.test(blob);
    const hasUser = /\b(usr|user|username|email)\b/i.test(blob);
    if (!hasPass || !hasUser) continue;
    const isSignup =
      /sign\s*up|register|create\s+account|overlay-signup/i.test(blob) ||
      names.some((n) => /signup|register|email/i.test(n));
    const isLogin = /log\s*in|sign\s*in|rememberme/i.test(blob) || names.includes('rememberme');
    if (isSignup) signupFields.push(...names);
    else if (isLogin) loginFields.push(...names);
    else loginFields.push(...names);
  }
  return {
    signupFields: [...new Set(signupFields)],
    loginFields: [...new Set(loginFields)],
  };
}

export function extractPublishedArticleHints(html: string): Web2PublishedArticleHints | null {
  if (!html?.trim()) return null;
  const title =
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1] ??
    /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1]?.trim() ??
    null;
  const articleChunk =
    /<article\b[\s\S]*?<\/article>/i.exec(html)?.[0] ??
    /<div[^>]+class=["'][^"']*(?:entry-content|post-content|article-body)[^"']*["'][\s\S]*?<\/div>/i.exec(
      html
    )?.[0] ??
    '';
  const text = stripTags(articleChunk || html).slice(0, 50_000);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const h2Count = (html.match(/<h2\b/gi) ?? []).length;
  const hasStructuredData =
    /application\/ld\+json/i.test(html) || /og:type["']\s+content=["']article/i.test(html);
  if (!title && wordCount < 80) return null;
  return {
    title: title ? stripTags(title).slice(0, 200) : null,
    wordCount,
    h2Count,
    hasStructuredData,
  };
}

/**
 * Analyze a URL (+ optional public HTML) for Web 2.0 publish workflow.
 * Host recipe works even when HTML is missing (403 / login wall).
 */
export function analyzeWeb2Platform(input: {
  url: string;
  html?: string | null;
  httpStatus?: number | null;
}): Web2Intelligence {
  const host = hostOf(input.url);
  const hit = detectWeb2PlatformFamily(input.url);
  const html = input.html ?? '';
  const reasons: string[] = [];

  if (!hit) {
    // Heuristic: published article + comment form on unknown host
    const commentOnly = isCommentOnlyPublicForm(html);
    const article = extractPublishedArticleHints(html);
    if (commentOnly && article && article.wordCount >= 120) {
      reasons.push('heuristic_published_article_comment_form');
      return {
        detected: true,
        confidence: 55,
        family: 'unknown_web2',
        platformLabel: 'Web 2.0 / blog (heuristic)',
        host,
        loginRequiredForPublish: true,
        commentOnlyPublicForm: true,
        signupFields: [],
        loginFields: [],
        publishedArticle: article,
        publishFields: DEFAULT_PUBLISH_FIELDS,
        storageType: 'web2',
        classificationHint: 'blog_submission',
        reasons,
      };
    }
    return {
      detected: false,
      confidence: 0,
      family: null,
      platformLabel: null,
      host,
      loginRequiredForPublish: false,
      commentOnlyPublicForm: false,
      signupFields: [],
      loginFields: [],
      publishedArticle: null,
      publishFields: [],
      storageType: 'web2',
      classificationHint: 'blog_submission',
      reasons: ['not_web2_host'],
    };
  }

  const recipe =
    hit.family === 'unknown_web2'
      ? {
          label: hit.label,
          fields: DEFAULT_PUBLISH_FIELDS,
          classification: 'blog_submission' as const,
        }
      : FAMILY_RECIPES[hit.family];

  const { signupFields, loginFields } = extractSignupLoginFields(html);
  const commentOnly = html ? isCommentOnlyPublicForm(html) : false;
  const publishedArticle = html ? extractPublishedArticleHints(html) : null;

  reasons.push(`host:${hit.family}`);
  if (commentOnly) reasons.push('comment_only_public_form');
  if (signupFields.length) reasons.push('signup_fields_public');
  if (loginFields.length) reasons.push('login_fields_public');
  if (publishedArticle) reasons.push('published_article_hints');
  if (input.httpStatus != null && input.httpStatus >= 400) {
    reasons.push(`http_${input.httpStatus}_host_recipe`);
  }
  reasons.push('login_required_for_publish');

  let confidence = 88;
  if (!html) confidence = 72;
  if (publishedArticle) confidence = Math.min(96, confidence + 6);
  if (commentOnly) confidence = Math.min(96, confidence + 4);

  return {
    detected: true,
    confidence,
    family: hit.family,
    platformLabel: recipe.label,
    host,
    loginRequiredForPublish: true,
    commentOnlyPublicForm: commentOnly,
    signupFields,
    loginFields,
    publishedArticle,
    publishFields: recipe.fields,
    storageType: 'web2',
    classificationHint: recipe.classification,
    reasons,
  };
}

/** Probe-friendly summary when Web 2.0 is detected. */
export function web2ProbeOverlay(web2: Web2Intelligence): {
  band: 'check' | 'blocked';
  formFound: boolean;
  fieldCount: number;
  hasTitle: boolean;
  hasDesc: boolean;
  hasUrl: boolean;
  hasEmail: boolean;
  gates: string[];
  reasons: string[];
  score: number;
} | null {
  if (!web2.detected) return null;
  const fields = web2.publishFields;
  return {
    band: web2.loginRequiredForPublish ? 'blocked' : 'check',
    formFound: true,
    fieldCount: fields.length,
    hasTitle: fields.includes('title'),
    hasDesc: fields.includes('body') || fields.includes('excerpt'),
    hasUrl: false,
    hasEmail: false,
    gates: web2.loginRequiredForPublish ? ['login'] : [],
    reasons: [
      'web2_publish',
      web2.platformLabel ? `platform:${web2.platformLabel}` : 'web2',
      ...web2.reasons.filter((r) => r !== 'login_required_for_publish'),
      'Publish editor requires platform login — use Generate Content pack',
    ],
    score: 45,
  };
}
