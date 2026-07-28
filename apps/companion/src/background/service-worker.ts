/**
 * SEO OS Companion — MV3 service worker.
 * Fetches opportunity packages from SEO OS; never stores business profiles.
 */
import { DEFAULT_API_BASE } from '../core/session/handoff';

chrome.runtime.onInstalled.addListener((details) => {
  console.info('[SEO OS Companion] installed', details.reason);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'companion.ping') {
    sendResponse({ ok: true, phase: 2, name: 'SEO OS Companion' });
    return true;
  }

  if (message?.type === 'companion.fetchCurrentOpportunity') {
    const token = String(message.token ?? '');
    const apiBase = String(message.apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
    void (async () => {
      try {
        const res = await fetch(`${apiBase}/v1/extension/opportunity/current`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });
        const body = (await res.json().catch(() => ({}))) as {
          data?: unknown;
          detail?: string;
          title?: string;
        };
        if (!res.ok) {
          sendResponse({
            ok: false,
            error: body.detail || body.title || `API ${res.status}`,
          });
          return;
        }
        sendResponse({ ok: true, data: body.data });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : 'Fetch failed',
        });
      }
    })();
    return true; // async
  }

  return false;
});
