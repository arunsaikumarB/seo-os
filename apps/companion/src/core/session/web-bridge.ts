/**
 * Bridge: SEO OS web app posts handoff tokens into the Companion content script.
 */
import { companionLog, patchDiagnostics, redactToken } from '../diagnostics/connection';
import { DEFAULT_API_BASE, saveHandoffToken } from './handoff';

export type HandoffListener = (token: string) => void;

const listeners = new Set<HandoffListener>();

export function onHandoffReceived(cb: HandoffListener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify(token: string): void {
  for (const cb of listeners) {
    try {
      cb(token);
    } catch {
      /* ignore */
    }
  }
}

export function installWebHandoffBridge(): void {
  companionLog('bridge.installed', {});
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data as {
      source?: string;
      type?: string;
      token?: string;
      apiBase?: string;
      domain?: string;
      opportunityId?: string;
    } | null;
    if (!data || data.source !== 'seo-os-web') return;

    if (data.type === 'companion.handoff_error') {
      const errMsg = String((data as { error?: string }).error ?? 'Handoff failed on SEO OS web');
      companionLog('bridge.handoff_error_from_web', { error: errMsg }, 'error');
      patchDiagnostics({
        handoffCreated: 'No',
        lastError: errMsg,
        lastStage: 'bridge.handoff_error_from_web',
      });
      return;
    }

    companionLog('bridge.message_received', {
      type: data.type,
      domain: data.domain ?? null,
      opportunityId: data.opportunityId ?? null,
      token: redactToken(data.token),
    });

    if (data.type !== 'companion.handoff') return;
    const token = String(data.token ?? '').trim();
    if (!token) {
      companionLog('bridge.handoff_empty_token', {}, 'error');
      patchDiagnostics({
        lastError: 'Received handoff message without token',
        lastStage: 'bridge.handoff_empty_token',
      });
      return;
    }
    const apiBase = String(data.apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
    patchDiagnostics({
      handoffCreated: 'Yes',
      lastStage: 'bridge.handoff_received',
      opportunityId: data.opportunityId ? String(data.opportunityId) : null,
      lastError: null,
    });
    void saveHandoffToken(token, apiBase, 'postMessage').then(() => {
      companionLog('bridge.handoff_saved', { token: redactToken(token), apiBase });
      notify(token);
    });
  });
}
