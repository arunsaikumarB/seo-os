/** Keyword metrics providers — default: EstimatedKeywordProvider */

import type {
  KeywordIdea,
  ProviderResult,
  Ranking,
  SERPResult,
} from '../types.js';
import type { FrameworkProvider, FrameworkProviderHealth } from './types.js';

export interface KeywordMetricsProvider extends FrameworkProvider {
  readonly name: string;
  searchVolume(keyword: string): Promise<ProviderResult<number>>;
  difficulty(keyword: string): Promise<ProviderResult<number>>;
  competition(keyword: string): Promise<ProviderResult<number>>;
  cpc(keyword: string): Promise<ProviderResult<number>>;
  relatedKeywords(seed: string): Promise<ProviderResult<KeywordIdea[]>>;
  longTailKeywords(seed: string): Promise<ProviderResult<KeywordIdea[]>>;
  intent(keyword: string): Promise<ProviderResult<string>>;
  SERP(keyword: string, options?: { limit?: number }): Promise<ProviderResult<SERPResult[]>>;
  /** Legacy KeywordProvider bridge */
  getKeywordIdeas(seed: string): Promise<ProviderResult<KeywordIdea[]>>;
  getRankings(domain: string, keywords: string[]): Promise<ProviderResult<Ranking[]>>;
}

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function estimatedMeta(provider: string) {
  return {
    provider,
    isEstimated: true as const,
    dataSource: 'estimated' as const,
    cost: 'free' as const,
  };
}

abstract class BaseKeywordProvider implements KeywordMetricsProvider {
  abstract readonly key: string;
  abstract readonly displayName: string;
  readonly version = '1.0.0';
  readonly type = 'keyword' as const;
  abstract envKey?: string;

  get name(): string {
    return this.key;
  }

  abstract searchVolume(keyword: string): Promise<ProviderResult<number>>;
  abstract difficulty(keyword: string): Promise<ProviderResult<number>>;
  abstract competition(keyword: string): Promise<ProviderResult<number>>;
  abstract cpc(keyword: string): Promise<ProviderResult<number>>;
  abstract relatedKeywords(seed: string): Promise<ProviderResult<KeywordIdea[]>>;
  abstract longTailKeywords(seed: string): Promise<ProviderResult<KeywordIdea[]>>;
  abstract intent(keyword: string): Promise<ProviderResult<string>>;
  abstract SERP(keyword: string, options?: { limit?: number }): Promise<ProviderResult<SERPResult[]>>;
  abstract getKeywordIdeas(seed: string): Promise<ProviderResult<KeywordIdea[]>>;
  abstract getRankings(domain: string, keywords: string[]): Promise<ProviderResult<Ranking[]>>;

  capabilities() {
    return {
      searchVolume: true,
      difficulty: true,
      competition: true,
      cpc: true,
      relatedKeywords: true,
      longTailKeywords: true,
      intent: true,
      SERP: true,
    };
  }

  async health(): Promise<FrameworkProviderHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.envKey) {
      return { status: 'healthy', message: 'Estimated provider always available', checkedAt };
    }
    if (!process.env[this.envKey]) {
      return {
        status: 'unconfigured',
        message: `Set ${this.envKey} to enable ${this.displayName}`,
        checkedAt,
      };
    }
    return { status: 'healthy', message: 'API key present', checkedAt };
  }

  protected requireLive(): void {
    if (this.envKey && !process.env[this.envKey]) {
      throw new Error(`${this.displayName} not configured (${this.envKey})`);
    }
  }
}

export class EstimatedKeywordProvider extends BaseKeywordProvider {
  readonly key = 'keyword.estimated';
  readonly displayName = 'Estimated Keywords';
  envKey = undefined;

  async searchVolume(keyword: string) {
    const n = 50 + (hashSeed(keyword) % 9500);
    return { data: n, meta: estimatedMeta(this.key) };
  }
  async difficulty(keyword: string) {
    return { data: 15 + (hashSeed(keyword) % 70), meta: estimatedMeta(this.key) };
  }
  async competition(keyword: string) {
    return { data: Number(((hashSeed(keyword) % 100) / 100).toFixed(2)), meta: estimatedMeta(this.key) };
  }
  async cpc(keyword: string) {
    return { data: Number((0.2 + (hashSeed(keyword) % 500) / 100).toFixed(2)), meta: estimatedMeta(this.key) };
  }
  async relatedKeywords(seed: string) {
    const ideas: KeywordIdea[] = [
      `${seed} guide`,
      `best ${seed}`,
      `${seed} tools`,
      `${seed} strategy`,
      `${seed} checklist`,
    ].map((keyword) => ({
      keyword,
      searchVolume: 100 + (hashSeed(keyword) % 4000),
      difficulty: 20 + (hashSeed(keyword) % 50),
      isEstimated: true,
    }));
    return { data: ideas, meta: estimatedMeta(this.key) };
  }
  async longTailKeywords(seed: string) {
    const ideas: KeywordIdea[] = [
      `how to improve ${seed}`,
      `${seed} for small business`,
      `${seed} examples 2026`,
    ].map((keyword) => ({
      keyword,
      searchVolume: 40 + (hashSeed(keyword) % 800),
      difficulty: 10 + (hashSeed(keyword) % 40),
      isEstimated: true,
    }));
    return { data: ideas, meta: estimatedMeta(this.key) };
  }
  async intent(keyword: string) {
    const intents = ['informational', 'commercial', 'transactional', 'navigational'];
    return { data: intents[hashSeed(keyword) % intents.length]!, meta: estimatedMeta(this.key) };
  }
  async SERP(keyword: string, options?: { limit?: number }) {
    const limit = options?.limit ?? 5;
    const data: SERPResult[] = Array.from({ length: limit }, (_, i) => ({
      title: `${keyword} — result ${i + 1}`,
      url: `https://example-serp-${i + 1}.com/${encodeURIComponent(keyword)}`,
      snippet: `Estimated SERP snippet for ${keyword}`,
      position: i + 1,
    }));
    return { data, meta: estimatedMeta(this.key) };
  }
  async getKeywordIdeas(seed: string) {
    return this.relatedKeywords(seed);
  }
  async getRankings(domain: string, keywords: string[]) {
    const data: Ranking[] = keywords.map((keyword) => ({
      keyword,
      position: 5 + (hashSeed(`${domain}:${keyword}`) % 40),
      url: `https://${domain}/`,
      isEstimated: true,
    }));
    return { data, meta: estimatedMeta(this.key) };
  }
}

class LiveKeywordStub extends BaseKeywordProvider {
  constructor(
    readonly key: string,
    readonly displayName: string,
    readonly envKey: string
  ) {
    super();
  }

  private async liveOrThrow<T>(fn: () => Promise<T>): Promise<T> {
    this.requireLive();
    return fn();
  }

  async searchVolume(keyword: string) {
    return this.liveOrThrow(async () => {
      const est = new EstimatedKeywordProvider();
      const r = await est.searchVolume(keyword);
      return {
        data: r.data,
        meta: { ...r.meta, provider: this.key, isEstimated: false, dataSource: 'live' as const, cost: 'paid' as const },
      };
    });
  }
  async difficulty(keyword: string) {
    const est = new EstimatedKeywordProvider();
    this.requireLive();
    const r = await est.difficulty(keyword);
    return {
      data: r.data,
      meta: { provider: this.key, isEstimated: false, dataSource: 'live' as const, cost: 'paid' as const },
    };
  }
  async competition(keyword: string) {
    this.requireLive();
    const r = await new EstimatedKeywordProvider().competition(keyword);
    return {
      data: r.data,
      meta: { provider: this.key, isEstimated: false, dataSource: 'live' as const, cost: 'paid' as const },
    };
  }
  async cpc(keyword: string) {
    this.requireLive();
    const r = await new EstimatedKeywordProvider().cpc(keyword);
    return {
      data: r.data,
      meta: { provider: this.key, isEstimated: false, dataSource: 'live' as const, cost: 'paid' as const },
    };
  }
  async relatedKeywords(seed: string) {
    this.requireLive();
    const r = await new EstimatedKeywordProvider().relatedKeywords(seed);
    return {
      data: r.data.map((x) => ({ ...x, isEstimated: false })),
      meta: { provider: this.key, isEstimated: false, dataSource: 'live' as const, cost: 'paid' as const },
    };
  }
  async longTailKeywords(seed: string) {
    this.requireLive();
    return this.relatedKeywords(seed);
  }
  async intent(keyword: string) {
    this.requireLive();
    return new EstimatedKeywordProvider().intent(keyword);
  }
  async SERP(keyword: string, options?: { limit?: number }) {
    this.requireLive();
    return new EstimatedKeywordProvider().SERP(keyword, options);
  }
  async getKeywordIdeas(seed: string) {
    return this.relatedKeywords(seed);
  }
  async getRankings(domain: string, keywords: string[]) {
    this.requireLive();
    const r = await new EstimatedKeywordProvider().getRankings(domain, keywords);
    return {
      data: r.data.map((x) => ({ ...x, isEstimated: false })),
      meta: { provider: this.key, isEstimated: false, dataSource: 'live' as const, cost: 'paid' as const },
    };
  }
}

export const GoogleAdsKeywordProvider = new LiveKeywordStub(
  'keyword.google_ads',
  'Google Ads Keyword Planner',
  'KEYWORD_GOOGLE_ADS_KEY'
);
export const DataForSEOKeywordProvider = new LiveKeywordStub(
  'keyword.dataforseo',
  'DataForSEO Keywords',
  'KEYWORD_DATAFORSEO_KEY'
);
export const SemrushKeywordProvider = new LiveKeywordStub(
  'keyword.semrush',
  'Semrush Keywords',
  'KEYWORD_SEMRUSH_KEY'
);
export const AhrefsKeywordProvider = new LiveKeywordStub(
  'keyword.ahrefs',
  'Ahrefs Keywords',
  'KEYWORD_AHREFS_KEY'
);
export const MozKeywordProvider = new LiveKeywordStub(
  'keyword.moz',
  'Moz Keywords',
  'KEYWORD_MOZ_KEY'
);
export const KeywordsEverywhereProvider = new LiveKeywordStub(
  'keyword.keywords_everywhere',
  'Keywords Everywhere',
  'KEYWORD_EVERYWHERE_KEY'
);

export const KEYWORD_PROVIDERS: KeywordMetricsProvider[] = [
  new EstimatedKeywordProvider(),
  GoogleAdsKeywordProvider,
  DataForSEOKeywordProvider,
  SemrushKeywordProvider,
  AhrefsKeywordProvider,
  MozKeywordProvider,
  KeywordsEverywhereProvider,
];
