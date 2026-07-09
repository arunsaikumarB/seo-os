/** robots.txt parsing and compliance — Epic 3 */

export interface RobotsRules {
  sitemaps: string[];
  disallow: string[];
  crawlDelayMs: number;
  raw: string;
}

export function parseRobotsTxt(content: string, userAgent = '*'): RobotsRules {
  const lines = content.split('\n').map((l) => l.trim());
  const sitemaps: string[] = [];
  const disallow: string[] = [];
  let crawlDelayMs = 200;
  let inTargetAgent = false;

  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const lower = line.toLowerCase();
    if (lower.startsWith('user-agent:')) {
      const agent = line.split(':').slice(1).join(':').trim();
      inTargetAgent = agent === '*' || agent.toLowerCase() === userAgent.toLowerCase();
      continue;
    }
    if (!inTargetAgent) continue;
    if (lower.startsWith('sitemap:')) {
      sitemaps.push(line.split(':').slice(1).join(':').trim());
    } else if (lower.startsWith('disallow:')) {
      const path = line.split(':').slice(1).join(':').trim();
      if (path) disallow.push(path);
    } else if (lower.startsWith('crawl-delay:')) {
      const delay = parseFloat(line.split(':')[1]?.trim() ?? '0');
      if (!Number.isNaN(delay)) crawlDelayMs = Math.max(200, Math.round(delay * 1000));
    }
  }

  return { sitemaps, disallow, crawlDelayMs, raw: content };
}

export function isPathAllowed(pathname: string, disallow: string[]): boolean {
  for (const rule of disallow) {
    if (rule === '/') return false;
    if (pathname.startsWith(rule)) return false;
  }
  return true;
}

export function filterUrlsByRobots(urls: string[], rules: RobotsRules): string[] {
  return urls.filter((url) => {
    try {
      const path = new URL(url).pathname;
      return isPathAllowed(path, rules.disallow);
    } catch {
      return false;
    }
  });
}

export async function fetchRobotsTxt(origin: string): Promise<RobotsRules | null> {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'SEO-OS-BrowserIntelligence/1.0' },
    });
    if (!res.ok) return null;
    return parseRobotsTxt(await res.text());
  } catch {
    return null;
  }
}
