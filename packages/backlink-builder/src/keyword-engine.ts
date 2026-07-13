/** Project-scoped keyword discovery — volumes/KD labeled Estimated */

export interface KeywordRecord {
  keyword: string;
  type: 'primary' | 'related' | 'long_tail' | 'semantic';
  estimatedVolume: number;
  estimatedDifficulty: number;
  metricsSource: 'estimated' | 'user';
}

const MODIFIERS = [
  'best',
  'top',
  'guide',
  'how to',
  'vs',
  'near me',
  'software',
  'tools',
  'services',
  'examples',
  'checklist',
  'template',
];

const SEMANTIC_MAP: Record<string, string[]> = {
  seo: ['search engine optimization', 'organic traffic', 'serp ranking', 'backlinks'],
  marketing: ['digital marketing', 'content marketing', 'lead generation', 'brand awareness'],
  saas: ['software as a service', 'cloud software', 'b2b software', 'subscription software'],
  health: ['wellness', 'medical advice', 'healthcare', 'fitness'],
  finance: ['personal finance', 'investing', 'fintech', 'wealth management'],
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function discoverKeywordCandidates(
  primaryKeywords: string[],
  industry?: string
): KeywordRecord[] {
  const out: KeywordRecord[] = [];
  const seen = new Set<string>();

  const add = (keyword: string, type: KeywordRecord['type']) => {
    const k = keyword.trim().toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    const h = hash(k);
    out.push({
      keyword: k,
      type,
      estimatedVolume: 50 + (h % 9500),
      estimatedDifficulty: 15 + (h % 70),
      metricsSource: 'estimated',
    });
  };

  for (const primary of primaryKeywords) {
    add(primary, 'primary');
    for (const mod of MODIFIERS) {
      add(`${mod} ${primary}`, 'related');
      add(`${primary} ${mod}`, 'long_tail');
    }
    const semanticKey = Object.keys(SEMANTIC_MAP).find((k) => primary.toLowerCase().includes(k));
    if (semanticKey) {
      for (const s of SEMANTIC_MAP[semanticKey]) add(s, 'semantic');
    }
  }

  if (industry) {
    add(`${industry} guide`, 'related');
    add(`best ${industry} tools`, 'long_tail');
    for (const s of SEMANTIC_MAP[industry.toLowerCase()] ?? []) add(s, 'semantic');
  }

  return out.slice(0, 40);
}
