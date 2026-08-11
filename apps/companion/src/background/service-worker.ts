/**
 * Active package lives in SW memory + chrome.storage.session.
 * Session storage survives MV3 service-worker sleep (cleared when browser closes).
 * Never uses chrome.storage.local — no long-term business data disk cache.
 */
import type { ActivePackage } from '../core/types';
import { companionLog } from '../core/diagnostics/connection';

type LearningAuth = {
  apiBase: string;
  accessToken: string;
  orgId: string;
  projectId: string;
};

const SESSION_KEY = 'seoOsActivePackage';
const SESSION_LEARNING_KEY = 'seoOsLearningAuth';

let active: ActivePackage | null = null;
let learning: LearningAuth | null = null;
let hydrated = false;

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

async function persist(): Promise<void> {
  try {
    await chrome.storage.session.set({
      [SESSION_KEY]: active,
      [SESSION_LEARNING_KEY]: learning,
    });
  } catch (err) {
    companionLog(
      'sw.session_persist_failed',
      { error: err instanceof Error ? err.message : String(err) },
      'warn'
    );
  }
}

async function hydrateFromSession(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const data = await chrome.storage.session.get([SESSION_KEY, SESSION_LEARNING_KEY]);
    if (data[SESSION_KEY]?.opportunityId) {
      active = normalize(data[SESSION_KEY] as ActivePackage);
      companionLog('sw.session_restored', {
        opportunityId: active.opportunityId,
        domain: active.domain,
        fieldCount: active.fields.length,
      });
    }
    if (data[SESSION_LEARNING_KEY]?.apiBase) {
      learning = data[SESSION_LEARNING_KEY] as LearningAuth;
    }
  } catch (err) {
    companionLog(
      'sw.session_hydrate_failed',
      { error: err instanceof Error ? err.message : String(err) },
      'warn'
    );
  }
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
  companionLog('sw.installed', { reason: details.reason, phase: '2.3.2' });
  // Keep session package across extension updates; only clear on fresh install
  if (details.reason === 'install') {
    active = null;
    learning = null;
    void chrome.storage.session.remove([SESSION_KEY, SESSION_LEARNING_KEY]);
  }
});

chrome.runtime.onStartup.addListener(() => {
  void hydrateFromSession();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const reply = async () => {
    await hydrateFromSession();

    if (message?.type === 'companion.ping') {
      return {
        ok: true,
        phase: '2.3.2',
        name: 'Backlink Agent Companion',
        hasPackage: Boolean(active),
      };
    }

    if (message?.type === 'companion.get_active_package') {
      return { ok: true, package: active, learning };
    }

    if (message?.type === 'companion.activate_package') {
      const raw = message.package as ActivePackage | undefined;
      if (!raw?.opportunityId || !raw?.domain || !raw?.projectId) {
        return { ok: false, error: 'Invalid package' };
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
      await persist();
      companionLog('sw.package_activated', {
        opportunityId: active.opportunityId,
        domain: active.domain,
        fieldCount: active.fields.length,
        hasLearning: Boolean(learning),
      });
      broadcast();
      return { ok: true, package: active, learning };
    }

    if (message?.type === 'companion.clear_package') {
      companionLog('sw.package_cleared', {
        previousOpportunityId: active?.opportunityId ?? null,
      });
      active = null;
      learning = null;
      await persist();
      broadcast();
      return { ok: true };
    }

    return { ok: false, error: 'Unknown message type' };
  };

  void reply().then(sendResponse);
  return true; // async response
});

void hydrateFromSession();
