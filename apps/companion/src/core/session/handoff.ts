import type { CurrentOpportunity } from '../types';

const HANDOFF_KEY = 'seoOsCompanion.handoffToken';
const API_KEY = 'seoOsCompanion.apiBase';
const OPP_KEY = 'seoOsCompanion.currentOpportunity';

/** Default production API — override via Vite env at build time */
export const DEFAULT_API_BASE =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: { VITE_SEO_OS_API_URL?: string } }).env
      ?.VITE_SEO_OS_API_URL) ||
  'https://api-production-48c9e.up.railway.app';

function sessionGet(keys: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    try {
      chrome.storage.session.get(keys, (r) => resolve(r as Record<string, unknown>));
    } catch {
      resolve({});
    }
  });
}

function sessionSet(obj: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage.session.set(obj, () => resolve());
    } catch {
      resolve();
    }
  });
}

function sessionRemove(keys: string[]): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage.session.remove(keys, () => resolve());
    } catch {
      resolve();
    }
  });
}

/** Pull handoff token from URL hash/query and stash in session (not permanent profile). */
export function captureHandoffFromPage(): string | null {
  try {
    const hash = location.hash || '';
    const hashMatch = hash.match(/seo-os-handoff=([^&]+)/i);
    const q = new URLSearchParams(location.search);
    const raw = hashMatch?.[1] || q.get('seo_os_handoff');
    if (!raw) return null;
    const token = decodeURIComponent(raw);
    // Strip token from address bar so it isn't bookmarked with business access
    const clean = new URL(location.href);
    clean.hash = '';
    clean.searchParams.delete('seo_os_handoff');
    history.replaceState(null, '', clean.pathname + clean.search + clean.hash);
    void sessionSet({ [HANDOFF_KEY]: token, [API_KEY]: DEFAULT_API_BASE });
    return token;
  } catch {
    return null;
  }
}

export async function getHandoffToken(): Promise<string | null> {
  const fromPage = captureHandoffFromPage();
  if (fromPage) return fromPage;
  const stored = await sessionGet([HANDOFF_KEY]);
  const t = stored[HANDOFF_KEY];
  return typeof t === 'string' && t ? t : null;
}

export async function getApiBase(): Promise<string> {
  const stored = await sessionGet([API_KEY]);
  const b = stored[API_KEY];
  return typeof b === 'string' && b ? b.replace(/\/$/, '') : DEFAULT_API_BASE;
}

export async function cacheCurrentOpportunity(opp: CurrentOpportunity): Promise<void> {
  // Session-only cache for the active tab session — cleared when browser session ends
  await sessionSet({ [OPP_KEY]: opp });
}

export async function getCachedOpportunity(): Promise<CurrentOpportunity | null> {
  const stored = await sessionGet([OPP_KEY]);
  const v = stored[OPP_KEY];
  if (!v || typeof v !== 'object') return null;
  return v as CurrentOpportunity;
}

export async function clearSession(): Promise<void> {
  await sessionRemove([HANDOFF_KEY, OPP_KEY, API_KEY]);
}

export { HANDOFF_KEY, API_KEY, OPP_KEY };
