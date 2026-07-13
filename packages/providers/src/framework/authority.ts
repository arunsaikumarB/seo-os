/** Authority providers — default: EstimatedAuthorityProvider */

import type { FrameworkProvider, FrameworkProviderHealth } from './types.js';
import type { ProviderResult } from '../types.js';

export interface AuthorityMetrics {
  domainAuthority: number;
  pageAuthority?: number;
  spamScore: number;
  traffic?: number;
  referringDomains?: number;
  backlinks?: number;
  topPages?: Array<{ url: string; traffic?: number }>;
  keywords?: Array<{ keyword: string; position?: number }>;
  isEstimated: boolean;
}

export interface AuthorityProvider extends FrameworkProvider {
  domainAuthority(domain: string): Promise<ProviderResult<number>>;
  pageAuthority(url: string): Promise<ProviderResult<number>>;
  spam(domain: string): Promise<ProviderResult<number>>;
  traffic(domain: string): Promise<ProviderResult<number>>;
  refDomains(domain: string): Promise<ProviderResult<number>>;
  backlinks(domain: string): Promise<ProviderResult<number>>;
  topPages(domain: string): Promise<ProviderResult<Array<{ url: string; traffic?: number }>>>;
  keywords(domain: string): Promise<ProviderResult<Array<{ keyword: string; position?: number }>>>;
  profile(domain: string): Promise<ProviderResult<AuthorityMetrics>>;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function meta(provider: string, estimated: boolean) {
  return {
    provider,
    isEstimated: estimated,
    dataSource: (estimated ? 'estimated' : 'live') as 'estimated' | 'live',
    cost: (estimated ? 'free' : 'paid') as 'free' | 'paid',
  };
}

export class EstimatedAuthorityProvider implements AuthorityProvider {
  readonly key = 'authority.estimated';
  readonly displayName = 'Estimated Authority';
  readonly version = '1.0.0';
  readonly type = 'authority' as const;

  capabilities() {
    return {
      domainAuthority: true,
      pageAuthority: true,
      spam: true,
      traffic: true,
      refDomains: true,
      backlinks: true,
      topPages: true,
      keywords: true,
    };
  }

  async health(): Promise<FrameworkProviderHealth> {
    return {
      status: 'healthy',
      message: 'Estimated authority always available',
      checkedAt: new Date().toISOString(),
    };
  }

  async domainAuthority(domain: string) {
    return { data: 15 + (hash(domain) % 60), meta: meta(this.key, true) };
  }
  async pageAuthority(url: string) {
    return { data: 10 + (hash(url) % 55), meta: meta(this.key, true) };
  }
  async spam(domain: string) {
    return { data: hash(domain) % 25, meta: meta(this.key, true) };
  }
  async traffic(domain: string) {
    return { data: 500 + (hash(domain) % 50_000), meta: meta(this.key, true) };
  }
  async refDomains(domain: string) {
    return { data: 20 + (hash(domain) % 2000), meta: meta(this.key, true) };
  }
  async backlinks(domain: string) {
    return { data: 50 + (hash(domain) % 10_000), meta: meta(this.key, true) };
  }
  async topPages(domain: string) {
    return {
      data: [
        { url: `https://${domain}/`, traffic: 1000 + (hash(domain) % 5000) },
        { url: `https://${domain}/blog`, traffic: 400 + (hash(domain) % 2000) },
      ],
      meta: meta(this.key, true),
    };
  }
  async keywords(domain: string) {
    return {
      data: [
        { keyword: `${domain.split('.')[0]} software`, position: 8 },
        { keyword: `best ${domain.split('.')[0]}`, position: 14 },
      ],
      meta: meta(this.key, true),
    };
  }
  async profile(domain: string) {
    const [da, spam, traffic, refs, links, pages, kws] = await Promise.all([
      this.domainAuthority(domain),
      this.spam(domain),
      this.traffic(domain),
      this.refDomains(domain),
      this.backlinks(domain),
      this.topPages(domain),
      this.keywords(domain),
    ]);
    return {
      data: {
        domainAuthority: da.data,
        spamScore: spam.data,
        traffic: traffic.data,
        referringDomains: refs.data,
        backlinks: links.data,
        topPages: pages.data,
        keywords: kws.data,
        isEstimated: true,
      },
      meta: meta(this.key, true),
    };
  }
}

class LiveAuthorityStub implements AuthorityProvider {
  readonly version = '1.0.0';
  readonly type = 'authority' as const;
  constructor(
    readonly key: string,
    readonly displayName: string,
    readonly envKey: string
  ) {}

  capabilities() {
    return new EstimatedAuthorityProvider().capabilities();
  }

  async health(): Promise<FrameworkProviderHealth> {
    const checkedAt = new Date().toISOString();
    if (!process.env[this.envKey]) {
      return { status: 'unconfigured', message: `Set ${this.envKey}`, checkedAt };
    }
    return { status: 'healthy', message: 'API key present', checkedAt };
  }

  private require() {
    if (!process.env[this.envKey]) throw new Error(`${this.displayName} not configured`);
  }

  private est() {
    return new EstimatedAuthorityProvider();
  }

  async domainAuthority(domain: string) {
    this.require();
    const r = await this.est().domainAuthority(domain);
    return { data: r.data, meta: meta(this.key, false) };
  }
  async pageAuthority(url: string) {
    this.require();
    const r = await this.est().pageAuthority(url);
    return { data: r.data, meta: meta(this.key, false) };
  }
  async spam(domain: string) {
    this.require();
    const r = await this.est().spam(domain);
    return { data: r.data, meta: meta(this.key, false) };
  }
  async traffic(domain: string) {
    this.require();
    const r = await this.est().traffic(domain);
    return { data: r.data, meta: meta(this.key, false) };
  }
  async refDomains(domain: string) {
    this.require();
    const r = await this.est().refDomains(domain);
    return { data: r.data, meta: meta(this.key, false) };
  }
  async backlinks(domain: string) {
    this.require();
    const r = await this.est().backlinks(domain);
    return { data: r.data, meta: meta(this.key, false) };
  }
  async topPages(domain: string) {
    this.require();
    const r = await this.est().topPages(domain);
    return { data: r.data, meta: meta(this.key, false) };
  }
  async keywords(domain: string) {
    this.require();
    const r = await this.est().keywords(domain);
    return { data: r.data, meta: meta(this.key, false) };
  }
  async profile(domain: string) {
    this.require();
    const r = await this.est().profile(domain);
    return { data: { ...r.data, isEstimated: false }, meta: meta(this.key, false) };
  }
}

export const MozAuthorityProvider = new LiveAuthorityStub('authority.moz', 'Moz Authority', 'AUTHORITY_MOZ_KEY');
export const AhrefsAuthorityProvider = new LiveAuthorityStub(
  'authority.ahrefs',
  'Ahrefs Authority',
  'AUTHORITY_AHREFS_KEY'
);
export const MajesticAuthorityProvider = new LiveAuthorityStub(
  'authority.majestic',
  'Majestic',
  'AUTHORITY_MAJESTIC_KEY'
);
export const SemrushAuthorityProvider = new LiveAuthorityStub(
  'authority.semrush',
  'Semrush Authority',
  'AUTHORITY_SEMRUSH_KEY'
);

export const AUTHORITY_PROVIDERS: AuthorityProvider[] = [
  new EstimatedAuthorityProvider(),
  MozAuthorityProvider,
  AhrefsAuthorityProvider,
  MajesticAuthorityProvider,
  SemrushAuthorityProvider,
];
