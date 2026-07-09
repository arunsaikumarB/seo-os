/** Heuristic domain analysis — Epic 2 Automation Engine */

import { categorizeDomain } from './import-engine.js';
import type { BacklinkTypeId } from './backlink-types.js';

export interface DetectedPages {
  contact?: string;
  submission?: string;
  guestPost?: string;
  resource?: string;
  directory?: string;
  forum?: string;
  qa?: string;
}

export interface DomainAnalysisResult {
  domain: string;
  websiteName: string;
  niche: string;
  language: string;
  country: string;
  domainRating: number;
  monthlyTraffic: number;
  detectedPages: DetectedPages;
  opportunityTypes: BacklinkTypeId[];
  primaryType: BacklinkTypeId;
  metadata: Record<string, unknown>;
}

const TLD_COUNTRY: Record<string, string> = {
  uk: 'GB',
  de: 'DE',
  fr: 'FR',
  au: 'AU',
  ca: 'CA',
  in: 'IN',
  jp: 'JP',
};

const NICHE_KEYWORDS: Record<string, string[]> = {
  technology: ['tech', 'software', 'dev', 'code', 'digital', 'saas', 'cloud', 'ai'],
  food: ['food', 'recipe', 'cook', 'chef', 'restaurant', 'culinary', 'kitchen'],
  health: ['health', 'medical', 'wellness', 'fitness', 'doctor', 'clinic'],
  finance: ['finance', 'money', 'invest', 'bank', 'crypto', 'trading'],
  marketing: ['marketing', 'seo', 'advertis', 'brand', 'media', 'pr'],
  education: ['edu', 'learn', 'school', 'university', 'academic', 'course'],
};

function hashDomain(domain: string): number {
  let h = 0;
  for (let i = 0; i < domain.length; i++) h = (h * 31 + domain.charCodeAt(i)) >>> 0;
  return h;
}

function detectNiche(domain: string): string {
  const d = domain.toLowerCase();
  for (const [niche, keywords] of Object.entries(NICHE_KEYWORDS)) {
    if (keywords.some((k) => d.includes(k))) return niche;
  }
  return 'general';
}

function detectCountry(domain: string): string {
  const tld = domain.split('.').pop()?.toLowerCase() ?? '';
  return TLD_COUNTRY[tld] ?? 'US';
}

function estimateDr(domain: string): number {
  const h = hashDomain(domain);
  const base = 15 + (h % 55);
  if (domain.endsWith('.edu')) return Math.min(85, base + 25);
  if (domain.endsWith('.gov')) return Math.min(90, base + 30);
  if (domain.endsWith('.org')) return Math.min(75, base + 10);
  return base;
}

function estimateTraffic(domain: string): number {
  const dr = estimateDr(domain);
  return Math.round((dr / 100) * 50000 + (hashDomain(domain + 't') % 20000));
}

function buildDetectedPages(domain: string, primaryType: string): DetectedPages {
  const base = `https://${domain}`;
  const pages: DetectedPages = { contact: `${base}/contact` };
  if (primaryType === 'guest_post' || primaryType === 'resource_page') {
    pages.guestPost = `${base}/write-for-us`;
    pages.submission = `${base}/contribute`;
    pages.resource = `${base}/resources`;
  }
  if (primaryType === 'directory') pages.directory = `${base}/submit`;
  if (primaryType === 'forum') pages.forum = `${base}/forum`;
  if (primaryType === 'qa_site') pages.qa = `${base}/questions`;
  return pages;
}

function detectOpportunityTypes(domain: string, niche: string): BacklinkTypeId[] {
  const types: BacklinkTypeId[] = [];
  const category = categorizeDomain(domain);
  types.push(category as BacklinkTypeId);

  if (niche === 'marketing') types.push('guest_post', 'resource_page', 'digital_pr');
  if (niche === 'technology') types.push('guest_post', 'broken_link', 'resource_page');
  if (niche === 'food') types.push('guest_post', 'directory', 'partnership');
  if (domain.endsWith('.edu')) types.push('edu');
  if (domain.endsWith('.gov')) types.push('gov');

  return [...new Set(types)].slice(0, 4) as BacklinkTypeId[];
}

export function analyzeDomain(domain: string, url?: string): DomainAnalysisResult {
  const clean = domain.replace(/^www\./, '').toLowerCase();
  const niche = detectNiche(clean);
  const primaryCategory = categorizeDomain(clean);
  const opportunityTypes = detectOpportunityTypes(clean, niche);
  const primaryType = opportunityTypes[0] ?? 'resource_page';

  const parts = clean.split('.');
  const websiteName = parts[0].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    domain: clean,
    websiteName,
    niche,
    language: 'en',
    country: detectCountry(clean),
    domainRating: estimateDr(clean),
    monthlyTraffic: estimateTraffic(clean),
    detectedPages: buildDetectedPages(clean, primaryCategory),
    opportunityTypes,
    primaryType,
    metadata: { analyzedUrl: url ?? `https://${clean}`, analyzer: 'heuristic_v1' },
  };
}
