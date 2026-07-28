/**
 * Phase 2.1 — no browser storage. Token lives only in memory until package load.
 */
import { companionLog, patchDiagnostics, redactToken } from '../diagnostics/connection';
import { setPendingToken } from '../runtime/memory';

export const DEFAULT_API_BASE =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: { VITE_SEO_OS_API_URL?: string } }).env
      ?.VITE_SEO_OS_API_URL) ||
  'https://api-production-48c9e.up.railway.app';

/** Read one-time handoff from URL hash/query into memory (never persisted). */
export function captureHandoffFromUrl(): string | null {
  try {
    const hash = location.hash || '';
    const hashMatch = hash.match(/seo-os-handoff=([^&]+)/i);
    const q = new URLSearchParams(location.search);
    const raw = hashMatch?.[1] || q.get('seo_os_handoff');
    if (!raw) {
      companionLog('handoff.url_scan', { found: false });
      return null;
    }
    const token = decodeURIComponent(raw);
    companionLog('handoff.url_detected', {
      token: redactToken(token),
      via: hashMatch ? 'hash' : 'query',
    });
    // Strip from address bar — do not leave token in history
    const clean = new URL(location.href);
    clean.hash = '';
    clean.searchParams.delete('seo_os_handoff');
    history.replaceState(null, '', clean.pathname + clean.search + clean.hash);

    setPendingToken(token);
    patchDiagnostics({
      messageReceived: 'Yes',
      tokenValid: 'Yes',
      lastStage: 'handoff.url_detected',
      lastError: null,
    });
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

export function getApiBase(): string {
  return DEFAULT_API_BASE;
}
