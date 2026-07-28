/**
 * Phase 2.2 — exactly one ActivePackage in memory.
 * Content-script copy is synced from the service worker so Open Website tabs share it.
 * No chrome.storage. No tokens. No history.
 */
import type { ActivePackage } from '../types';
import { companionLog, patchDiagnostics } from '../diagnostics/connection';

export type ConnectionState = 'waiting_for_package' | 'connected';

type Listener = () => void;
const listeners = new Set<Listener>();

let active: ActivePackage | null = null;

function emit(): void {
  for (const cb of listeners) {
    try {
      cb();
    } catch {
      /* ignore */
    }
  }
}

function applyLocal(pkg: ActivePackage | null, stage: string): void {
  active = pkg
    ? {
        opportunityId: String(pkg.opportunityId),
        domain: String(pkg.domain),
        projectId: String(pkg.projectId),
        generatedAt: String(pkg.generatedAt || new Date().toISOString()),
        entryUrl: pkg.entryUrl,
        fields: (pkg.fields ?? [])
          .filter((f) => f && String(f.key ?? '').trim())
          .map((f) => ({ key: String(f.key).trim(), value: String(f.value ?? '') })),
      }
    : null;

  if (active) {
    companionLog(stage, {
      opportunityId: active.opportunityId,
      domain: active.domain,
      fieldCount: active.fields.length,
      generatedAt: active.generatedAt,
    });
    patchDiagnostics({
      connected: 'Yes',
      packageLoaded: 'Yes',
      opportunityId: active.opportunityId,
      domain: active.domain,
      fieldCount: active.fields.length,
      generatedAt: active.generatedAt,
      lastError: null,
      lastStage: stage,
    });
  } else {
    companionLog(stage, {});
    patchDiagnostics({
      connected: 'No',
      packageLoaded: 'No',
      opportunityId: null,
      domain: null,
      fieldCount: 0,
      generatedAt: null,
      lastError: null,
      lastStage: stage,
    });
  }
  emit();
}

export function onActivePackageChange(cb: Listener): () => void {
  listeners.add(cb);
  cb();
  return () => listeners.delete(cb);
}

export function getActivePackage(): ActivePackage | null {
  return active ? { ...active, fields: active.fields.map((f) => ({ ...f })) } : null;
}

export function getConnectionState(): ConnectionState {
  return active ? 'connected' : 'waiting_for_package';
}

function notifyBackground(
  type: 'companion.activate_package' | 'companion.clear_package',
  pkg?: ActivePackage
): void {
  try {
    chrome.runtime.sendMessage(
      type === 'companion.activate_package'
        ? { type, package: pkg }
        : { type },
      () => void chrome.runtime.lastError
    );
  } catch {
    /* popup / tests without extension runtime */
  }
}

/** Apply package locally and broadcast to service worker (canonical copy). */
export function activatePackage(pkg: ActivePackage, opts?: { fromBackground?: boolean }): void {
  const prev = active?.opportunityId ?? null;
  applyLocal(pkg, 'package.activated');
  companionLog('package.activated', {
    previousOpportunityId: prev,
    opportunityId: active?.opportunityId,
    fromBackground: Boolean(opts?.fromBackground),
  });
  if (!opts?.fromBackground) {
    notifyBackground('companion.activate_package', active!);
  }
}

/** Clear local + broadcast. */
export function clearPackage(opts?: { fromBackground?: boolean }): void {
  applyLocal(null, 'package.cleared');
  if (!opts?.fromBackground) {
    notifyBackground('companion.clear_package');
  }
}

/** Hydrate from service worker (call on content-script mount). */
export function pullActivePackageFromBackground(): void {
  try {
    chrome.runtime.sendMessage({ type: 'companion.get_active_package' }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res?.ok && res.package) {
        applyLocal(res.package as ActivePackage, 'package.synced_from_sw');
      } else if (res?.ok && !res.package) {
        applyLocal(null, 'package.synced_empty');
      }
    });
  } catch {
    /* ignore */
  }
}

export function fieldCount(pkg: ActivePackage | null = active): number {
  if (!pkg) return 0;
  return pkg.fields.filter((f) => String(f.value ?? '').trim()).length;
}

/** Listen for SW broadcasts (other tabs activated / cleared). */
export function installActivePackageSync(): void {
  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'companion.active_package_changed') {
        applyLocal(
          (message.package as ActivePackage | null) ?? null,
          message.package ? 'package.synced_broadcast' : 'package.cleared_broadcast'
        );
      }
    });
  } catch {
    /* ignore */
  }
  pullActivePackageFromBackground();
}
