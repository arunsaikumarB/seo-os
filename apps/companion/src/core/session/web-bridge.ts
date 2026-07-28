/**
 * Bridge: SEO OS web app posts handoff tokens into the Companion content script.
 * Message shape: { source: 'seo-os-web', type: 'companion.handoff', token, apiBase? }
 */
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
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data as {
      source?: string;
      type?: string;
      token?: string;
      apiBase?: string;
    } | null;
    if (!data || data.source !== 'seo-os-web' || data.type !== 'companion.handoff') return;
    const token = String(data.token ?? '').trim();
    if (!token) return;
    const apiBase = String(data.apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
    void saveHandoffToken(token, apiBase).then(() => notify(token));
  });
}
