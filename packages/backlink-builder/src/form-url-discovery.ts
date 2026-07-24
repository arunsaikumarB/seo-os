/**
 * Form Reader — submission page discovery.
 * Prefer Site Intelligence / cached resolvedFormUrl; else bounded same-domain crawl.
 * Pure helpers (no fetch) — the API owns HTTP + robots.txt.
 *
 * Deliberately does not import assisted-manual (avoids circular deps).
 */
import {
  absolutizeUrl,
  extractInternalLinks,
  normalizeSiteDomain,
  sameDomain,
} from './site-crawl.js';

export const FORM_DISCOVERY_DEFAULTS = {
  /** Top candidate links to fetch after the seed. */
  maxCandidates: 5,
  /** Max crawl depth from the imported entry URL. */
  maxDepth: 2,
  /** Hard cap on pages fetched during discovery (seed + candidates). */
  maxPages: 8,
  /** Minimum score to treat a page as a real submission form. */
  minFormScore: 4,
} as const;

/**
 * Anchor / href intent — submit, add site/url/link/business/listing/company,
 * suggest, list your business, write for us, contribute, get listed, post.
 */
export const SUBMISSION_INTENT_RE =
  /\b(submit|add[\s_-]?(a[\s_-]?)?(site|url|link|business|listing|company)|suggest|list[\s_-]?your[\s_-]?business|write[\s_-]?for[\s_-]?us|contribute|get[\s_-]?listed|guest[\s_-]?post|post[\s_-]?a?\s*(link|site|listing)?|add[\s_-]?your|register[\s_-]?site|new[\s_-]?listing)\b/i;

export const SUBMISSION_PATH_RE =
  /\/(submit|add[-_]?url|add[-_]?site|add[-_]?link|add[-_]?listing|suggest|contribute|write[-_]?for[-_]?us|guest[-_]?post|linkman|get[-_]?listed|list[-_]?(your[-_]?)?business|post)(\/|$|\.php|\.aspx|\.html?)/i;

export type FormDiscoverySource =
  | 'cache'
  | 'site_intelligence'
  | 'entry'
  | 'crawl'
  | 'none';

export type FormPageScore = {
  score: number;
  fieldCount: number;
  hasUrl: boolean;
  hasTitle: boolean;
  hasDesc: boolean;
  hasEmail: boolean;
  ignorable: boolean;
  reason: string;
};

export type FormUrlHintBundle = {
  resolvedFormUrl?: string | null;
  strategyEntryUrl?: string | null;
  strategyFallbacks?: Array<{ entryUrl?: string | null }>;
  learningSubmissionUrls?: string[];
  successfulPathUrls?: string[];
  directorySubmissionUrl?: string | null;
  contactFormSubmissionUrl?: string | null;
  pageClassificationUrls?: string[];
  divertedUrl?: string | null;
  metaEntryUrl?: string | null;
};

export type RankedFormCandidate = {
  url: string;
  score: number;
  fieldCount: number;
  ignorable: boolean;
};

/** True when link text or href looks like a submission path. */
export function isSubmissionIntentLink(url: string, anchorText: string): boolean {
  const blob = `${url} ${anchorText}`;
  return SUBMISSION_INTENT_RE.test(blob) || SUBMISSION_PATH_RE.test(url);
}

/** Higher = fetch first among same-domain candidates. */
export function submissionLinkScore(url: string, anchorText: string): number {
  const blob = `${url} ${anchorText}`.toLowerCase();
  let score = 0;
  if (SUBMISSION_PATH_RE.test(url)) score += 80;
  if (/write[\s_-]?for[\s_-]?us|guest[\s_-]?post|contribute/.test(blob)) score += 70;
  if (/submit/.test(blob)) score += 60;
  if (/add[\s_-]?(site|url|link|listing|business|company)/.test(blob)) score += 55;
  if (/list[\s_-]?your[\s_-]?business|get[\s_-]?listed|suggest/.test(blob)) score += 50;
  if (/linkman|directory.*form|form\.php/.test(blob)) score += 45;
  if (/post/.test(blob) && !/blog|news|article/.test(blob)) score += 25;
  if (/login|sign[\s_-]?in|cart|checkout|privacy|terms|cookie/.test(blob)) score -= 40;
  if (!isSubmissionIntentLink(url, anchorText) && score < 25) return 0;
  return score;
}

type RawField = { type: string; name: string; id: string; attrs: string };

function attrOf(attrs: string, name: string): string {
  const m = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(attrs);
  return (m?.[1] ?? '').toLowerCase();
}

/** Lightweight field scan for scoring (mirrors Form Reader skip rules). */
function scanFields(html: string): RawField[] {
  const fields: RawField[] = [];
  const inputRe = /<input\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = inputRe.exec(html))) {
    const attrs = m[1] ?? '';
    const type = (attrOf(attrs, 'type') || 'text').toLowerCase();
    if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset') continue;
    if (type === 'search') continue;
    fields.push({
      type,
      name: attrOf(attrs, 'name'),
      id: attrOf(attrs, 'id'),
      attrs,
    });
  }
  const taRe = /<textarea\b([^>]*)>/gi;
  while ((m = taRe.exec(html))) {
    const attrs = m[1] ?? '';
    fields.push({
      type: 'textarea',
      name: attrOf(attrs, 'name'),
      id: attrOf(attrs, 'id'),
      attrs,
    });
  }
  const selRe = /<select\b([^>]*)>/gi;
  while ((m = selRe.exec(html))) {
    const attrs = m[1] ?? '';
    fields.push({
      type: 'select',
      name: attrOf(attrs, 'name'),
      id: attrOf(attrs, 'id'),
      attrs,
    });
  }
  return fields;
}

function fieldBlob(f: RawField): string {
  return `${f.type} ${f.name} ${f.id} ${f.attrs}`.toLowerCase();
}

/** Newsletter / login / search-only chrome — not a directory submission form. */
export function isIgnorableFormPage(html: string, fieldCountHint?: number): boolean {
  const fields = scanFields(html);
  const h = html.toLowerCase();
  if ((fieldCountHint ?? fields.length) === 0 || fields.length === 0) return true;

  const allSearch =
    fields.length <= 2 &&
    fields.every((f) => /search|query|^q$/.test(fieldBlob(f)));
  if (allSearch) return true;

  const hasPassword = fields.some((f) => f.type === 'password');
  const hasEmail = fields.some(
    (f) => f.type === 'email' || /e-?mail/.test(fieldBlob(f))
  );
  if (hasPassword && fields.length <= 4 && /log\s*in|sign\s*in|password/.test(h)) {
    return true;
  }

  const blobs = fields.map(fieldBlob).join(' ');
  const newsletterOnly =
    fields.length <= 3 &&
    hasEmail &&
    !fields.some((f) => /url|website|title|name|desc|business|company|listing/.test(fieldBlob(f))) &&
    /newsletter|subscribe|mailing\s*list/.test(h + ' ' + blobs);
  if (newsletterOnly) return true;

  return false;
}

/**
 * Score a page for "real submission form" quality.
 * Rewards field count + URL / title / description / email inputs.
 */
export function scoreSubmissionFormPage(html: string): FormPageScore {
  const fields = scanFields(html);
  if (fields.length === 0) {
    return {
      score: 0,
      fieldCount: 0,
      hasUrl: false,
      hasTitle: false,
      hasDesc: false,
      hasEmail: false,
      ignorable: true,
      reason: 'no form fields',
    };
  }

  if (isIgnorableFormPage(html, fields.length)) {
    return {
      score: 0,
      fieldCount: fields.length,
      hasUrl: false,
      hasTitle: false,
      hasDesc: false,
      hasEmail: false,
      ignorable: true,
      reason: 'search/newsletter/login form',
    };
  }

  let hasUrl = false;
  let hasTitle = false;
  let hasDesc = false;
  let hasEmail = false;
  for (const f of fields) {
    const b = fieldBlob(f);
    if (f.type === 'url' || /website|url|homepage|link/.test(b)) hasUrl = true;
    if (/title|business|company|site.?name|^name$/.test(b)) hasTitle = true;
    if (f.type === 'textarea' || /desc|about|message|content|bio|summary/.test(b)) {
      hasDesc = true;
    }
    if (f.type === 'email' || /e-?mail/.test(b)) hasEmail = true;
  }

  let score = Math.min(fields.length, 8);
  if (hasUrl) score += 4;
  if (hasTitle) score += 3;
  if (hasDesc) score += 3;
  if (hasEmail) score += 2;
  if (fields.length >= 3 && (hasUrl || hasTitle)) score += 2;

  return {
    score,
    fieldCount: fields.length,
    hasUrl,
    hasTitle,
    hasDesc,
    hasEmail,
    ignorable: false,
    reason: [
      `${fields.length} fields`,
      hasUrl ? 'url' : null,
      hasTitle ? 'title' : null,
      hasDesc ? 'desc' : null,
      hasEmail ? 'email' : null,
    ]
      .filter(Boolean)
      .join('+'),
  };
}

/** Same-domain submission-intent links from a page, highest score first. */
export function extractSubmissionCandidateLinks(
  html: string,
  pageUrl: string,
  domain: string,
  depth = 0
): Array<{ url: string; anchorText: string; score: number; depth: number }> {
  const links = extractInternalLinks(html, pageUrl, domain, depth);
  const byUrl = new Map<
    string,
    { url: string; anchorText: string; score: number; depth: number }
  >();
  for (const l of links) {
    const score = submissionLinkScore(l.url, l.anchorText);
    if (score <= 0) continue;
    if (l.depth > FORM_DISCOVERY_DEFAULTS.maxDepth) continue;
    const prev = byUrl.get(l.url);
    if (!prev || score > prev.score) {
      byUrl.set(l.url, {
        url: l.url,
        anchorText: l.anchorText,
        score,
        depth: l.depth,
      });
    }
  }
  return [...byUrl.values()].sort((a, b) => b.score - a.score);
}

/** Pick best non-ignorable form page among fetched candidates. */
export function rankFetchedFormPages(
  pages: Array<{ url: string; html: string }>
): RankedFormCandidate[] {
  return pages
    .map((p) => {
      const s = scoreSubmissionFormPage(p.html);
      return {
        url: p.url,
        score: s.score,
        fieldCount: s.fieldCount,
        ignorable: s.ignorable,
      };
    })
    .sort((a, b) => b.score - a.score || b.fieldCount - a.fieldCount);
}

export function pickBestFormPage(
  pages: Array<{ url: string; html: string }>,
  minScore = FORM_DISCOVERY_DEFAULTS.minFormScore
): RankedFormCandidate | null {
  const ranked = rankFetchedFormPages(pages).filter(
    (p) => !p.ignorable && p.score >= minScore
  );
  return ranked[0] ?? null;
}

function pushUnique(
  out: string[],
  seen: Set<string>,
  raw: string | null | undefined,
  domain: string
) {
  if (!raw) return;
  const abs =
    absolutizeUrl(raw, `https://${domain}`) ??
    (/^https?:\/\//i.test(raw)
      ? raw
      : `https://${domain}${raw.startsWith('/') ? '' : '/'}${raw}`);
  try {
    const u = new URL(abs);
    if (!sameDomain(u.hostname, domain)) return;
    const key = u.toString().replace(/\/$/, '').toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(u.toString().replace(/\/$/, '') || u.origin);
  } catch {
    /* skip */
  }
}

/**
 * Ordered hint list: cached resolved → SI strategy → learning → classifications → meta.
 * Does not include the imported entry URL (caller adds that as crawl seed).
 */
export function collectKnownFormUrlHints(
  domain: string,
  hints: FormUrlHintBundle
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  pushUnique(out, seen, hints.resolvedFormUrl, domain);
  pushUnique(out, seen, hints.strategyEntryUrl, domain);
  for (const fb of hints.strategyFallbacks ?? []) {
    pushUnique(out, seen, fb.entryUrl, domain);
  }
  for (const u of hints.learningSubmissionUrls ?? []) {
    pushUnique(out, seen, u, domain);
  }
  for (const u of hints.successfulPathUrls ?? []) {
    pushUnique(out, seen, u, domain);
  }
  pushUnique(out, seen, hints.directorySubmissionUrl, domain);
  pushUnique(out, seen, hints.contactFormSubmissionUrl, domain);
  for (const u of hints.pageClassificationUrls ?? []) {
    pushUnique(out, seen, u, domain);
  }
  pushUnique(out, seen, hints.divertedUrl, domain);
  pushUnique(out, seen, hints.metaEntryUrl, domain);
  return out;
}

export function formDiscoveryFailureMessage(pagesChecked: string[]): string {
  const n = pagesChecked.length;
  if (n === 0) {
    return 'No submission form found — could not fetch any pages to check';
  }
  const listed = pagesChecked
    .slice(0, 8)
    .map((u) => {
      try {
        return new URL(u).pathname || '/';
      } catch {
        return u;
      }
    })
    .join(', ');
  const more = n > 8 ? ` (+${n - 8} more)` : '';
  return `No submission form found after crawling ${n} page${n === 1 ? '' : 's'} (${listed}${more})`;
}

export function normalizeFormDiscoveryDomain(input: string): string {
  return normalizeSiteDomain(input);
}
