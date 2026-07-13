import type { VerificationStatus } from './backlink-types.js';

export function canVerify(status: VerificationStatus): boolean {
  return status === 'pending' || status === 'unreachable';
}

export function verificationLabel(status: VerificationStatus): string {
  const labels: Record<VerificationStatus, string> = {
    pending: 'Pending verification',
    verified: 'Link verified',
    lost: 'Link lost',
    unreachable: 'Could not reach',
  };
  return labels[status] ?? status;
}

export interface HttpVerificationInput {
  sourceUrl: string;
  targetUrl: string;
  expectedAnchor?: string;
}

export interface HttpVerificationResult {
  outcome: 'verified' | 'pending' | 'broken' | 'redirected' | 'unreachable';
  httpStatus: number | null;
  redirectUrl: string | null;
  targetFound: boolean;
  anchorMatched: boolean | null;
  isNofollow: boolean | null;
  isBroken: boolean;
  checkedAt: string;
  htmlSnippet?: string;
  errorMessage?: string;
}

function normalizeForMatch(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return url.trim().toLowerCase().replace(/\/$/, '');
  }
}

/** Pure HTML inspection — used by API after fetching the source page */
export function inspectBacklinkHtml(
  html: string,
  input: Omit<HttpVerificationInput, 'sourceUrl'>,
  httpStatus: number,
  finalUrl?: string
): HttpVerificationResult {
  const checkedAt = new Date().toISOString();
  const targetNorm = normalizeForMatch(input.targetUrl);
  const anchor = input.expectedAnchor?.toLowerCase().trim();

  const hrefRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  let targetFound = false;
  let anchorMatched: boolean | null = anchor ? false : null;
  let isNofollow: boolean | null = null;

  while ((match = hrefRegex.exec(html)) !== null) {
    const attrs = match[1] ?? '';
    const text = (match[2] ?? '').replace(/<[^>]+>/g, '').trim().toLowerCase();
    const hrefMatch = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    let absolute = href;
    try {
      absolute = new URL(href, finalUrl ?? input.targetUrl).toString();
    } catch {
      /* keep raw */
    }
    if (normalizeForMatch(absolute) === targetNorm || absolute.toLowerCase().includes(targetNorm)) {
      targetFound = true;
      const rel = attrs.match(/rel\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? '';
      isNofollow = rel.includes('nofollow');
      if (anchor) {
        anchorMatched = text.includes(anchor) || attrs.toLowerCase().includes(anchor);
      }
      break;
    }
  }

  const redirected =
    !!finalUrl && normalizeForMatch(finalUrl) !== normalizeForMatch(input.targetUrl) && httpStatus >= 300;

  let outcome: HttpVerificationResult['outcome'] = 'pending';
  if (httpStatus >= 400) outcome = 'broken';
  else if (targetFound) outcome = 'verified';
  else if (redirected) outcome = 'redirected';
  else if (httpStatus >= 200 && httpStatus < 400) outcome = 'pending';

  return {
    outcome,
    httpStatus,
    redirectUrl: redirected ? finalUrl ?? null : null,
    targetFound,
    anchorMatched,
    isNofollow,
    isBroken: outcome === 'broken',
    checkedAt,
    htmlSnippet: html.slice(0, 500),
  };
}
