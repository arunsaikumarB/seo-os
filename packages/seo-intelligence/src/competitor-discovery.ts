export interface CompetitorSuggestion {
  domain: string;
  name?: string;
  confidenceScore: number;
  reason: string;
}

export function scoreCompetitorConfidence(input: {
  domain: string;
  industryMatch?: boolean;
  keywordOverlap?: number;
  aiConfidence?: number;
}): number {
  let score = input.aiConfidence ?? 60;
  if (input.industryMatch) score += 15;
  if (input.keywordOverlap) score += Math.min(20, input.keywordOverlap * 5);
  if (input.domain.includes('.')) score += 5;
  return Math.min(100, Math.max(0, Math.round(score * 100) / 100));
}

export function parseCompetitorsFromAiResponse(text: string): CompetitorSuggestion[] {
  const results: CompetitorSuggestion[] = [];
  const lines = text.split('\n').filter(Boolean);
  for (const line of lines) {
    const domainMatch = line.match(/([a-z0-9][-a-z0-9]*\.[a-z]{2,})/i);
    if (!domainMatch) continue;
    results.push({
      domain: domainMatch[1].toLowerCase(),
      name: line.replace(domainMatch[0], '').replace(/^[-*:]\s*/, '').trim() || undefined,
      confidenceScore: 70,
      reason: line.trim(),
    });
  }
  return results.slice(0, 10);
}

export function defaultCompetitorSuggestions(context: {
  domain: string;
  industry?: string;
}): CompetitorSuggestion[] {
  const base = context.domain.replace(/^www\./, '').split('.')[0];
  const suffixes = ['hub', 'pro', 'tools', 'app', 'io'];
  return suffixes.map((s, i) => ({
    domain: `${base}-${s}.com`,
    name: `${base} ${s}`,
    confidenceScore: 45 + i * 5,
    reason: `Heuristic competitor suggestion based on domain pattern (${context.industry ?? 'general'})`,
  }));
}
