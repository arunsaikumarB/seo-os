import type { CurrentOpportunity } from '../types';
import {
  companionLog,
  patchDiagnostics,
  redactToken,
  summarizePackageBody,
} from '../diagnostics/connection';

const HANDOFF_KEY = 'seoOsCompanion.handoffToken';
const API_KEY = 'seoOsCompanion.apiBase';
const OPP_KEY = 'seoOsCompanion.currentOpportunity';

export const DEFAULT_API_BASE =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: { VITE_SEO_OS_API_URL?: string } }).env
      ?.VITE_SEO_OS_API_URL) ||
  'https://api-production-48c9e.up.railway.app';

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
          companionLog('storage.get_error', { error: err.message }, 'warn');
          resolve({});
          return;
        }
        resolve((r ?? {}) as Record<string, unknown>);
      });
    } catch (err) {
      companionLog(
        'storage.get_exception',
        { error: err instanceof Error ? err.message : String(err) },
        'warn'
      );
      resolve({});
    }
  });
}

function storageSet(obj: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    try {
      storageArea().set(obj, () => {
        const err = chrome.runtime?.lastError;
        if (err) {
          companionLog('storage.set_error', { error: err.message }, 'warn');
        }
        resolve();
      });
    } catch (err) {
      companionLog(
        'storage.set_exception',
        { error: err instanceof Error ? err.message : String(err) },
        'warn'
      );
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
  apiBase: string = DEFAULT_API_BASE,
  source: 'url' | 'postMessage' | 'storage' = 'storage'
): Promise<void> {
  const redacted = redactToken(token);
  companionLog('handoff.storage_write', {
    source,
    token: redacted,
    apiBase: apiBase.replace(/\/$/, ''),
  });
  await storageSet({
    [HANDOFF_KEY]: token,
    [API_KEY]: apiBase.replace(/\/$/, ''),
  });
  patchDiagnostics({
    handoffCreated: 'Yes',
    tokenPresent: 'Yes',
    tokenSource: source,
    lastStage: 'handoff.storage_write',
    lastError: null,
  });
}

/** Pull handoff from URL hash/query (directory tab) and persist for all tabs. */
export function captureHandoffFromPage(): string | null {
  try {
    const hash = location.hash || '';
    const hashMatch = hash.match(/seo-os-handoff=([^&]+)/i);
    const q = new URLSearchParams(location.search);
    const raw = hashMatch?.[1] || q.get('seo_os_handoff');
    if (!raw) {
      companionLog('handoff.url_scan', { found: false, hasHash: Boolean(hash), hasQuery: q.has('seo_os_handoff') });
      return null;
    }
    const token = decodeURIComponent(raw);
    companionLog('handoff.url_detected', {
      token: redactToken(token),
      via: hashMatch ? 'hash' : 'query',
    });
    const clean = new URL(location.href);
    clean.hash = '';
    clean.searchParams.delete('seo_os_handoff');
    history.replaceState(null, '', clean.pathname + clean.search + clean.hash);
    void saveHandoffToken(token, DEFAULT_API_BASE, 'url');
    return token;
  } catch (err) {
    companionLog(
      'handoff.url_capture_failed',
      { error: err instanceof Error ? err.message : String(err) },
      'error'
    );
    return null;
  }
}

export async function getHandoffToken(): Promise<string | null> {
  const fromPage = captureHandoffFromPage();
  if (fromPage) {
    patchDiagnostics({ tokenPresent: 'Yes', tokenSource: 'url', lastStage: 'handoff.token_from_url' });
    return fromPage;
  }
  const stored = await storageGet([HANDOFF_KEY]);
  const t = stored[HANDOFF_KEY];
  if (typeof t === 'string' && t) {
    companionLog('handoff.token_from_storage', { token: redactToken(t) });
    patchDiagnostics({
      tokenPresent: 'Yes',
      tokenSource: 'storage',
      lastStage: 'handoff.token_from_storage',
    });
    return t;
  }
  companionLog('handoff.token_missing', {});
  patchDiagnostics({
    tokenPresent: 'No',
    tokenSource: 'none',
    lastStage: 'handoff.token_missing',
  });
  return null;
}

export async function getApiBase(): Promise<string> {
  const stored = await storageGet([API_KEY]);
  const b = stored[API_KEY];
  return typeof b === 'string' && b ? b.replace(/\/$/, '') : DEFAULT_API_BASE;
}

export async function cacheCurrentOpportunity(opp: CurrentOpportunity): Promise<void> {
  companionLog('opportunity.cached', summarizePackageBody(opp));
  await storageSet({ [OPP_KEY]: opp });
}

export async function getCachedOpportunity(): Promise<CurrentOpportunity | null> {
  const stored = await storageGet([OPP_KEY]);
  const v = stored[OPP_KEY];
  if (!v || typeof v !== 'object') return null;
  return v as CurrentOpportunity;
}

export async function clearSession(): Promise<void> {
  companionLog('session.cleared', {});
  await storageRemove([HANDOFF_KEY, OPP_KEY, API_KEY]);
  patchDiagnostics({
    handoffCreated: 'No',
    tokenPresent: 'No',
    apiReachable: 'No',
    authenticated: 'No',
    packageLoaded: 'No',
    opportunityId: null,
    tokenSource: 'none',
    lastStage: 'session.cleared',
  });
}

export { HANDOFF_KEY, API_KEY, OPP_KEY };
