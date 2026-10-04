/**
 * Parsers for free discovery sources. They return only links present in the
 * response. An empty parse is an empty result, not a guessed URL.
 */

export interface FreeSearchHit {
  title: string;
  url: string;
}

export function parseDuckDuckGoHtml(html: string): FreeSearchHit[] {
  const hits: FreeSearchHit[] = [];
  const re = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = decodeURIComponent(m[1].replace(/&amp;/g, '&'));
    const uddg = /[?&]uddg=([^&]+)/.exec(raw);
    const url = uddg ? decodeURIComponent(uddg[1]) : raw;
    if (!/^https?:\/\//i.test(url)) continue;
    const title = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    hits.push({ title: title || url, url });
  }
  return hits;
}

/** Common Crawl CDX JSON lines or a JSON array of { url }. */
export function parseCommonCrawlCdx(body: string): string[] {
  const urls: string[] = [];
  const trimmed = body.trim();
  if (!trimmed) return urls;
  if (trimmed.startsWith('[')) {
    try {
      const rows = JSON.parse(trimmed) as Array<{ url?: string }>;
      for (const row of rows) if (row.url) urls.push(row.url);
    } catch {
      return [];
    }
    return urls;
  }
  for (const line of trimmed.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as { url?: string };
      if (row.url) urls.push(row.url);
    } catch {
      continue;
    }
  }
  return urls;
}

export function sitemapLocs(xml: string): string[] {
  const urls: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (/^https?:\/\//i.test(m[1])) urls.push(m[1]);
  }
  return urls;
}

export function duckDuckGoHtmlUrl(query: string): string {
  return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
}

export function commonCrawlCdxUrl(domain: string, index = 'CC-MAIN-2025-08'): string {
  const host = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return `https://index.commoncrawl.org/${index}-index?url=${encodeURIComponent(`${host}/*`)}&output=json&limit=20`;
}
