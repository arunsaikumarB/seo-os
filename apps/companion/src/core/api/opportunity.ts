import type { CurrentOpportunity } from '../types';
import { cacheCurrentOpportunity, getApiBase, getHandoffToken } from '../session/handoff';

export type FetchResult =
  | { ok: true; data: CurrentOpportunity }
  | { ok: false; error: string };

/**
 * Always fetch from SEO OS — never trust a permanent local business profile.
 * Session cache is optional UX only; callers revalidate via this API.
 */
export async function fetchCurrentOpportunity(opts?: {
  force?: boolean;
}): Promise<FetchResult> {
  const token = await getHandoffToken();
  if (!token) {
    return {
      ok: false,
      error: 'Not connected — open a package from SEO OS Assisted Manual',
    };
  }

  const apiBase = await getApiBase();

  // Prefer background fetch (avoids page CORS)
  try {
    const viaBg = await chrome.runtime.sendMessage({
      type: 'companion.fetchCurrentOpportunity',
      token,
      apiBase,
      force: opts?.force ?? true,
    });
    if (viaBg?.ok && viaBg.data) {
      await cacheCurrentOpportunity(viaBg.data as CurrentOpportunity);
      return { ok: true, data: viaBg.data as CurrentOpportunity };
    }
    if (viaBg && viaBg.ok === false && viaBg.error) {
      return { ok: false, error: String(viaBg.error) };
    }
  } catch {
    // fall through to direct fetch
  }

  try {
    const res = await fetch(`${apiBase}/v1/extension/opportunity/current`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
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
      error: err instanceof Error ? err.message : 'Failed to reach SEO OS API',
    };
  }
}
