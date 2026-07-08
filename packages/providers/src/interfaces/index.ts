import type {
  Backlink,
  BacklinkGap,
  ContentGap,
  DomainComparison,
  KeywordIdea,
  PaginationOptions,
  ProviderResult,
  Ranking,
  ReferringDomain,
  SERPResult,
} from '../types.js';

export interface BacklinkProvider {
  readonly name: string;
  getBacklinks(domain: string, options?: PaginationOptions): Promise<ProviderResult<Backlink[]>>;
  getReferringDomains(domain: string): Promise<ProviderResult<ReferringDomain[]>>;
}

export interface KeywordProvider {
  readonly name: string;
  getRankings(domain: string, keywords: string[]): Promise<ProviderResult<Ranking[]>>;
  getKeywordIdeas(seed: string): Promise<ProviderResult<KeywordIdea[]>>;
}

export interface SERPProvider {
  readonly name: string;
  search(query: string, options?: { limit?: number }): Promise<ProviderResult<SERPResult[]>>;
}

export interface CompetitorProvider {
  readonly name: string;
  getCompetitorSuggestions(domain: string, industry?: string): Promise<ProviderResult<string[]>>;
  compareDomains(a: string, b: string): Promise<ProviderResult<DomainComparison>>;
  getContentGap?(domain: string, competitors: string[]): Promise<ProviderResult<ContentGap[]>>;
  getBacklinkGap?(domain: string, competitors: string[]): Promise<ProviderResult<BacklinkGap[]>>;
}

export interface AIProvider {
  readonly name: string;
  complete(
    messages: Array<{ role: string; content: string }>,
    options?: Record<string, unknown>
  ): Promise<{
    text: string;
    usage: { inputTokens: number; outputTokens: number };
  }>;
}

export interface EmailProvider {
  readonly name: string;
  send(options: {
    to: string;
    subject: string;
    bodyHtml: string;
    bodyText?: string;
  }): Promise<{ messageId: string }>;
}

export type ProviderType = 'backlink' | 'keyword' | 'serp' | 'competitor' | 'ai' | 'email';
