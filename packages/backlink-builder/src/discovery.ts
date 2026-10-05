/** AI Discover Websites — curated + keyword-scored candidates (no placeholder domains) */

import { analyzeDomain } from './domain-analyzer.js';
import { classifyOpportunity, type ClassificationContext } from './classification.js';
import type { BacklinkTypeId } from './backlink-types.js';
import { DIRECTORY_CITATION_SOURCES } from './data/directory-citation-sources.js';

export interface DiscoverInputs {
  website?: string;
  industry?: string;
  country?: string;
  keywords?: string[];
  targetDr?: number;
  targetTraffic?: number;
}

export interface DiscoveryCandidate {
  domain: string;
  url: string;
  title: string;
  opportunityType: BacklinkTypeId;
  score: number;
  relevanceScore: number;
  spamRisk: number;
  successProbability: number;
  difficulty: number;
  priority: string;
  /** Null when no real authority metric is available. Never a hashed stand-in. */
  domainRating: number | null;
  monthlyTraffic: number | null;
  country: string;
  niche: string;
  metricsSource: 'estimated' | 'unknown';
  authorityEstimated: boolean;
  trafficEstimated: boolean;
  discoverySource: 'ai_discover';
  recommendedAction: string;
  matchReasons: string[];
}

/** Real publisher / directory / community domains used as discovery seeds */
const SEED_SITES: Array<{
  domain: string;
  types: BacklinkTypeId[];
  niches: string[];
  countries?: string[];
}> = [
  { domain: 'medium.com', types: ['guest_post'], niches: ['technology', 'marketing', 'general', 'finance', 'health'] },
  { domain: 'dev.to', types: ['guest_post', 'resource_page'], niches: ['technology'] },
  { domain: 'hashnode.com', types: ['guest_post'], niches: ['technology'] },
  { domain: 'linkedin.com', types: ['profile', 'guest_post'], niches: ['marketing', 'technology', 'finance', 'general'] },
  { domain: 'reddit.com', types: ['forum', 'qa_site'], niches: ['technology', 'marketing', 'food', 'health', 'finance', 'general'] },
  { domain: 'quora.com', types: ['qa_site'], niches: ['technology', 'marketing', 'health', 'finance', 'education', 'general'] },
  { domain: 'producthunt.com', types: ['directory', 'profile'], niches: ['technology', 'marketing'] },
  { domain: 'crunchbase.com', types: ['directory', 'profile'], niches: ['technology', 'finance'] },
  { domain: 'g2.com', types: ['directory', 'profile'], niches: ['technology', 'marketing'] },
  { domain: 'capterra.com', types: ['directory'], niches: ['technology', 'marketing'] },
  { domain: 'clutch.co', types: ['directory'], niches: ['technology', 'marketing'] },
  { domain: 'trustpilot.com', types: ['profile', 'citation'], niches: ['general', 'marketing', 'finance'] },
  { domain: 'yelp.com', types: ['citation', 'directory'], niches: ['food', 'health', 'general'] },
  { domain: 'tripadvisor.com', types: ['citation'], niches: ['food', 'general'] },
  { domain: 'forbes.com', types: ['guest_post', 'digital_pr'], niches: ['finance', 'marketing', 'technology'] },
  { domain: 'entrepreneur.com', types: ['guest_post', 'digital_pr'], niches: ['marketing', 'finance', 'technology'] },
  { domain: 'businessinsider.com', types: ['digital_pr', 'guest_post'], niches: ['finance', 'technology', 'marketing'] },
  { domain: 'techcrunch.com', types: ['digital_pr', 'guest_post'], niches: ['technology'] },
  { domain: 'smashingmagazine.com', types: ['guest_post', 'resource_page'], niches: ['technology', 'marketing'] },
  { domain: 'css-tricks.com', types: ['guest_post', 'resource_page'], niches: ['technology'] },
  { domain: 'moz.com', types: ['guest_post', 'resource_page'], niches: ['marketing'] },
  { domain: 'searchengineland.com', types: ['guest_post', 'resource_page'], niches: ['marketing'] },
  { domain: 'ahrefs.com', types: ['resource_page', 'guest_post'], niches: ['marketing'] },
  { domain: 'hubspot.com', types: ['guest_post', 'resource_page'], niches: ['marketing'] },
  { domain: 'neilpatel.com', types: ['guest_post', 'resource_page'], niches: ['marketing'] },
  { domain: 'healthline.com', types: ['guest_post', 'resource_page'], niches: ['health'] },
  { domain: 'webmd.com', types: ['resource_page'], niches: ['health'] },
  { domain: 'investopedia.com', types: ['guest_post', 'resource_page'], niches: ['finance'] },
  { domain: 'nerdwallet.com', types: ['guest_post', 'resource_page'], niches: ['finance'] },
  { domain: 'allrecipes.com', types: ['guest_post', 'resource_page'], niches: ['food'] },
  { domain: 'seriouseats.com', types: ['guest_post', 'resource_page'], niches: ['food'] },
  { domain: 'edutopia.org', types: ['guest_post', 'resource_page'], niches: ['education'] },
  { domain: 'chronicle.com', types: ['guest_post'], niches: ['education'] },
  { domain: 'stackexchange.com', types: ['qa_site'], niches: ['technology', 'education'] },
  { domain: 'github.com', types: ['profile', 'resource_page'], niches: ['technology'] },
  { domain: 'dribbble.com', types: ['profile', 'directory'], niches: ['marketing', 'technology'] },
  { domain: 'behance.net', types: ['profile', 'directory'], niches: ['marketing', 'technology'] },
  { domain: 'angieslist.com', types: ['directory', 'citation'], niches: ['general', 'health'] },
  { domain: 'bbb.org', types: ['citation', 'directory'], niches: ['general', 'finance'] },
  { domain: 'wikipedia.org', types: ['resource_page'], niches: ['general', 'education', 'technology', 'health'] },
  { domain: 'outbrain.com', types: ['digital_pr'], niches: ['marketing', 'general'] },
  { domain: 'prnewswire.com', types: ['press_release', 'digital_pr'], niches: ['marketing', 'finance', 'technology', 'general'] },
  { domain: 'businesswire.com', types: ['press_release'], niches: ['finance', 'technology', 'general'] },
  { domain: 'guestposttracker.com', types: ['directory', 'guest_post'], niches: ['marketing', 'general'] },
  { domain: 'haro.com', types: ['digital_pr'], niches: ['marketing', 'general'] },
];

function slugifyKeyword(kw: string): string {
  return kw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

/**
 * Build keyword-aligned discovery URLs on real platforms (not invented TLDs).
 * Example: medium.com/tag/seo → still medium.com as domain for opportunity.
 */
function keywordPlatformHints(keywords: string[]): Array<{ domain: string; path: string; niches: string[] }> {
  const hints: Array<{ domain: string; path: string; niches: string[] }> = [];
  for (const kw of keywords.slice(0, 8)) {
    const slug = slugifyKeyword(kw);
    if (!slug) continue;
    hints.push(
      { domain: 'medium.com', path: `/tag/${slug}`, niches: ['general', 'marketing', 'technology'] },
      { domain: 'dev.to', path: `/t/${slug}`, niches: ['technology'] },
      { domain: 'reddit.com', path: `/r/${slug.replace(/-/g, '')}`, niches: ['general'] },
      { domain: 'quora.com', path: `/search?q=${encodeURIComponent(kw)}`, niches: ['general'] }
    );
  }
  return hints;
}

export function discoverWebsiteCandidates(
  inputs: DiscoverInputs,
  ctx: ClassificationContext = {},
  limit = 25
): DiscoveryCandidate[] {
  const industry = (inputs.industry ?? ctx.projectIndustry ?? 'general').toLowerCase();
  const keywords = (inputs.keywords ?? []).map((k) => k.trim().toLowerCase()).filter(Boolean);
  const country = (inputs.country ?? 'US').toUpperCase();
  const targetDr = inputs.targetDr ?? 0;
  const targetTraffic = inputs.targetTraffic ?? 0;

  const seedDomains = new Map<string, { types: BacklinkTypeId[]; niches: string[]; matchReasons: string[] }>();

  for (const seed of SEED_SITES) {
    // Directory and citation homepages are not submission pages. Those types
    // come only from DIRECTORY_CITATION_SOURCES (real submit URLs, unknown metrics).
    const types = seed.types.filter((t) => t !== 'directory' && t !== 'citation');
    if (types.length === 0) continue;
    const reasons: string[] = [];
    const nicheHit =
      seed.niches.includes(industry) ||
      seed.niches.includes('general') ||
      keywords.some((k) => seed.niches.some((n) => n.includes(k) || k.includes(n)));
    if (nicheHit) reasons.push(`niche:${industry}`);
    if (keywords.some((k) => seed.domain.includes(k.replace(/\s+/g, '')))) {
      reasons.push('keyword-in-domain');
    }
    if (reasons.length === 0 && seed.niches.includes('general')) {
      reasons.push('general-catalog');
    }
    if (reasons.length === 0) continue;
    seedDomains.set(seed.domain, { types, niches: seed.niches, matchReasons: reasons });
  }

  for (const hint of keywordPlatformHints(keywords)) {
    const existing = seedDomains.get(hint.domain);
    if (existing) {
      existing.matchReasons.push(`keyword-path:${hint.path}`);
    }
  }

  const candidates: DiscoveryCandidate[] = [];

  for (const [domain, meta] of seedDomains) {
    const analysis = analyzeDomain(domain, `https://${domain}`);
    // Do not drop or rank seeds with a hashed domain rating. It was never measured.

    const primaryType = meta.types[0] ?? analysis.primaryType;
    const typedAnalysis = { ...analysis, primaryType, opportunityTypes: meta.types };
    const classification = classifyOpportunity(typedAnalysis, {
      ...ctx,
      projectIndustry: industry,
    });

    let relevanceBoost = 0;
    if (meta.niches.includes(industry)) relevanceBoost += 12;
    if (keywords.length) {
      const hay = `${domain} ${meta.niches.join(' ')}`.toLowerCase();
      if (keywords.some((k) => hay.includes(k))) relevanceBoost += 10;
    }
    if (analysis.country === country) relevanceBoost += 5;

    const relevanceScore = Math.min(100, classification.relevanceScore + relevanceBoost);

    candidates.push({
      domain,
      url: `https://${domain}`,
      title: analysis.websiteName,
      opportunityType: primaryType,
      score: classification.opportunityScore,
      relevanceScore,
      spamRisk: classification.spamRisk,
      successProbability: 0,
      difficulty: 0,
      priority: classification.priority,
      domainRating: null,
      monthlyTraffic: null,
      country: analysis.country,
      niche: analysis.niche,
      metricsSource: 'unknown',
      authorityEstimated: false,
      trafficEstimated: false,
      discoverySource: 'ai_discover',
      recommendedAction:
        'Homepage seed only. Scan the URL before any submit or outreach. Authority and traffic were not measured.',
      matchReasons: [
        ...meta.matchReasons,
        'metrics:unknown',
        'homepage-seed-not-a-submission-page',
        ...(targetDr > 0 || targetTraffic > 0 ? ['requested DR or traffic was not measured'] : []),
      ],
    });
  }

  const curated: DiscoveryCandidate[] = DIRECTORY_CITATION_SOURCES.map((src) => ({
    domain: src.domain,
    url: src.url,
    title: src.title,
    opportunityType: src.kind,
    score: 60,
    relevanceScore: 72,
    spamRisk: 20,
    successProbability: 0,
    difficulty: 0,
    priority: 'medium',
    domainRating: null,
    monthlyTraffic: null,
    country,
    niche: industry,
    metricsSource: 'unknown',
    authorityEstimated: false,
    trafficEstimated: false,
    discoverySource: 'ai_discover',
    recommendedAction: `Open the free ${src.kind} form. Pause if a human gate appears. Do not treat metrics as live.`,
    matchReasons: ['curated-submit-url', `kind:${src.kind}`, 'metrics:unknown'],
  }));

  const seen = new Set<string>();
  const merged: DiscoveryCandidate[] = [];
  for (const candidate of [...curated, ...candidates]) {
    if (seen.has(candidate.domain)) continue;
    seen.add(candidate.domain);
    merged.push(candidate);
  }
  return merged.slice(0, Math.max(limit, curated.length));
}
