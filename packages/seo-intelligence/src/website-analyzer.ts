export const OPPORTUNITY_TYPES = [
  'guest_post',
  'resource_page',
  'broken_link',
  'directory',
  'qa_site',
  'forum',
  'podcast',
  'partnership',
] as const;

export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

export const PIPELINE_STATUSES = [
  'discovered',
  'qualified',
  'approved',
  'campaign_ready',
  'outreach',
  'negotiation',
  'won',
  'lost',
  'verified',
] as const;

export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export const SEARCH_INTENTS = [
  'informational',
  'commercial',
  'transactional',
  'navigational',
] as const;

export type SearchIntent = (typeof SEARCH_INTENTS)[number];

export const SCAN_PHASES = [
  'init',
  'sitemap_discovery',
  'page_discovery',
  'metadata_extraction',
  'brand_profile',
  'content_inventory',
  'complete',
] as const;

export type ScanPhase = (typeof SCAN_PHASES)[number];

export interface PageMetadata {
  url: string;
  path: string;
  title?: string;
  metaDescription?: string;
  h1?: string;
  schemaTypes: string[];
  wordCount: number;
}

export interface BrandProfile {
  siteName?: string;
  tagline?: string;
  industry?: string;
  tone?: string;
  primaryTopics: string[];
  socialLinks: string[];
}

export interface TechFingerprint {
  server?: string;
  poweredBy?: string;
  cms?: string;
  frameworks: string[];
  analytics: string[];
}

export function extractMetadataFromHtml(url: string, html: string): PageMetadata {
  const path = new URL(url).pathname;
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const metaDescMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i
  );
  const h1Match = html.match(/<h1[^>]*>([^<]*)<\/h1>/i);

  const schemaTypes: string[] = [];
  const jsonLdMatches = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const m of jsonLdMatches) {
    try {
      const data = JSON.parse(m[1]) as { '@type'?: string | string[] };
      const types = data['@type'];
      if (typeof types === 'string') schemaTypes.push(types);
      else if (Array.isArray(types)) schemaTypes.push(...types);
    } catch {
      /* skip invalid json-ld */
    }
  }

  const textContent = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    url,
    path,
    title: titleMatch?.[1]?.trim(),
    metaDescription: metaDescMatch?.[1]?.trim(),
    h1: h1Match?.[1]?.replace(/<[^>]+>/g, '').trim(),
    schemaTypes: [...new Set(schemaTypes)],
    wordCount: Math.ceil(textContent.length / 5),
  };
}

export function detectTechStack(html: string, headers: Record<string, string>): TechFingerprint {
  const frameworks: string[] = [];
  const analytics: string[] = [];

  if (html.includes('wp-content') || html.includes('wordpress')) frameworks.push('WordPress');
  if (html.includes('shopify')) frameworks.push('Shopify');
  if (html.includes('__NEXT_DATA__')) frameworks.push('Next.js');
  if (html.includes('react-root') || html.includes('data-reactroot')) frameworks.push('React');
  if (html.includes('ng-version')) frameworks.push('Angular');
  if (html.includes('gtag(') || html.includes('googletagmanager'))
    analytics.push('Google Analytics');
  if (html.includes('plausible.io')) analytics.push('Plausible');

  let cms: string | undefined;
  if (frameworks.includes('WordPress')) cms = 'WordPress';
  if (frameworks.includes('Shopify')) cms = 'Shopify';

  return {
    server: headers['server'],
    poweredBy: headers['x-powered-by'],
    cms,
    frameworks,
    analytics,
  };
}

export async function discoverSitemapUrls(baseUrl: string, maxPages = 50): Promise<string[]> {
  const origin = new URL(baseUrl).origin;
  const candidates = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];

  try {
    const robotsRes = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(8000) });
    if (robotsRes.ok) {
      const robots = await robotsRes.text();
      const sitemapLines = robots
        .split('\n')
        .filter((l) => l.toLowerCase().startsWith('sitemap:'))
        .map((l) => l.split(':').slice(1).join(':').trim());
      candidates.unshift(...sitemapLines);
    }
  } catch {
    /* robots optional */
  }

  const urls: string[] = [];
  for (const sitemapUrl of [...new Set(candidates)]) {
    try {
      const res = await fetch(sitemapUrl, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const xml = await res.text();
      const locMatches = xml.matchAll(/<loc>([^<]+)<\/loc>/gi);
      for (const m of locMatches) {
        if (urls.length >= maxPages) break;
        const loc = m[1].trim();
        if (loc.startsWith('http') && !loc.endsWith('.xml')) urls.push(loc);
      }
      if (urls.length > 0) break;
    } catch {
      continue;
    }
  }

  if (urls.length === 0) urls.push(baseUrl);
  return [...new Set(urls)].slice(0, maxPages);
}

export function buildBrandProfile(homepage: PageMetadata, html: string): BrandProfile {
  const ogSiteMatch = html.match(
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)["']/i
  );
  const topics: string[] = [];
  if (homepage.h1) topics.push(homepage.h1);
  if (homepage.title) topics.push(homepage.title.split('|')[0].trim());

  const socialLinks: string[] = [];
  const socialPatterns = [/twitter\.com\/[^"'\s]+/gi, /linkedin\.com\/[^"'\s]+/gi];
  for (const p of socialPatterns) {
    const m = html.match(p);
    if (m) socialLinks.push(m[0]);
  }

  return {
    siteName: ogSiteMatch?.[1] || homepage.title,
    tagline: homepage.metaDescription,
    primaryTopics: topics.filter(Boolean),
    socialLinks: [...new Set(socialLinks)],
    tone: 'professional',
  };
}
