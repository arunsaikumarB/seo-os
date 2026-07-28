import type { CurrentOpportunity, OpportunityPackageFields } from '../types';
import {
  companionLog,
  patchDiagnostics,
  redactToken,
  summarizePackageBody,
} from '../diagnostics/connection';
import {
  clearPendingToken,
  hydrateFromPackage,
  setError,
  takePendingToken,
} from '../runtime/memory';
import { getApiBase } from '../session/handoff';

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

function mapApiToCurrent(data: Record<string, unknown>): CurrentOpportunity {
  return {
    opportunityId: String(data.opportunityId ?? ''),
    packageId: String(data.packageId ?? ''),
    workspaceId: String(data.workspaceId ?? data.projectId ?? ''),
    domain: String(data.domain ?? ''),
    entryUrl: String(data.entryUrl ?? ''),
    package: (data.package ?? {}) as OpportunityPackageFields,
    learningKey: String(data.learningKey ?? ''),
  };
}

/**
 * Redeem a one-time handoff token → load package into memory → forget token.
 */
export async function redeemHandoffToken(
  token: string,
  apiBase = getApiBase()
): Promise<FetchResult> {
  companionLog('api.redeem_start', { token: redactToken(token), apiBase });
  patchDiagnostics({
    packageRequestStarted: 'Yes',
    tokenValid: 'Yes',
    lastStage: 'api.redeem_start',
    lastError: null,
  });

  const url = `${apiBase.replace(/\/$/, '')}/v1/extension/opportunity/current`;

  const tryBackground = async (): Promise<FetchResult | null> => {
    try {
      const viaBg = await withTimeout(
        new Promise<{
          ok?: boolean;
          data?: Record<string, unknown>;
          error?: string;
          status?: number;
          summary?: Record<string, unknown>;
        }>((resolve, reject) => {
          try {
            chrome.runtime.sendMessage(
              { type: 'companion.fetchCurrentOpportunity', token, apiBase },
              (response) => {
                const err = chrome.runtime.lastError;
                if (err) {
                  reject(new Error(err.message));
                  return;
                }
                resolve(response ?? { ok: false, error: 'Empty SW response' });
              }
            );
          } catch (e) {
            reject(e);
          }
        }),
        10000
      );

      if (viaBg?.ok && viaBg.data) {
        companionLog('api.background_success', {
          status: viaBg.status ?? 200,
          body: viaBg.summary ?? summarizePackageBody(viaBg.data),
        });
        applySuccess(viaBg.data, viaBg.status ?? 200);
        return { ok: true, data: mapApiToCurrent(viaBg.data) };
      }
      if (viaBg && viaBg.ok === false) {
        companionLog(
          'api.background_failed',
          { status: viaBg.status ?? null, error: viaBg.error },
          'warn'
        );
        patchDiagnostics({
          apiReachable: viaBg.status && viaBg.status > 0 ? 'Yes' : 'No',
          lastHttpStatus: viaBg.status ?? null,
        });
      }
    } catch (err) {
      companionLog(
        'api.background_error',
        { error: err instanceof Error ? err.message : String(err) },
        'warn'
      );
    }
    return null;
  };

  const bg = await tryBackground();
  if (bg) return bg;

  try {
    companionLog('api.direct_attempt', { url });
    const res = await withTimeout(
      fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }),
      15000
    );
    const body = (await res.json().catch(() => ({}))) as {
      data?: Record<string, unknown>;
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
          ? body.detail ||
            'Handoff expired or already used. Please reopen the package from SEO OS.'
          : res.status === 404
            ? 'Package not found.'
            : body.detail || body.title || `Authentication failed (HTTP ${res.status}).`;
      clearPendingToken();
      setError(error, 'api.direct_http_error');
      patchDiagnostics({
        authenticated: 'No',
        packageLoaded: 'No',
        connected: 'No',
        lastError: error,
      });
      return { ok: false, error };
    }

    if (!body.data) {
      const error = 'Package not found — empty API response.';
      clearPendingToken();
      setError(error, 'api.empty_body');
      return { ok: false, error };
    }

    applySuccess(body.data, res.status);
    return { ok: true, data: mapApiToCurrent(body.data) };
  } catch (err) {
    const timedOut = err instanceof Error && err.message === 'timeout';
    const error = timedOut
      ? 'Network unavailable — SEO OS API timed out.'
      : err instanceof Error
        ? `Network unavailable: ${err.message}`
        : 'Network unavailable.';
    companionLog('api.direct_failed', { error }, 'error');
    clearPendingToken();
    setError(error, 'api.direct_failed');
    patchDiagnostics({
      apiReachable: 'No',
      authenticated: 'No',
      packageLoaded: 'No',
      connected: 'No',
      lastError: error,
      lastHttpStatus: null,
    });
    return { ok: false, error };
  }
}

function applySuccess(data: Record<string, unknown>, status: number): void {
  const current = mapApiToCurrent(data);
  hydrateFromPackage({
    opportunityId: current.opportunityId,
    packageId: current.packageId,
    projectId: current.workspaceId,
    domain: current.domain,
    entryUrl: current.entryUrl,
    package: current.package,
    source: 'api',
  });
  // Token already taken/cleared by caller paths
  takePendingToken();
  clearPendingToken();
  patchDiagnostics({
    apiReachable: 'Yes',
    authenticated: 'Yes',
    packageLoaded: 'Yes',
    connected: 'Yes',
    opportunityId: current.opportunityId,
    domain: current.domain,
    lastHttpStatus: status,
    lastError: null,
    lastStage: 'api.package_loaded',
  });
}

/** If URL or memory has a pending token, redeem it now. */
export async function redeemPendingIfAny(): Promise<FetchResult | null> {
  const token = takePendingToken();
  if (!token) return null;
  return redeemHandoffToken(token);
}
