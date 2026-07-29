/**
 * Bridge: SEO OS activates a package via postMessage.
 * Acks back to the page after the service worker confirms storage.
 */
import type { ActivePackage } from '../types';
import { companionLog, patchDiagnostics } from '../diagnostics/connection';
import { activatePackage } from '../runtime/memory';
import type { LearningAuth } from '../learning/api';

export type ActivateListener = () => void;
const listeners = new Set<ActivateListener>();

export function onPackageActivated(cb: ActivateListener): () => void {
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

function normalizeActivePackage(raw: unknown): ActivePackage | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const opportunityId = String(o.opportunityId ?? '').trim();
  const domain = String(o.domain ?? '').trim();
  const projectId = String(o.projectId ?? '').trim();
  if (!opportunityId || !domain || !projectId) return null;
  const fieldsRaw = Array.isArray(o.fields) ? o.fields : [];
  const fields = fieldsRaw
    .map((f) => {
      if (!f || typeof f !== 'object') return null;
      const row = f as Record<string, unknown>;
      const key = String(row.key ?? '').trim();
      if (!key) return null;
      return { key, value: String(row.value ?? '') };
    })
    .filter(Boolean) as ActivePackage['fields'];
  return {
    opportunityId,
    domain,
    projectId,
    generatedAt: String(o.generatedAt ?? new Date().toISOString()),
    entryUrl: o.entryUrl ? String(o.entryUrl) : undefined,
    fields,
  };
}

function normalizeLearning(data: Record<string, unknown>): LearningAuth | null {
  const apiBase = String(data.apiBase ?? '').trim();
  const accessToken = String(data.accessToken ?? '').trim();
  const orgId = String(data.orgId ?? '').trim();
  const projectId = String(data.projectId ?? '').trim();
  if (!apiBase || !accessToken || !orgId) return null;
  return { apiBase, accessToken, orgId, projectId };
}

function ackToPage(payload: Record<string, unknown>): void {
  window.postMessage(
    {
      source: 'seo-os-companion',
      type: 'companion.activate_ack',
      ...payload,
    },
    location.origin
  );
}

function pushToServiceWorker(
  pkg: ActivePackage,
  learning: LearningAuth | null
): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        {
          type: 'companion.activate_package',
          package: pkg,
          learning,
        },
        (res) => {
          if (chrome.runtime.lastError) {
            companionLog(
              'bridge.sw_error',
              { error: chrome.runtime.lastError.message },
              'error'
            );
            resolve(false);
            return;
          }
          resolve(Boolean(res?.ok));
        }
      );
    } catch {
      resolve(false);
    }
  });
}

export function installWebHandoffBridge(): void {
  companionLog('bridge.installed', { origin: location.origin, phase: '2.3.2' });
  window.addEventListener('message', (event) => {
    if (event.origin && event.origin !== location.origin && !isAllowedOrigin(event.origin)) {
      companionLog('bridge.origin_rejected', { origin: event.origin }, 'warn');
      return;
    }
    if (event.source !== window && event.source !== null) {
      if (!isAllowedOrigin(event.origin)) return;
    }

    const data = event.data as Record<string, unknown> | null;
    if (!data || data.source !== 'seo-os-web') return;

    if (data.type === 'companion.activate_error') {
      const err = String(data.error ?? 'Activate failed');
      companionLog('bridge.activate_error', { error: err }, 'error');
      patchDiagnostics({ lastError: err, lastStage: 'bridge.activate_error' });
      ackToPage({ ok: false, error: err });
      notify();
      return;
    }

    if (data.type !== 'companion.activate_package') return;

    companionLog('bridge.activate_received', {
      hasPackage: Boolean(data.package),
      hasLearning: Boolean(data.accessToken && data.apiBase),
    });

    const pkg = normalizeActivePackage(data.package);
    if (!pkg) {
      const err = 'Invalid package payload from SEO OS';
      companionLog('bridge.activate_invalid', {}, 'error');
      patchDiagnostics({ lastError: err, lastStage: 'bridge.activate_invalid' });
      ackToPage({ ok: false, error: err });
      notify();
      return;
    }

    const learning = normalizeLearning({
      ...data,
      projectId: pkg.projectId,
    });

    // Apply locally without double-notifying SW, then push once and ack
    activatePackage(pkg, { learning, fromBackground: true });
    void pushToServiceWorker(pkg, learning).then((ok) => {
      companionLog(ok ? 'bridge.sw_ack_ok' : 'bridge.sw_ack_fail', {
        opportunityId: pkg.opportunityId,
        fieldCount: pkg.fields.length,
      });
      ackToPage({
        ok,
        opportunityId: pkg.opportunityId,
        domain: pkg.domain,
        fieldCount: pkg.fields.length,
        error: ok ? undefined : 'Companion extension did not confirm — reload the extension',
      });
      notify();
    });
  });
}
