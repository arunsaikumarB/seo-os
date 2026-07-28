/**
 * Bounded navigation crawl helpers — Phase 5 §5.
 * Never becomes a spider: max pages, depth, prioritized frontier, same-domain only.
 */

/** P1 — tighter crawl budget: 6 pages or 30s, early-stop on submission intents. */
export const SIE_CRAWL_DEFAULTS = {
  maxPages: 6,
  maxDepth: 3,
  timeBudgetMs: 30_000,
  fetchDelayMs: 800,
  maxRetries: 1,
  respectRobots: true,
  /** Parallel HTTP fetches within the crawl budget (1 = sequential). */
  fetchConcurrency: 2,
} as const;

/** Intents that mean we found a usable submission surface — stop crawling. */
export const CRAWL_STOP_INTENTS = [
  'Write For Us',
  'Submission Form',
  'Guest Post Guidelines',
  'Comment Form',
  'Dashboard',
  'Contact',
  'Directory',
  'Google Form',
  'Typeform',
] as const;

export function isCrawlStopIntent(intent: string, confidence = 0): boolean {
  if (confidence > 0 && confidence < 0.55) return false;
  return (CRAWL_STOP_INTENTS as readonly string[]).includes(intent);
}

export type CrawlLink = {
  url: string;
  anchorText: string;
  sourceUrl: string;
  priority: number;
  depth: number;
};

export type CrawlNode = {
  url: string;
  status: 'fetched' | 'failed' | 'skipped';
  depth: number;
  title?: string | null;
  error?: string | null;
};

export type NavigationGraph = {
  nodes: CrawlNode[];
  edges: Array<{ from: string; to: string; anchorText: string }>;
};

/** Higher = crawl first. Generic article links stay near 0. */
export function linkPriority(url: string, anchorText: string): number {
  const blob = `${url} ${anchorText}`.toLowerCase();
  let score = 0;
  if (/write[\s-]?for[\s-]?us|guest[\s-]?post|contribute|submit|pitch/.test(blob)) score += 100;
  if (/guidelines|editorial/.test(blob)) score += 90;
  if (/register|sign[\s-]?up|join/.test(blob)) score += 70;
  if (/login|sign[\s-]?in|dashboard|wp-admin/.test(blob)) score += 60;
  if (/contact|get[\s-]?in[\s-]?touch/.test(blob)) score += 50;
  if (/form|typeform|forms\.gle|docs\.google\.com\/forms/.test(blob)) score += 80;
  if (/about|privacy|terms|cookie|blog\/\d|category|tag\//.test(blob)) score -= 20;
  return score;
}

export function normalizeSiteDomain(input: string): string {
  try {
    const withProto = /^https?:\/\//i.test(input) ? input : `https://${input}`;
    const u = new URL(withProto);
    return u.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return String(input)
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0]!
      .toLowerCase();
  }
}

export function sameDomain(a: string, b: string): boolean {
  return normalizeSiteDomain(a) === normalizeSiteDomain(b);
}

export function absolutizeUrl(href: string, baseUrl: string): string | null {
  try {
    const u = new URL(href, baseUrl);
    if (!/^https?:$/i.test(u.protocol)) return null;
    u.hash = '';
    return u.toString().replace(/\/$/, '') || u.origin;
  } catch {
    return null;
  }
}

/** Extract same-domain links from HTML (menus/footer/body). */
export function extractInternalLinks(
  html: string,
  pageUrl: string,
  domain: string,
  depth: number
): CrawlLink[] {
  const links: CrawlLink[] = [];
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const abs = absolutizeUrl(m[1]!, pageUrl);
    if (!abs || !sameDomain(abs, domain)) continue;
    const anchor = m[2]!.replace(/<[^>]+>/g, '').trim().slice(0, 120);
    links.push({
      url: abs,
      anchorText: anchor,
      sourceUrl: pageUrl,
      priority: linkPriority(abs, anchor),
      depth: depth + 1,
    });
  }
  return links;
}

/**
 * Build prioritized frontier from seed homepage HTML.
 * Does not fetch — caller fetches respecting budgets.
 */
export function buildPrioritizedFrontier(params: {
  homepageUrl: string;
  homepageHtml: string;
  domain: string;
  maxPages: number;
  maxDepth: number;
  platformHints?: string[];
}): CrawlLink[] {
  const seen = new Set<string>([params.homepageUrl.replace(/\/$/, '')]);
  const frontier = extractInternalLinks(
    params.homepageHtml,
    params.homepageUrl,
    params.domain,
    0
  );
  // Boost platform hint URLs
  for (const hint of params.platformHints ?? []) {
    const abs = absolutizeUrl(hint, params.homepageUrl);
    if (!abs || seen.has(abs)) continue;
    frontier.push({
      url: abs,
      anchorText: hint,
      sourceUrl: params.homepageUrl,
      priority: linkPriority(abs, hint) + 20,
      depth: 1,
    });
  }
  frontier.sort((a, b) => b.priority - a.priority);
  const out: CrawlLink[] = [];
  for (const link of frontier) {
    if (link.depth > params.maxDepth) continue;
    const key = link.url.replace(/\/$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(link);
    if (out.length >= params.maxPages - 1) break; // homepage already counted
  }
  return out;
}

export function emptyNavigationGraph(): NavigationGraph {
  return { nodes: [], edges: [] };
}
