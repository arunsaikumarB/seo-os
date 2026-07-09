import type { OpportunityType } from './website-analyzer.js';

export interface OpportunityInput {
  type: OpportunityType;
  title: string;
  url?: string;
  domain?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}

/** Opportunity scoring model — Sprint 4 foundation */
export function scoreOpportunity(
  input: OpportunityInput,
  context: {
    brandTopics?: string[];
    keywordOverlap?: number;
    competitorOverlap?: boolean;
  }
): number {
  let score = 50;

  const typeWeights: Record<OpportunityType, number> = {
    guest_post: 15,
    resource_page: 12,
    broken_link: 10,
    directory: 8,
    qa_site: 7,
    forum: 6,
    podcast: 9,
    partnership: 11,
  };
  score += typeWeights[input.type] ?? 0;

  if (input.domain) score += 5;
  if (input.url) score += 3;
  if (context.keywordOverlap && context.keywordOverlap > 0) {
    score += Math.min(15, context.keywordOverlap * 3);
  }
  if (context.competitorOverlap) score += 8;
  if (context.brandTopics?.some((t) => input.title.toLowerCase().includes(t.toLowerCase()))) {
    score += 10;
  }

  return Math.min(100, Math.max(0, Math.round(score * 100) / 100));
}

export function classifyOpportunityFromText(text: string): OpportunityType {
  const lower = text.toLowerCase();
  if (lower.includes('guest post') || lower.includes('write for us')) return 'guest_post';
  if (lower.includes('resource') || lower.includes('links')) return 'resource_page';
  if (lower.includes('broken link')) return 'broken_link';
  if (lower.includes('directory')) return 'directory';
  if (lower.includes('reddit') || lower.includes('quora')) return 'qa_site';
  if (lower.includes('forum')) return 'forum';
  if (lower.includes('podcast')) return 'podcast';
  if (lower.includes('partner')) return 'partnership';
  return 'guest_post';
}
