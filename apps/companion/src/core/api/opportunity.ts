import type { CurrentOpportunity } from '../types';
import {
  companionLog,
  patchDiagnostics,
  redactToken,
  summarizePackageBody,
} from '../diagnostics/connection';
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
  companionLog('api.fetch_start', {});
  patchDiagnostics({ lastStage: 'api.fetch_start', lastError: null });

  const token = await getHandoffToken();
  if (!token) {
    const error =
      'No handoff token — click Open package in Assisted Manual to create one';
    companionLog('api.no_token', {}, 'warn');
    patchDiagnostics({
      tokenPresent: 'No',
      packageLoaded: 'No',
      authenticated: 'No',
      lastError: error,
      lastStage: 'api.no_token',
    });
    return { ok: false, error };
  }

  const apiBase = await getApiBase();
  companionLog('api.request', {
    url: `${apiBase}/v1/extension/opportunity/current`,
    token: redactToken(token),
    via: 'background_then_direct',
  });

  // Background fetch (no page CORS)
  try {
    companionLog('api.background_attempt', {});
    const viaBg = await withTimeout(
      chrome.runtime.sendMessage({
        type: 'companion.fetchCurrentOpportunity',
        token,
        apiBase,
      }) as Promise<
        | {
            ok?: boolean;
            data?: CurrentOpportunity;
            error?: string;
            status?: number;
            summary?: Record<string, unknown>;
          }
        | undefined
      >,
      8000
    );

    if (viaBg?.ok && viaBg.data) {
      companionLog('api.background_success', {
        status: viaBg.status ?? 200,
        body: viaBg.summary ?? summarizePackageBody(viaBg.data),
      });
      patchDiagnostics({
        apiReachable: 'Yes',
        authenticated: 'Yes',
        packageLoaded: 'Yes',
        opportunityId: String(viaBg.data.opportunityId ?? ''),
        lastHttpStatus: viaBg.status ?? 200,
        lastStage: 'api.background_success',
        lastError: null,
      });
      await cacheCurrentOpportunity(viaBg.data);
      return { ok: true, data: viaBg.data };
    }

    if (viaBg && viaBg.ok === false) {
      companionLog(
        'api.background_failed',
        { status: viaBg.status ?? null, error: viaBg.error },
        'warn'
      );
      patchDiagnostics({
        apiReachable: viaBg.status != null && viaBg.status > 0 ? 'Yes' : 'No',
        authenticated: viaBg.status === 401 || viaBg.status === 403 ? 'No' : 'No',
        lastHttpStatus: viaBg.status ?? null,
        lastStage: 'api.background_failed',
      });
    }
  } catch (err) {
    companionLog(
      'api.background_timeout_or_error',
      { error: err instanceof Error ? err.message : String(err) },
      'warn'
    );
    patchDiagnostics({ lastStage: 'api.background_timeout_or_error' });
  }

  try {
    companionLog('api.direct_attempt', { apiBase });
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
    const summary = body.data
      ? summarizePackageBody(body.data)
      : { detail: body.detail, title: body.title };

    companionLog(res.ok ? 'api.direct_success' : 'api.direct_http_error', {
      status: res.status,
      body: summary,
    }, res.ok ? 'info' : 'error');

    patchDiagnostics({
      apiReachable: 'Yes',
      lastHttpStatus: res.status,
      lastStage: res.ok ? 'api.direct_success' : 'api.direct_http_error',
    });

    if (!res.ok) {
      const error =
        res.status === 401 || res.status === 403
          ? `Handoff rejected (${res.status}) — token invalid or expired. Click Open package again.`
          : body.detail || body.title || `API returned HTTP ${res.status}`;
      patchDiagnostics({
        authenticated: 'No',
        packageLoaded: 'No',
        lastError: error,
      });
      return { ok: false, error };
    }
    if (!body.data) {
      const error = 'API returned 200 but package payload was empty';
      patchDiagnostics({
        authenticated: 'Yes',
        packageLoaded: 'No',
        lastError: error,
      });
      return { ok: false, error };
    }

    patchDiagnostics({
      authenticated: 'Yes',
      packageLoaded: 'Yes',
      opportunityId: String(body.data.opportunityId ?? ''),
      lastError: null,
    });
    await cacheCurrentOpportunity(body.data);
    return { ok: true, data: body.data };
  } catch (err) {
    const timedOut = err instanceof Error && err.message === 'timeout';
    const error = timedOut
      ? `SEO OS API timed out contacting ${apiBase}`
      : err instanceof Error
        ? `API unreachable: ${err.message}`
        : 'Failed to reach SEO OS API';
    companionLog('api.direct_failed', { error, apiBase }, 'error');
    patchDiagnostics({
      apiReachable: 'No',
      authenticated: 'No',
      packageLoaded: 'No',
      lastError: error,
      lastStage: 'api.direct_failed',
      lastHttpStatus: null,
    });
    return { ok: false, error };
  }
}
