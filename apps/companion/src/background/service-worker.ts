/**
 * Phase 2.3 — ActivePackage + learning auth in SW memory (not chrome.storage).
 */
import type { ActivePackage } from '../core/types';
import { companionLog } from '../core/diagnostics/connection';

type LearningAuth = {
  apiBase: string;
  accessToken: string;
  orgId: string;
  projectId: string;
};

let active: ActivePackage | null = null;
let learning: LearningAuth | null = null;

function normalize(pkg: ActivePackage): ActivePackage {
  return {
    opportunityId: String(pkg.opportunityId),
    domain: String(pkg.domain),
    projectId: String(pkg.projectId),
    generatedAt: String(pkg.generatedAt || new Date().toISOString()),
    entryUrl: pkg.entryUrl,
    fields: (pkg.fields ?? [])
      .filter((f) => f && String(f.key ?? '').trim())
      .map((f) => ({ key: String(f.key).trim(), value: String(f.value ?? '') })),
  };
}

function broadcast(): void {
  const payload = {
    type: 'companion.active_package_changed' as const,
    package: active,
    learning,
  };
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id == null) continue;
      chrome.tabs.sendMessage(tab.id, payload, () => void chrome.runtime.lastError);
    }
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  companionLog('sw.installed', { reason: details.reason, phase: '2.3' });
  active = null;
  learning = null;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'companion.ping') {
    sendResponse({
      ok: true,
      phase: '2.3',
      name: 'SEO OS Companion',
      hasPackage: Boolean(active),
    });
    return false;
  }

  if (message?.type === 'companion.get_active_package') {
    sendResponse({ ok: true, package: active, learning });
    return false;
  }

  if (message?.type === 'companion.activate_package') {
    const raw = message.package as ActivePackage | undefined;
    if (!raw?.opportunityId || !raw?.domain || !raw?.projectId) {
      sendResponse({ ok: false, error: 'Invalid package' });
      return false;
    }
    active = normalize(raw);
    if (message.learning?.apiBase && message.learning?.accessToken && message.learning?.orgId) {
      learning = {
        apiBase: String(message.learning.apiBase).replace(/\/$/, ''),
        accessToken: String(message.learning.accessToken),
        orgId: String(message.learning.orgId),
        projectId: String(message.learning.projectId ?? active.projectId),
      };
    }
    companionLog('sw.package_activated', {
      opportunityId: active.opportunityId,
      domain: active.domain,
      fieldCount: active.fields.length,
      hasLearning: Boolean(learning),
    });
    broadcast();
    sendResponse({ ok: true, package: active, learning });
    return false;
  }

  if (message?.type === 'companion.clear_package') {
    companionLog('sw.package_cleared', {
      previousOpportunityId: active?.opportunityId ?? null,
    });
    active = null;
    learning = null;
    broadcast();
    sendResponse({ ok: true });
    return false;
  }

  sendResponse({ ok: false, error: 'Unknown message type' });
  return false;
});
