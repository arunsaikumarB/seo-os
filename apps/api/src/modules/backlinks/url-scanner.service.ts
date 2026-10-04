/**
 * Live URL scan: HTTP fetch, one hop of obvious submit/login links, and
 * Playwright when the HTTP body is a JavaScript shell. Failures stay failures.
 */

import {
  analyzeScannedPage,
  looksLikeSpaShell,
  type ScanPageEvidence,
  type UrlScanVerdict,
} from '@seo-os/backlink-builder';
import { logger } from '../../lib/logger.js';

const HOP_RE =
  /submit|register|sign-?up|log-?in|sign-?in|write-for-us|contribute|add(?:-|\/)?(?:business|company|url|listing|site)|guest-post|contact/i;

const UA = 'BacklinkAgent-Scanner/1.0 (+https://backlinkagent.local; free scanner)';

export interface LiveFetch {
  url: string;
  finalUrl: string | null;
  httpStatus: number | null;
  html: string;
  error: string | null;
  contentType: string | null;
  robotsMeta: string | null;
  xRobotsTag: string | null;
}

function describeFetchError(err: unknown): string {
  const parts: string[] = [];
  const walk = (value: unknown, depth: number) => {
    if (!value || depth > 4) return;
    if (value instanceof AggregateError) {
      for (const inner of value.errors) walk(inner, depth + 1);
      return;
    }
    if (value instanceof Error) {
      parts.push(value.message);
      const code = (value as { code?: string }).code;
      if (code) parts.push(code);
      walk((value as { cause?: unknown }).cause, depth + 1);
    }
  };
  walk(err, 0);
  return parts.filter(Boolean).join(' ') || 'fetch failed';
}

export async function fetchPage(url: string, timeoutMs = 12_000): Promise<LiveFetch> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    });
    const html = await res.text();
    const robots = /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1] ?? null;
    return {
      url,
      finalUrl: res.url || url,
      httpStatus: res.status,
      html,
      error: null,
      contentType: res.headers.get('content-type'),
      robotsMeta: robots,
      xRobotsTag: res.headers.get('x-robots-tag'),
    };
  } catch (err) {
    return {
      url,
      finalUrl: null,
      httpStatus: null,
      html: '',
      error: describeFetchError(err),
      contentType: null,
      robotsMeta: null,
      xRobotsTag: null,
    };
  }
}

function sameHost(base: string, href: string): string | null {
  try {
    const abs = new URL(href, base);
    const host = new URL(base).hostname.replace(/^www\./, '');
    const next = abs.hostname.replace(/^www\./, '');
    if (next !== host) return null;
    if (!/^https?:$/.test(abs.protocol)) return null;
    return abs.toString();
  } catch {
    return null;
  }
}

export function obviousHopLinks(pageUrl: string, html: string, limit = 3): string[] {
  const found: string[] = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && found.length < limit) {
    const text = `${m[1]} ${m[2].replace(/<[^>]+>/g, ' ')}`;
    if (!HOP_RE.test(text)) continue;
    const abs = sameHost(pageUrl, m[1]);
    if (!abs || abs === pageUrl || found.includes(abs)) continue;
    found.push(abs);
  }
  return found;
}

async function renderWithPlaywright(url: string): Promise<string | null> {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ userAgent: UA });
      await page.goto(url, { timeout: 20_000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      return await page.content();
    } finally {
      await browser.close();
    }
  } catch (err) {
    logger.warn({ err, url }, 'Playwright render failed; keeping the HTTP body');
    return null;
  }
}

export async function scanLiveUrl(input: {
  url: string;
  category?: string | null;
}): Promise<UrlScanVerdict> {
  let requested = input.url.trim();
  if (!/^https?:\/\//i.test(requested)) requested = `https://${requested}`;

  const first = await fetchPage(requested);
  let html = first.html;
  let renderedWith: UrlScanVerdict['renderedWith'] = 'http';
  const needsRender =
    !first.error &&
    first.httpStatus != null &&
    first.httpStatus < 400 &&
    (looksLikeSpaShell(html) || (!/<form[\s>]/i.test(html) && (html.match(/<script[\s>]/gi) ?? []).length >= 5));
  if (needsRender) {
    const rendered = await renderWithPlaywright(first.finalUrl || requested);
    if (rendered) {
      html = rendered;
      renderedWith = 'playwright';
    }
  }

  const pages: ScanPageEvidence[] = [];
  if (html || first.httpStatus != null) {
    pages.push({ url: first.finalUrl || requested, html, httpStatus: first.httpStatus });
  }

  const brokenFetch = Boolean(first.error) || (first.httpStatus != null && first.httpStatus >= 400 && first.httpStatus !== 403);
  if (!brokenFetch && html) {
    for (const hop of obviousHopLinks(first.finalUrl || requested, html)) {
      const next = await fetchPage(hop);
      if (next.error && !next.html) continue;
      pages.push({ url: next.finalUrl || hop, html: next.html, httpStatus: next.httpStatus });
    }
  }

  return analyzeScannedPage({
    requestedUrl: requested,
    finalUrl: first.finalUrl,
    httpStatus: first.httpStatus,
    fetchError: first.error,
    contentType: first.contentType,
    robotsMeta: first.robotsMeta,
    xRobotsTag: first.xRobotsTag,
    pages,
    renderedWith,
    requestedCategory: input.category ?? null,
  });
}
