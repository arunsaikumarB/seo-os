import type { SearchIntent } from './website-analyzer.js';

export interface KeywordCandidate {
  keyword: string;
  intent: SearchIntent;
  topicGroup: string;
  priorityScore: number;
}

const INTENT_PATTERNS: Array<{ pattern: RegExp; intent: SearchIntent }> = [
  { pattern: /\b(buy|price|cost|cheap|deal)\b/i, intent: 'transactional' },
  { pattern: /\b(best|top|review|vs|compare)\b/i, intent: 'commercial' },
  { pattern: /\b(how to|what is|guide|tutorial|learn)\b/i, intent: 'informational' },
  { pattern: /\b(login|sign in|official|website)\b/i, intent: 'navigational' },
];

export function classifyIntent(keyword: string): SearchIntent {
  for (const { pattern, intent } of INTENT_PATTERNS) {
    if (pattern.test(keyword)) return intent;
  }
  return 'informational';
}

export function clusterKeywords(keywords: string[]): Map<string, string[]> {
  const clusters = new Map<string, string[]>();
  for (const kw of keywords) {
    const words = kw.toLowerCase().split(/\s+/);
    const key = words.slice(0, Math.min(2, words.length)).join(' ') || 'general';
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key)!.push(kw);
  }
  return clusters;
}

export function scoreKeywordPriority(keyword: string, intent: SearchIntent): number {
  let score = 40;
  const wordCount = keyword.split(/\s+/).length;
  if (wordCount >= 3 && wordCount <= 5) score += 15;
  if (intent === 'commercial') score += 20;
  if (intent === 'transactional') score += 15;
  if (intent === 'informational') score += 10;
  return Math.min(100, score);
}

export function parseKeywordsFromAiResponse(text: string): KeywordCandidate[] {
  const lines = text.split('\n').map((l) => l.replace(/^[-*\d.]+\s*/, '').trim()).filter(Boolean);
  return lines.slice(0, 30).map((keyword) => {
    const intent = classifyIntent(keyword);
    const topicGroup = keyword.toLowerCase().split(/\s+/).slice(0, 2).join(' ');
    return {
      keyword,
      intent,
      topicGroup,
      priorityScore: scoreKeywordPriority(keyword, intent),
    };
  });
}

export function defaultKeywordDiscovery(context: {
  domain: string;
  industry?: string;
  brandTopics?: string[];
}): KeywordCandidate[] {
  const base = context.industry ?? context.domain.split('.')[0];
  const seeds = [
    `${base} services`,
    `best ${base} tools`,
    `how to improve ${base}`,
    `${base} strategy`,
    `${base} vs competitors`,
    `${base} guide`,
  ];
  if (context.brandTopics?.length) {
    seeds.push(...context.brandTopics.slice(0, 4).map((t) => `${t} tips`));
  }
  return seeds.map((keyword) => {
    const intent = classifyIntent(keyword);
    return {
      keyword,
      intent,
      topicGroup: keyword.split(' ').slice(0, 2).join(' '),
      priorityScore: scoreKeywordPriority(keyword, intent),
    };
  });
}
