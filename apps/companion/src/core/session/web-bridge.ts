/**
 * Bridge: SEO OS activates a package via postMessage — no tokens, no fetch.
 */
import type { ActivePackage } from '../types';
import { companionLog, patchDiagnostics } from '../diagnostics/connection';
import { activatePackage } from '../runtime/memory';

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

export function installWebHandoffBridge(): void {
  companionLog('bridge.installed', { origin: location.origin });
  window.addEventListener('message', (event) => {
    if (event.origin && event.origin !== location.origin && !isAllowedOrigin(event.origin)) {
      companionLog('bridge.origin_rejected', { origin: event.origin }, 'warn');
      return;
    }
    // Prefer same-window messages from SEO OS page
    if (event.source !== window && event.source !== null) {
      if (!isAllowedOrigin(event.origin)) return;
    }

    const data = event.data as {
      source?: string;
      type?: string;
      package?: unknown;
      error?: string;
    } | null;
    if (!data || data.source !== 'seo-os-web') return;

    if (data.type === 'companion.activate_error') {
      const err = String(data.error ?? 'Activate failed');
      companionLog('bridge.activate_error', { error: err }, 'error');
      patchDiagnostics({ lastError: err, lastStage: 'bridge.activate_error' });
      notify();
      return;
    }

    if (data.type !== 'companion.activate_package') return;

    companionLog('bridge.activate_received', {
      hasPackage: Boolean(data.package),
    });

    const pkg = normalizeActivePackage(data.package);
    if (!pkg) {
      const err = 'Invalid package payload from SEO OS';
      companionLog('bridge.activate_invalid', {}, 'error');
      patchDiagnostics({ lastError: err, lastStage: 'bridge.activate_invalid' });
      notify();
      return;
    }

    activatePackage(pkg);
    notify();
  });
}
