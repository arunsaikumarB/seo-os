/**
 * SEO OS Companion — MV3 service worker.
 * Fetches opportunity packages from SEO OS; never stores business profiles.
 */
import { DEFAULT_API_BASE } from '../core/session/handoff';
import {
  companionLog,
  redactToken,
  summarizePackageBody,
} from '../core/diagnostics/connection';

chrome.runtime.onInstalled.addListener((details) => {
  companionLog('sw.installed', { reason: details.reason });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'companion.ping') {
    sendResponse({ ok: true, phase: 2, name: 'SEO OS Companion' });
    return true;
  }

  if (message?.type === 'companion.fetchCurrentOpportunity') {
    const token = String(message.token ?? '');
    const apiBase = String(message.apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
    const url = `${apiBase}/v1/extension/opportunity/current`;
    companionLog('sw.fetch_start', { url, token: redactToken(token) });

    void (async () => {
      try {
        const res = await fetch(url, {
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
        const summary = body.data
          ? summarizePackageBody(body.data)
          : { detail: body.detail, title: body.title };

        companionLog(res.ok ? 'sw.fetch_ok' : 'sw.fetch_http_error', {
          status: res.status,
          body: summary,
        }, res.ok ? 'info' : 'error');

        if (!res.ok) {
          sendResponse({
            ok: false,
            status: res.status,
            error: body.detail || body.title || `API ${res.status}`,
            summary,
          });
          return;
        }
        sendResponse({
          ok: true,
          status: res.status,
          data: body.data,
          summary,
        });
      } catch (err) {
        companionLog(
          'sw.fetch_network_error',
          { error: err instanceof Error ? err.message : String(err) },
          'error'
        );
        sendResponse({
          ok: false,
          status: 0,
          error: err instanceof Error ? err.message : 'Fetch failed',
        });
      }
    })();
    return true;
  }

  return false;
});
