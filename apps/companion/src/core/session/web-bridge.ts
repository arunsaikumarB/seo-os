/**
 * Bridge: SEO OS web posts handoff (+ optional package) into Companion content script.
 * No storage — hydrate memory or queue token for immediate API fetch.
 */
import type { OpportunityPackageFields } from '../types';
import { companionLog, patchDiagnostics, redactToken } from '../diagnostics/connection';
import { hydrateFromPackage, setError, setPendingToken } from '../runtime/memory';
import { DEFAULT_API_BASE } from './handoff';
import { redeemHandoffToken } from '../api/opportunity';

export type HandoffListener = () => void;

const listeners = new Set<HandoffListener>();

export function onHandoffReceived(cb: HandoffListener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify(): void {
  for (const cb of listeners) {
    try {
      cb();
    } catch {
      /* ignore */
    }
  }
}

function isAllowedOrigin(origin: string): boolean {
  // Same-tab postMessage from SEO OS web (Netlify / localhost) or directory self
  if (origin === location.origin) return true;
  try {
    const u = new URL(origin);
    if (u.hostname.endsWith('netlify.app')) return true;
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
  } catch {
    return false;
  }
  return false;
}

export function installWebHandoffBridge(): void {
  companionLog('bridge.installed', { origin: location.origin });
  window.addEventListener('message', (event) => {
    // Accept same-window messages from the page (SEO OS injects into this frame)
    if (event.source !== window && event.source !== null) {
      // also allow if origin is allowed (some wrappers)
      if (!isAllowedOrigin(event.origin) && event.origin !== location.origin) return;
    }
    if (event.origin && event.origin !== location.origin && !isAllowedOrigin(event.origin)) {
      companionLog('bridge.origin_rejected', { origin: event.origin }, 'warn');
      return;
    }

    const data = event.data as {
      source?: string;
      type?: string;
      token?: string;
      apiBase?: string;
      domain?: string;
      opportunityId?: string;
      packageId?: string;
      projectId?: string;
      entryUrl?: string;
      package?: OpportunityPackageFields;
      error?: string;
    } | null;

    if (!data || data.source !== 'seo-os-web') return;

    if (data.type === 'companion.handoff_error') {
      const errMsg = String(data.error ?? 'Handoff failed on SEO OS web');
      companionLog('bridge.handoff_error_from_web', { error: errMsg }, 'error');
      patchDiagnostics({
        messageReceived: 'Yes',
        tokenValid: 'No',
        connected: 'No',
        lastError: errMsg,
        lastStage: 'bridge.handoff_error_from_web',
      });
      setError(errMsg, 'bridge.handoff_error_from_web');
      notify();
      return;
    }

    if (data.type !== 'companion.handoff') return;

    companionLog('bridge.message_received', {
      type: data.type,
      domain: data.domain ?? null,
      opportunityId: data.opportunityId ?? null,
      hasPackage: Boolean(data.package),
      token: redactToken(data.token),
    });

    patchDiagnostics({
      messageReceived: 'Yes',
      lastStage: 'bridge.message_received',
      lastError: null,
      domain: data.domain ? String(data.domain) : null,
      opportunityId: data.opportunityId ? String(data.opportunityId) : null,
    });

    // Preferred: package already in message (SEO OS tab) — no storage, no GET, burn token locally
    if (data.package && data.opportunityId && data.domain) {
      patchDiagnostics({ tokenValid: data.token ? 'Yes' : 'No' });
      hydrateFromPackage({
        opportunityId: String(data.opportunityId),
        packageId: data.packageId,
        projectId: data.projectId,
        domain: String(data.domain),
        entryUrl: data.entryUrl,
        package: data.package,
        source: 'postMessage',
      });
      companionLog('bridge.package_from_message', {
        opportunityId: data.opportunityId,
        domain: data.domain,
      });
      notify();
      return;
    }

    const token = String(data.token ?? '').trim();
    if (!token) {
      const err = 'Handoff message missing token and package';
      companionLog('bridge.handoff_empty', {}, 'error');
      setError(err, 'bridge.handoff_empty');
      notify();
      return;
    }

    patchDiagnostics({ tokenValid: 'Yes' });
    setPendingToken(token);
    const apiBase = String(data.apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
    void redeemHandoffToken(token, apiBase).finally(() => notify());
  });
}
