/** Heuristic domain analysis — Epic 2 Automation Engine */

import { categorizeDomain } from './import-engine.js';
import type { BacklinkTypeId } from './backlink-types.js';
import {
  classifyFromWebsiteInspection,
  extractWebsiteSignals,
  type ClassificationDecision,
  type LearningPattern,
  type WebsiteInspectionSignals,
} from './opportunity-classifier.js';

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
  metricsSource: 'estimated' | 'live';
  robotsTxtStatus?: string;
  sitemapFound?: boolean;
  fetchStatusCode?: number;
  /** Rich page-structure signals used by the classification engine */
  websiteSignals?: WebsiteInspectionSignals;
  /** Site-inspection classification (confidence + reason) */
  classificationDecision?: ClassificationDecision;
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

function buildDetectedPages(domain: string, _primaryType: string): DetectedPages {
  // Do not invent write-for-us / contribute URLs — qualification requires live confirmation.
  // Contact is a soft guess only; live fetch must set hasContactLink before it counts.
  return { contact: `https://${domain}/contact` };
}

const PUBLISHER_HINTS =
  /techradar|techspot|tomshardware|digitaltrends|theverge|wired|arstechnica|engadget|cnet|zdnet|pcmag|pcworld|androidauthority|xda|makeuseof|howtogeek|windowscentral|pcgamer|gamespot|ign/i;

function detectOpportunityTypes(domain: string, niche: string): BacklinkTypeId[] {
  const types: BacklinkTypeId[] = [];
  const category = categorizeDomain(domain);
  if (PUBLISHER_HINTS.test(domain) || niche === 'marketing') {
    types.push('news', 'guest_post', 'resource_page');
  } else {
    types.push(category as BacklinkTypeId);
  }

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
    metricsSource: 'estimated',
    metadata: { analyzedUrl: url ?? `https://${clean}`, analyzer: 'heuristic_v1' },
  };
}

/**
 * Prefer live fetch of homepage / robots.txt / sitemap when network is available.
 * Falls back to estimated analysis with metricsSource='estimated'.
 */
export async function analyzeDomainLive(
  domain: string,
  url?: string,
  fetchImpl: typeof fetch = fetch,
  opts: { learning?: LearningPattern[] } = {}
): Promise<DomainAnalysisResult> {
  const base = analyzeDomain(domain, url);
  const origin = `https://${base.domain}`;
  const meta = { ...base.metadata } as Record<string, unknown>;
  let robotsTxtStatus = 'unknown';
  let sitemapFound = false;
  let fetchStatusCode: number | undefined;
  let metricsSource: 'estimated' | 'live' = 'estimated';
  let websiteSignals: WebsiteInspectionSignals | undefined;
  let htmlRaw = '';

  try {
    const homeRes = await fetchImpl(url ?? origin, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'SEO-OS-BacklinkBuilder/1.0' },
    });
    fetchStatusCode = homeRes.status;
    if (homeRes.ok) {
      metricsSource = 'live';
      htmlRaw = await homeRes.text();
      const html = htmlRaw.slice(0, 120_000).toLowerCase();
      meta.homepageFetched = true;
      meta.hasContactLink =
        html.includes('contact') || html.includes('mailto:') || html.includes('/about');
      meta.hasGuestPostHint =
        html.includes('write for us') ||
        html.includes('guest post') ||
        html.includes('guest blog') ||
        html.includes('contribute') ||
        html.includes('submit a tip') ||
        html.includes('submit a story') ||
        html.includes('writer guidelines') ||
        html.includes('become a writer') ||
        html.includes('send us a tip');
      meta.hasGuidelines =
        html.includes('guideline') ||
        html.includes('editorial') ||
        html.includes('pitch') ||
        html.includes('submissions') ||
        html.includes('contributor');
      if (meta.hasGuestPostHint || meta.hasGuidelines) {
        meta.submissionPathConfirmed = true;
        base.detectedPages.guestPost = `${origin}/write-for-us`;
        base.detectedPages.submission = `${origin}/contribute`;
        base.detectedPages.resource = `${origin}/resources`;
        if (meta.hasGuestPostHint && base.primaryType === 'news') {
          base.primaryType = 'guest_post';
        }
      }
      if (html.includes('directory') || html.includes('submit listing') || html.includes('add business')) {
        meta.directoryPathConfirmed = true;
        base.detectedPages.directory = `${origin}/submit`;
      }
      if (html.includes('forum') || html.includes('community')) {
        meta.forumPathConfirmed = true;
        base.detectedPages.forum = `${origin}/forum`;
      }
      if (html.includes('question') || html.includes('answers') || html.includes('ask a question')) {
        meta.qaPathConfirmed = true;
        base.detectedPages.qa = `${origin}/questions`;
      }
    }
  } catch (err) {
    meta.homepageFetchError = err instanceof Error ? err.message : 'fetch_failed';
  }

  try {
    const robotsRes = await fetchImpl(`${origin}/robots.txt`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'SEO-OS-BacklinkBuilder/1.0' },
    });
    if (robotsRes.ok) {
      robotsTxtStatus = 'found';
      const robots = await robotsRes.text();
      meta.robotsTxtSnippet = robots.slice(0, 1000);
      if (/sitemap:\s*(\S+)/i.test(robots)) sitemapFound = true;
      metricsSource = 'live';
    } else {
      robotsTxtStatus = `http_${robotsRes.status}`;
    }
  } catch {
    robotsTxtStatus = 'unreachable';
  }

  if (!sitemapFound) {
    try {
      const sm = await fetchImpl(`${origin}/sitemap.xml`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'SEO-OS-BacklinkBuilder/1.0' },
      });
      if (sm.ok) {
        sitemapFound = true;
        metricsSource = 'live';
      }
    } catch {
      /* ignore */
    }
  }

  const fetchOk = Boolean(htmlRaw) && (fetchStatusCode == null || fetchStatusCode < 400);
  websiteSignals = extractWebsiteSignals(htmlRaw || '<html></html>', {
    robotsOk: robotsTxtStatus === 'found',
    sitemapFound,
    fetchOk,
  });
  meta.websiteSignals = {
    ...websiteSignals,
    rawSnippet: undefined,
  };

  const classificationDecision = classifyFromWebsiteInspection(websiteSignals, {
    learning: opts.learning,
    domain: base.domain,
    fallbackType: base.primaryType,
  });
  base.primaryType = classificationDecision.backlinkType;
  base.opportunityTypes = [
    classificationDecision.backlinkType,
    ...base.opportunityTypes.filter((t) => t !== classificationDecision.backlinkType),
  ].slice(0, 4) as BacklinkTypeId[];
  meta.classification = {
    id: classificationDecision.classificationId,
    displayName: classificationDecision.displayName,
    confidence: classificationDecision.confidence,
    reason: classificationDecision.reason,
    evidence: classificationDecision.evidence,
    workflowQueue: classificationDecision.workflowQueue,
    assignedAgent: classificationDecision.assignedAgent,
    alternatives: classificationDecision.alternatives,
  };

  return {
    ...base,
    metricsSource,
    robotsTxtStatus,
    sitemapFound,
    fetchStatusCode,
    websiteSignals,
    classificationDecision,
    metadata: {
      ...meta,
      analyzer: metricsSource === 'live' ? 'live_inspect_v2' : 'heuristic_v1',
      authorityNote: 'DR/traffic remain Estimated until a live SEO metrics provider is configured',
    },
  };
}
