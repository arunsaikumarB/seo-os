/**
 * Phase 2.3.2 — one ActivePackage in tab memory + learning auth.
 * Durable copy lives in SW chrome.storage.session (survives SW sleep).
 */
import type { ActivePackage } from '../types';
import { companionLog, patchDiagnostics } from '../diagnostics/connection';
import {
  clearLearningCache,
  fetchDomainKnowledge,
  setLearningAuth,
  type LearningAuth,
} from '../learning/api';

export type ConnectionState = 'waiting_for_package' | 'connected';

type Listener = () => void;
const listeners = new Set<Listener>();

let active: ActivePackage | null = null;
let learningAuth: LearningAuth | null = null;

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

function applyLearning(auth: LearningAuth | null): void {
  learningAuth = auth;
  setLearningAuth(auth);
  if (!auth) clearLearningCache();
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
  pkg?: ActivePackage,
  learning?: LearningAuth | null
): void {
  try {
    chrome.runtime.sendMessage(
      type === 'companion.activate_package'
        ? { type, package: pkg, learning }
        : { type },
      () => void chrome.runtime.lastError
    );
  } catch {
    /* popup / tests */
  }
}

export function activatePackage(
  pkg: ActivePackage,
  opts?: { fromBackground?: boolean; learning?: LearningAuth | null }
): void {
  const prev = active?.opportunityId ?? null;
  applyLocal(pkg, 'package.activated');
  if (opts?.learning !== undefined) {
    applyLearning(opts.learning);
  }
  companionLog('package.activated', {
    previousOpportunityId: prev,
    opportunityId: active?.opportunityId,
    fromBackground: Boolean(opts?.fromBackground),
    hasLearningAuth: Boolean(learningAuth),
  });

  // Prefetch domain knowledge for the package domain (and current host)
  const host = typeof location !== 'undefined' ? location.hostname : pkg.domain;
  void fetchDomainKnowledge(pkg.domain);
  if (host && host !== pkg.domain) void fetchDomainKnowledge(host);

  if (!opts?.fromBackground) {
    notifyBackground('companion.activate_package', active!, learningAuth);
  }
}

export function clearPackage(opts?: { fromBackground?: boolean }): void {
  applyLocal(null, 'package.cleared');
  applyLearning(null);
  if (!opts?.fromBackground) {
    notifyBackground('companion.clear_package');
  }
}

export function pullActivePackageFromBackground(): void {
  try {
    chrome.runtime.sendMessage({ type: 'companion.get_active_package' }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res?.learning) {
        applyLearning(res.learning as LearningAuth);
      }
      if (res?.ok && res.package) {
        applyLocal(res.package as ActivePackage, 'package.synced_from_sw');
        const host = typeof location !== 'undefined' ? location.hostname : '';
        const domain = (res.package as ActivePackage).domain;
        void fetchDomainKnowledge(domain);
        if (host) void fetchDomainKnowledge(host);
      } else if (res?.ok && !res.package) {
        applyLocal(null, 'package.synced_empty');
        applyLearning(null);
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

export function installActivePackageSync(): void {
  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'companion.active_package_changed') {
        if (message.learning !== undefined) {
          applyLearning((message.learning as LearningAuth | null) ?? null);
        }
        applyLocal(
          (message.package as ActivePackage | null) ?? null,
          message.package ? 'package.synced_broadcast' : 'package.cleared_broadcast'
        );
        if (message.package) {
          const domain = (message.package as ActivePackage).domain;
          const host = typeof location !== 'undefined' ? location.hostname : '';
          void fetchDomainKnowledge(domain);
          if (host) void fetchDomainKnowledge(host);
        }
      }
    });
  } catch {
    /* ignore */
  }
  pullActivePackageFromBackground();
}
