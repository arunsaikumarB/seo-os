import type { CurrentOpportunity } from '../types';

const HANDOFF_KEY = 'seoOsCompanion.handoffToken';
const API_KEY = 'seoOsCompanion.apiBase';
const OPP_KEY = 'seoOsCompanion.currentOpportunity';

export const DEFAULT_API_BASE =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: { VITE_SEO_OS_API_URL?: string } }).env
      ?.VITE_SEO_OS_API_URL) ||
  'https://api-production-48c9e.up.railway.app';

/** Prefer session; fall back to local so handoff survives SW restarts. */
function storageArea(): chrome.storage.StorageArea {
  try {
    if (chrome?.storage?.session) return chrome.storage.session;
  } catch {
    /* ignore */
  }
  return chrome.storage.local;
}

function storageGet(keys: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    try {
      const area = storageArea();
      area.get(keys, (r) => {
        const err = chrome.runtime?.lastError;
        if (err) {
          resolve({});
          return;
        }
        resolve((r ?? {}) as Record<string, unknown>);
      });
    } catch {
      resolve({});
    }
  });
}

function storageSet(obj: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    try {
      storageArea().set(obj, () => resolve());
    } catch {
      resolve();
    }
  });
}

function storageRemove(keys: string[]): Promise<void> {
  return new Promise((resolve) => {
    try {
      storageArea().remove(keys, () => resolve());
    } catch {
      resolve();
    }
  });
}

export async function saveHandoffToken(
  token: string,
  apiBase: string = DEFAULT_API_BASE
): Promise<void> {
  await storageSet({
    [HANDOFF_KEY]: token,
    [API_KEY]: apiBase.replace(/\/$/, ''),
  });
}

/** Pull handoff from URL hash/query (directory tab) and persist for all tabs. */
export function captureHandoffFromPage(): string | null {
  try {
    const hash = location.hash || '';
    const hashMatch = hash.match(/seo-os-handoff=([^&]+)/i);
    const q = new URLSearchParams(location.search);
    const raw = hashMatch?.[1] || q.get('seo_os_handoff');
    if (!raw) return null;
    const token = decodeURIComponent(raw);
    const clean = new URL(location.href);
    clean.hash = '';
    clean.searchParams.delete('seo_os_handoff');
    history.replaceState(null, '', clean.pathname + clean.search + clean.hash);
    void saveHandoffToken(token, DEFAULT_API_BASE);
    return token;
  } catch {
    return null;
  }
}

export async function getHandoffToken(): Promise<string | null> {
  const fromPage = captureHandoffFromPage();
  if (fromPage) return fromPage;
  const stored = await storageGet([HANDOFF_KEY]);
  const t = stored[HANDOFF_KEY];
  return typeof t === 'string' && t ? t : null;
}

export async function getApiBase(): Promise<string> {
  const stored = await storageGet([API_KEY]);
  const b = stored[API_KEY];
  return typeof b === 'string' && b ? b.replace(/\/$/, '') : DEFAULT_API_BASE;
}

export async function cacheCurrentOpportunity(opp: CurrentOpportunity): Promise<void> {
  await storageSet({ [OPP_KEY]: opp });
}

export async function getCachedOpportunity(): Promise<CurrentOpportunity | null> {
  const stored = await storageGet([OPP_KEY]);
  const v = stored[OPP_KEY];
  if (!v || typeof v !== 'object') return null;
  return v as CurrentOpportunity;
}

export async function clearSession(): Promise<void> {
  await storageRemove([HANDOFF_KEY, OPP_KEY, API_KEY]);
}

export { HANDOFF_KEY, API_KEY, OPP_KEY };
