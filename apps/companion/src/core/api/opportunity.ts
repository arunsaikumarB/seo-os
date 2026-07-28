import type { CurrentOpportunity } from '../types';
import { cacheCurrentOpportunity, getApiBase, getHandoffToken } from '../session/handoff';

export type FetchResult =
  | { ok: true; data: CurrentOpportunity }
  | { ok: false; error: string };

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/**
 * Always fetch from SEO OS — never trust a permanent local business profile.
 */
export async function fetchCurrentOpportunity(_opts?: {
  force?: boolean;
}): Promise<FetchResult> {
  const token = await getHandoffToken();
  if (!token) {
    return {
      ok: false,
      error: 'Not connected — click Open package in Assisted Manual',
    };
  }

  const apiBase = await getApiBase();

  // Background fetch (no page CORS). Hard timeout — SW can hang and leave UI on Connecting…
  try {
    const viaBg = await withTimeout(
      chrome.runtime.sendMessage({
        type: 'companion.fetchCurrentOpportunity',
        token,
        apiBase,
      }) as Promise<{ ok?: boolean; data?: CurrentOpportunity; error?: string } | undefined>,
      8000
    );
    if (viaBg?.ok && viaBg.data) {
      await cacheCurrentOpportunity(viaBg.data);
      return { ok: true, data: viaBg.data };
    }
    if (viaBg && viaBg.ok === false && viaBg.error) {
      // Still try direct fetch below for better diagnostics on SEO OS origin
      console.warn('[SEO OS Companion] background fetch failed', viaBg.error);
    }
  } catch {
    /* timeout or no SW — fall through */
  }

  try {
    const res = await withTimeout(
      fetch(`${apiBase}/v1/extension/opportunity/current`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }),
      15000
    );
    const body = (await res.json().catch(() => ({}))) as {
      data?: CurrentOpportunity;
      detail?: string;
      title?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: body.detail || body.title || `API ${res.status}`,
      };
    }
    if (!body.data) return { ok: false, error: 'Empty package response' };
    await cacheCurrentOpportunity(body.data);
    return { ok: true, data: body.data };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error && err.message === 'timeout'
          ? 'SEO OS API timed out — retry after Open package'
          : err instanceof Error
            ? err.message
            : 'Failed to reach SEO OS API',
    };
  }
}
