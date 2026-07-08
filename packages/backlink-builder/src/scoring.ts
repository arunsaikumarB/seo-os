import type { BacklinkTypeId } from './backlink-types.js';

export interface ScoringInput {
  type: string;
  title: string;
  domain?: string;
  url?: string;
  da?: number;
  relevance?: number;
}

const TYPE_WEIGHTS: Record<string, number> = {
  guest_post: 15,
  edu: 18,
  gov: 20,
  news: 14,
  resource_page: 12,
  broken_link: 11,
  digital_pr: 13,
  niche_edit: 12,
  podcast: 10,
  directory: 8,
  citation: 7,
  qa_site: 7,
  forum: 6,
  partnership: 11,
  press_release: 9,
  brand_mention: 10,
};

export function scoreBacklinkOpportunity(input: ScoringInput): number {
  let score = 50;
  score += TYPE_WEIGHTS[input.type] ?? 6;
  if (input.domain) score += 5;
  if (input.url) score += 3;
  if (input.da && input.da >= 50) score += Math.min(15, Math.floor(input.da / 10));
  if (input.relevance) score += Math.min(10, input.relevance);
  return Math.min(100, Math.max(0, Math.round(score)));
}

export function getScoreTier(score: number): 'high' | 'medium' | 'low' {
  if (score >= 75) return 'high';
  if (score >= 55) return 'medium';
  return 'low';
}

export function buildAiSuggestion(opp: {
  score: number;
  opportunity_type: string;
  title: string;
}): string {
  const tier = getScoreTier(Number(opp.score));
  const type = opp.opportunity_type.replace(/_/g, ' ');
  if (tier === 'high') {
    return `Strong ${type} fit — approve and add to campaign. High authority match for "${opp.title}".`;
  }
  if (tier === 'medium') {
    return `Moderate ${type} opportunity — review relevance before approving.`;
  }
  return `Low priority ${type} — consider deprioritizing unless strategic.`;
}

export function suggestBacklinkTypes(context: {
  industry?: string;
  existingTypes?: string[];
}): BacklinkTypeId[] {
  const base: BacklinkTypeId[] = ['guest_post', 'resource_page', 'broken_link', 'directory'];
  if (context.industry?.toLowerCase().includes('saas')) {
    return [...base, 'digital_pr', 'podcast', 'qa_site'];
  }
  if (context.industry?.toLowerCase().includes('local')) {
    return [...base, 'citation', 'directory', 'testimonial'];
  }
  return base;
}
