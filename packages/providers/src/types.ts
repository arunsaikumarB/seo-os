import type { DataSource } from '@seo-os/shared';

export interface ProviderMeta {
  provider: string;
  isEstimated: boolean;
  dataSource: DataSource;
  cost: 'free' | 'free_tier' | 'self_hosted' | 'paid';
  cachedAt?: string;
}

export interface ProviderResult<T> {
  data: T;
  meta: ProviderMeta;
}

export interface PaginationOptions {
  cursor?: string;
  limit?: number;
}

export interface Backlink {
  sourceUrl: string;
  targetUrl: string;
  anchorText?: string;
  linkType?: 'dofollow' | 'nofollow' | 'ugc' | 'sponsored';
  domainAuthority?: number;
}

export interface ReferringDomain {
  domain: string;
  backlinkCount: number;
  domainAuthority?: number;
}

export interface KeywordIdea {
  keyword: string;
  searchVolume?: number;
  difficulty?: number;
  isEstimated: boolean;
}

export interface Ranking {
  keyword: string;
  position: number;
  url?: string;
  isEstimated: boolean;
}

export interface SERPResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
}

export interface DomainComparison {
  domain: string;
  competitorDomain: string;
  metrics: Record<string, number | string>;
}

export interface ContentGap {
  keyword: string;
  competitorDomain: string;
  competitorPosition?: number;
  ourPosition?: number;
}

export interface BacklinkGap {
  domain: string;
  competitorDomain: string;
  opportunityType?: string;
}
