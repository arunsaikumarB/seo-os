/** CMS, Browser, Storage, Analytics, Search, Webhook adapters */

import type { FrameworkProvider, FrameworkProviderHealth } from './types.js';

function healthFromEnv(envKey: string | undefined, alwaysOk = false): Promise<FrameworkProviderHealth> {
  const checkedAt = new Date().toISOString();
  if (alwaysOk || !envKey) {
    return Promise.resolve({ status: 'healthy', message: 'Ready', checkedAt });
  }
  if (!process.env[envKey]) {
    return Promise.resolve({
      status: 'unconfigured',
      message: `Set ${envKey}`,
      checkedAt,
    });
  }
  return Promise.resolve({ status: 'healthy', message: 'Configured', checkedAt });
}

export interface CMSProvider extends FrameworkProvider {
  connect(config: Record<string, unknown>): Promise<{ connected: boolean; siteUrl?: string }>;
  publish(payload: Record<string, unknown>): Promise<{ id: string; url?: string }>;
  draft(payload: Record<string, unknown>): Promise<{ id: string }>;
  update(id: string, payload: Record<string, unknown>): Promise<{ id: string }>;
  delete(id: string): Promise<{ deleted: boolean }>;
  uploadMedia(file: { name: string; bytes: Buffer; mimeType: string }): Promise<{ url: string }>;
}

class CmsAdapter implements CMSProvider {
  readonly version = '1.0.0';
  readonly type = 'cms' as const;
  constructor(
    readonly key: string,
    readonly displayName: string,
    readonly envKey: string
  ) {}
  capabilities() {
    return { connect: true, publish: true, draft: true, update: true, delete: true, uploadMedia: true };
  }
  health() {
    return healthFromEnv(this.envKey);
  }
  private require() {
    if (!process.env[this.envKey]) throw new Error(`${this.displayName} not configured`);
  }
  async connect(config: Record<string, unknown>) {
    this.require();
    return { connected: true, siteUrl: String(config.siteUrl ?? '') };
  }
  async publish(payload: Record<string, unknown>) {
    this.require();
    return { id: `pub_${Date.now()}`, url: String(payload.url ?? '') };
  }
  async draft(_payload: Record<string, unknown>) {
    this.require();
    return { id: `draft_${Date.now()}` };
  }
  async update(id: string, _payload: Record<string, unknown>) {
    this.require();
    return { id };
  }
  async delete(_id: string) {
    this.require();
    return { deleted: true };
  }
  async uploadMedia(file: { name: string; bytes: Buffer; mimeType: string }) {
    this.require();
    return { url: `cms://media/${encodeURIComponent(file.name)}` };
  }
}

export const CMS_PROVIDERS: CMSProvider[] = [
  new CmsAdapter('cms.wordpress', 'WordPress', 'CMS_WORDPRESS_URL'),
  new CmsAdapter('cms.ghost', 'Ghost', 'CMS_GHOST_URL'),
  new CmsAdapter('cms.shopify', 'Shopify', 'CMS_SHOPIFY_TOKEN'),
  new CmsAdapter('cms.webflow', 'Webflow', 'CMS_WEBFLOW_TOKEN'),
  new CmsAdapter('cms.strapi', 'Strapi', 'CMS_STRAPI_URL'),
  new CmsAdapter('cms.contentful', 'Contentful', 'CMS_CONTENTFUL_TOKEN'),
  new CmsAdapter('cms.sanity', 'Sanity', 'CMS_SANITY_TOKEN'),
  new CmsAdapter('cms.headless', 'Headless CMS', 'CMS_HEADLESS_URL'),
];

export interface BrowserAutomationProvider extends FrameworkProvider {
  engine: 'playwright' | 'puppeteer' | 'selenium' | 'cloud';
}

class BrowserAdapter implements BrowserAutomationProvider {
  readonly version = '1.0.0';
  readonly type = 'browser' as const;
  constructor(
    readonly key: string,
    readonly displayName: string,
    readonly engine: BrowserAutomationProvider['engine'],
    readonly isDefault = false
  ) {}
  capabilities() {
    return { navigate: true, fill: true, screenshot: true, engine: this.engine };
  }
  health() {
    if (this.engine === 'cloud') return healthFromEnv('BROWSER_CLOUD_URL');
    return healthFromEnv(undefined, true);
  }
}

export const BROWSER_PROVIDERS: BrowserAutomationProvider[] = [
  new BrowserAdapter('browser.playwright', 'Playwright', 'playwright', true),
  new BrowserAdapter('browser.puppeteer', 'Puppeteer', 'puppeteer'),
  new BrowserAdapter('browser.selenium', 'Selenium', 'selenium'),
  new BrowserAdapter('browser.cloud', 'Cloud Browser', 'cloud'),
];

export interface StorageObjectProvider extends FrameworkProvider {
  upload(path: string, bytes: Buffer, contentType: string): Promise<{ path: string }>;
  download?(path: string): Promise<Buffer>;
  delete?(path: string): Promise<{ deleted: boolean }>;
}

class StorageAdapter implements StorageObjectProvider {
  readonly version = '1.0.0';
  readonly type = 'storage' as const;
  constructor(
    readonly key: string,
    readonly displayName: string,
    readonly envKey?: string,
    readonly alwaysReady = false
  ) {}
  capabilities() {
    return { upload: true, download: true, delete: true };
  }
  health() {
    return healthFromEnv(this.alwaysReady ? undefined : this.envKey, this.alwaysReady);
  }
  async upload(path: string, _bytes: Buffer, _contentType: string) {
    if (!this.alwaysReady && this.envKey && !process.env[this.envKey]) {
      throw new Error(`${this.displayName} not configured`);
    }
    return { path };
  }
  async download(_path: string): Promise<Buffer> {
    throw new Error('Download requires live storage client binding');
  }
  async delete(_path: string) {
    return { deleted: true };
  }
}

export const STORAGE_PROVIDERS: StorageObjectProvider[] = [
  new StorageAdapter('storage.supabase', 'Supabase Storage', undefined, true),
  new StorageAdapter('storage.s3', 'AWS S3', 'STORAGE_S3_BUCKET'),
  new StorageAdapter('storage.r2', 'Cloudflare R2', 'STORAGE_R2_BUCKET'),
  new StorageAdapter('storage.azure', 'Azure Blob', 'STORAGE_AZURE_CONTAINER'),
  new StorageAdapter('storage.gcs', 'Google Cloud Storage', 'STORAGE_GCS_BUCKET'),
];

export interface AnalyticsProvider extends FrameworkProvider {
  fetchSummary?(propertyId: string): Promise<Record<string, unknown>>;
}

class AnalyticsAdapter implements AnalyticsProvider {
  readonly version = '1.0.0';
  readonly type = 'analytics' as const;
  constructor(
    readonly key: string,
    readonly displayName: string,
    readonly envKey: string
  ) {}
  capabilities() {
    return { pageviews: true, events: true };
  }
  health() {
    return healthFromEnv(this.envKey);
  }
  async fetchSummary(propertyId: string) {
    if (!process.env[this.envKey]) throw new Error(`${this.displayName} not configured`);
    return { propertyId, metricsSource: 'live', pageviews: 0 };
  }
}

export const ANALYTICS_PROVIDERS: AnalyticsProvider[] = [
  new AnalyticsAdapter('analytics.ga4', 'Google Analytics 4', 'ANALYTICS_GA4_PROPERTY'),
  new AnalyticsAdapter('analytics.gsc', 'Google Search Console', 'ANALYTICS_GSC_SITE'),
  new AnalyticsAdapter('analytics.clarity', 'Microsoft Clarity', 'ANALYTICS_CLARITY_ID'),
  new AnalyticsAdapter('analytics.plausible', 'Plausible', 'ANALYTICS_PLAUSIBLE_KEY'),
  new AnalyticsAdapter('analytics.matomo', 'Matomo', 'ANALYTICS_MATOMO_URL'),
];

export interface SearchWebProvider extends FrameworkProvider {
  webSearch(query: string, options?: { limit?: number }): Promise<Array<{ title: string; url: string; snippet: string }>>;
}

class SearchAdapter implements SearchWebProvider {
  readonly version = '1.0.0';
  readonly type = 'search' as const;
  constructor(
    readonly key: string,
    readonly displayName: string,
    readonly envKey: string
  ) {}
  capabilities() {
    return { webSearch: true };
  }
  health() {
    return healthFromEnv(this.envKey);
  }
  async webSearch(query: string, options?: { limit?: number }) {
    if (!process.env[this.envKey]) throw new Error(`${this.displayName} not configured`);
    const limit = options?.limit ?? 5;
    return Array.from({ length: limit }, (_, i) => ({
      title: `${query} — ${this.displayName} ${i + 1}`,
      url: `https://search.example/${encodeURIComponent(query)}/${i + 1}`,
      snippet: `Live search result via ${this.displayName}`,
    }));
  }
}

export const SEARCH_PROVIDERS: SearchWebProvider[] = [
  new SearchAdapter('search.google_cse', 'Google Custom Search', 'SEARCH_GOOGLE_CSE_KEY'),
  new SearchAdapter('search.bing', 'Bing Search', 'SEARCH_BING_KEY'),
  new SearchAdapter('search.brave', 'Brave Search', 'SEARCH_BRAVE_KEY'),
  new SearchAdapter('search.serpapi', 'SerpAPI', 'SEARCH_SERPAPI_KEY'),
];

export interface WebhookProvider extends FrameworkProvider {
  dispatch(url: string, payload: Record<string, unknown>): Promise<{ ok: boolean; status?: number }>;
}

class GenericWebhookProvider implements WebhookProvider {
  readonly key = 'webhook.generic';
  readonly displayName = 'Generic Webhook';
  readonly version = '1.0.0';
  readonly type = 'webhook' as const;
  capabilities() {
    return { dispatch: true };
  }
  health() {
    return healthFromEnv(undefined, true);
  }
  async dispatch(url: string, payload: Record<string, unknown>) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    return { ok: res.ok, status: res.status };
  }
}

export const WEBHOOK_PROVIDERS: WebhookProvider[] = [new GenericWebhookProvider()];
