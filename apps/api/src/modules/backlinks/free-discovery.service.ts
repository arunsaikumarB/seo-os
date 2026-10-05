/**
 * Free discovery. Hits are parsed from a real response. Failures stay empty.
 */

import {
  commonCrawlCdxUrl,
  duckDuckGoHtmlUrl,
  parseCommonCrawlCdx,
  parseDuckDuckGoHtml,
  sitemapLocs,
  workflowFor,
  type CategoryWorkflow,
} from '@seo-os/backlink-builder';

const UA = 'BacklinkAgent-Scanner/1.0 (+https://backlinkagent.local; free scanner)';

export interface FreeHit {
  title: string;
  url: string;
}

export interface FreeSearchResult {
  source: 'google_cse' | 'duckduckgo_html' | 'common_crawl' | 'sitemap';
  query: string;
  hits: FreeHit[];
  error: string | null;
}

async function googleCse(query: string): Promise<FreeSearchResult | null> {
  const key = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  if (!key || !cx) return null;
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) {
      return { source: 'google_cse', query, hits: [], error: `Google CSE HTTP ${res.status}` };
    }
    const json = (await res.json()) as { items?: Array<{ title?: string; link?: string }> };
    const hits = (json.items ?? [])
      .filter((item) => item.link && /^https?:\/\//i.test(item.link))
      .map((item) => ({ title: item.title || item.link!, url: item.link! }));
    return { source: 'google_cse', query, hits, error: null };
  } catch (err) {
    return {
      source: 'google_cse',
      query,
      hits: [],
      error: err instanceof Error ? err.message : 'Google CSE request failed',
    };
  }
}

export async function searchFree(query: string): Promise<FreeSearchResult> {
  const cse = await googleCse(query);
  if (cse) return cse;
  try {
    const res = await fetch(duckDuckGoHtmlUrl(query), {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      return { source: 'duckduckgo_html', query, hits: [], error: `DuckDuckGo HTTP ${res.status}` };
    }
    const hits = parseDuckDuckGoHtml(await res.text());
    return { source: 'duckduckgo_html', query, hits, error: hits.length ? null : 'DuckDuckGo returned no parsed results' };
  } catch (err) {
    return {
      source: 'duckduckgo_html',
      query,
      hits: [],
      error: err instanceof Error ? err.message : 'DuckDuckGo request failed',
    };
  }
}

export async function searchCommonCrawl(domain: string): Promise<FreeSearchResult> {
  const query = domain;
  try {
    const res = await fetch(commonCrawlCdxUrl(domain), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { source: 'common_crawl', query, hits: [], error: `Common Crawl HTTP ${res.status}` };
    }
    const urls = parseCommonCrawlCdx(await res.text());
    return {
      source: 'common_crawl',
      query,
      hits: urls.map((url) => ({ title: url, url })),
      error: urls.length ? null : 'Common Crawl returned no URLs',
    };
  } catch (err) {
    return {
      source: 'common_crawl',
      query,
      hits: [],
      error: err instanceof Error ? err.message : 'Common Crawl request failed',
    };
  }
}

export async function readSitemap(siteUrl: string): Promise<FreeSearchResult> {
  let sitemap = siteUrl;
  try {
    const u = new URL(siteUrl);
    if (!u.pathname.endsWith('.xml')) sitemap = `${u.origin}/sitemap.xml`;
  } catch {
    return { source: 'sitemap', query: siteUrl, hits: [], error: 'Invalid sitemap URL' };
  }
  try {
    const res = await fetch(sitemap, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) {
      return { source: 'sitemap', query: sitemap, hits: [], error: `Sitemap HTTP ${res.status}` };
    }
    const urls = sitemapLocs(await res.text()).slice(0, 50);
    return {
      source: 'sitemap',
      query: sitemap,
      hits: urls.map((url) => ({ title: url, url })),
      error: urls.length ? null : 'Sitemap contained no URLs',
    };
  } catch (err) {
    return {
      source: 'sitemap',
      query: sitemap,
      hits: [],
      error: err instanceof Error ? err.message : 'Sitemap request failed',
    };
  }
}

export async function discoverCategory(category: string): Promise<{
  workflow: CategoryWorkflow | null;
  search: FreeSearchResult | null;
}> {
  const workflow = workflowFor(category);
  if (!workflow) return { workflow: null, search: null };
  const query = workflow.footprints[0];
  const search = query ? await searchFree(query) : null;
  return { workflow, search };
}
