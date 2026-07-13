/**
 * ProviderManager — register, health, priority, failover, routing.
 * Never hardcodes a vendor in consumers; resolve via type + config.
 */

import type {
  FailoverResult,
  FrameworkProvider,
  FrameworkProviderDescriptor,
  FrameworkProviderType,
  ProviderManagerConfig,
} from './types.js';
import { PROVIDER_TYPES } from './types.js';
import { KEYWORD_PROVIDERS, type KeywordMetricsProvider } from './keyword.js';
import { AUTHORITY_PROVIDERS, type AuthorityProvider } from './authority.js';
import {
  ANALYTICS_PROVIDERS,
  BROWSER_PROVIDERS,
  CMS_PROVIDERS,
  SEARCH_PROVIDERS,
  STORAGE_PROVIDERS,
  WEBHOOK_PROVIDERS,
} from './adapters.js';
import {
  EMAIL_FRAMEWORK_PROVIDERS,
  EMBEDDING_FRAMEWORK_PROVIDERS,
  IMAGE_FRAMEWORK_PROVIDERS,
  LLM_FRAMEWORK_PROVIDERS,
} from './bridges.js';

const DEFAULTS: Record<FrameworkProviderType, string> = {
  keyword: 'keyword.estimated',
  authority: 'authority.estimated',
  cms: 'cms.wordpress',
  image: 'image.flux',
  email: 'email.smtp',
  browser: 'browser.playwright',
  storage: 'storage.supabase',
  analytics: 'analytics.ga4',
  embedding: 'embedding.gemini',
  llm: 'llm.gemini',
  search: 'search.brave',
  webhook: 'webhook.generic',
};

function collectAll(): FrameworkProvider[] {
  return [
    ...KEYWORD_PROVIDERS,
    ...AUTHORITY_PROVIDERS,
    ...CMS_PROVIDERS,
    ...BROWSER_PROVIDERS,
    ...STORAGE_PROVIDERS,
    ...ANALYTICS_PROVIDERS,
    ...SEARCH_PROVIDERS,
    ...WEBHOOK_PROVIDERS,
    ...IMAGE_FRAMEWORK_PROVIDERS,
    ...LLM_FRAMEWORK_PROVIDERS,
    ...EMAIL_FRAMEWORK_PROVIDERS,
    ...EMBEDDING_FRAMEWORK_PROVIDERS,
  ];
}

export class ProviderManager {
  private providers = new Map<string, FrameworkProvider>();
  private enabled = new Set<string>();
  private disabled = new Set<string>();
  private preferred: Partial<Record<FrameworkProviderType, string>> = {};

  constructor(config: ProviderManagerConfig = {}) {
    for (const p of collectAll()) {
      this.providers.set(p.key, p);
    }
    // Defaults always enabled for free path
    for (const key of Object.values(DEFAULTS)) {
      this.enabled.add(key);
    }
    for (const key of config.enabledKeys ?? []) this.enabled.add(key);
    for (const key of config.disabledKeys ?? []) {
      this.disabled.add(key);
      this.enabled.delete(key);
    }
    this.preferred = { ...DEFAULTS, ...config.preferred };
  }

  register(provider: FrameworkProvider): void {
    this.providers.set(provider.key, provider);
  }

  enable(key: string): void {
    this.disabled.delete(key);
    this.enabled.add(key);
  }

  disable(key: string): void {
    this.enabled.delete(key);
    this.disabled.add(key);
  }

  isEnabled(key: string): boolean {
    if (this.disabled.has(key)) return false;
    return this.enabled.has(key) || key.endsWith('.estimated') || key === DEFAULTS.browser || key === DEFAULTS.storage;
  }

  get(key: string): FrameworkProvider {
    const p = this.providers.get(key);
    if (!p) throw new Error(`Unknown provider: ${key}`);
    return p;
  }

  getDefault(type: FrameworkProviderType): FrameworkProvider {
    const preferred = this.preferred[type] ?? DEFAULTS[type];
    if (this.providers.has(preferred) && this.isEnabled(preferred)) {
      return this.providers.get(preferred)!;
    }
    const fallback = [...this.providers.values()].find(
      (p) => p.type === type && this.isEnabled(p.key)
    );
    if (!fallback) throw new Error(`No provider available for type ${type}`);
    return fallback;
  }

  list(type?: FrameworkProviderType): FrameworkProviderDescriptor[] {
    return [...this.providers.values()]
      .filter((p) => !type || p.type === type)
      .map((p) => {
        const caps = p.capabilities();
        const costTier =
          p.key.includes('estimated')
            ? ('free' as const)
            : p.key.startsWith('llm.gemini') ||
                p.key.startsWith('storage.supabase') ||
                p.key.startsWith('browser.playwright') ||
                p.key.startsWith('email.smtp')
              ? ('free_tier' as const)
              : p.key.includes('ollama') ||
                  p.key.includes('flux') ||
                  p.key.includes('sdxl') ||
                  p.key.includes('comfy') ||
                  p.key.includes('strapi') ||
                  p.key.includes('headless')
                ? ('self_hosted' as const)
                : ('paid' as const);
        return {
          key: p.key,
          displayName: p.displayName,
          version: p.version,
          type: p.type,
          capabilities: Object.keys(caps).filter((k) => Boolean(caps[k])),
          status: (this.disabled.has(p.key) ? 'disabled' : 'available') as FrameworkProviderDescriptor['status'],
          priority: this.preferred[p.type] === p.key ? 1 : 100,
          isDefault: DEFAULTS[p.type] === p.key,
          isEstimated: p.key.includes('estimated'),
          costTier,
          authModes: ['api_key', 'oauth', 'none', 'endpoint', 'password'],
          configured: true,
          enabled: this.isEnabled(p.key),
        };
      })
      .sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));
  }

  types(): FrameworkProviderType[] {
    return [...PROVIDER_TYPES];
  }

  async health(key?: string) {
    const targets = key
      ? [this.get(key)]
      : [...this.providers.values()].filter((p) => this.isEnabled(p.key) || p.key.includes('estimated'));
    const results = await Promise.all(
      targets.map(async (p) => {
        const h = await p.health();
        return { key: p.key, type: p.type, displayName: p.displayName, ...h };
      })
    );
    return results;
  }

  getKeywordProvider(preferred?: string): KeywordMetricsProvider {
    const key = preferred ?? this.preferred.keyword ?? DEFAULTS.keyword;
    const p = this.providers.get(key);
    if (p && 'searchVolume' in p) return p as KeywordMetricsProvider;
    return this.providers.get(DEFAULTS.keyword) as KeywordMetricsProvider;
  }

  getAuthorityProvider(preferred?: string): AuthorityProvider {
    const key = preferred ?? this.preferred.authority ?? DEFAULTS.authority;
    const p = this.providers.get(key);
    if (p && 'domainAuthority' in p) return p as AuthorityProvider;
    return this.providers.get(DEFAULTS.authority) as AuthorityProvider;
  }

  /**
   * Execute with automatic failover: preferred → fallbacks → estimated.
   */
  async withFailover<T>(
    type: FrameworkProviderType,
    operation: (provider: FrameworkProvider) => Promise<T>,
    options?: { preferred?: string; fallbacks?: string[] }
  ): Promise<FailoverResult<T>> {
    const attempted: string[] = [];
    const chain = [
      options?.preferred,
      this.preferred[type],
      DEFAULTS[type],
      ...(options?.fallbacks ?? []),
      ...[...this.providers.values()]
        .filter((p) => p.type === type)
        .sort((a, b) => Number(b.key.includes('estimated')) - Number(a.key.includes('estimated')))
        .map((p) => p.key),
    ].filter((k, i, arr): k is string => Boolean(k) && arr.indexOf(k) === i);

    let lastError: unknown;
    for (const key of chain) {
      if (!this.providers.has(key)) continue;
      if (this.disabled.has(key)) continue;
      attempted.push(key);
      try {
        const provider = this.providers.get(key)!;
        const data = await operation(provider);
        return {
          data,
          providerKey: key,
          failoverUsed: attempted.length > 1,
          attempted,
          estimated: key.includes('estimated'),
        };
      } catch (err) {
        lastError = err;
      }
    }
    throw Object.assign(new Error(`All providers failed for ${type}`), {
      cause: lastError,
      attempted,
    });
  }
}

let singleton: ProviderManager | null = null;

export function getProviderManager(config?: ProviderManagerConfig): ProviderManager {
  if (!singleton || config) {
    singleton = new ProviderManager(config);
  }
  return singleton;
}

export function resetProviderManager(): void {
  singleton = null;
}

export { DEFAULTS as PROVIDER_DEFAULTS };
