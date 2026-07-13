/** Project-scoped keyword discovery — volumes/KD labeled Estimated */

export interface KeywordRecord {
  keyword: string;
  type: 'primary' | 'related' | 'long_tail' | 'semantic' | 'question' | 'location';
  estimatedVolume: number;
  estimatedDifficulty: number;
  estimatedCompetition: number;
  estimatedIntent: 'informational' | 'commercial' | 'transactional' | 'navigational';
  topicCluster: string;
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

const QUESTION_PREFIXES = ['what is', 'how to', 'why', 'which', 'where to find'];
const LOCATION_SUFFIXES = ['near me', 'in usa', 'in uk', 'local', 'city guide'];

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

function intentFor(type: KeywordRecord['type'], keyword: string): KeywordRecord['estimatedIntent'] {
  if (type === 'question') return 'informational';
  if (keyword.includes('buy') || keyword.includes('pricing')) return 'transactional';
  if (keyword.includes('best') || keyword.includes('vs')) return 'commercial';
  if (type === 'location') return 'commercial';
  return 'informational';
}

export function discoverKeywordCandidates(
  primaryKeywords: string[],
  industry?: string
): KeywordRecord[] {
  const out: KeywordRecord[] = [];
  const seen = new Set<string>();

  const add = (keyword: string, type: KeywordRecord['type'], cluster: string) => {
    const k = keyword.trim().toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    const h = hash(k);
    const estimatedDifficulty = 15 + (h % 70);
    out.push({
      keyword: k,
      type,
      estimatedVolume: 50 + (h % 9500),
      estimatedDifficulty,
      estimatedCompetition: Math.min(95, estimatedDifficulty + (h % 15)),
      estimatedIntent: intentFor(type, k),
      topicCluster: cluster,
      metricsSource: 'estimated',
    });
  };

  for (const primary of primaryKeywords) {
    const cluster = primary.toLowerCase().split(/\s+/)[0] ?? 'general';
    add(primary, 'primary', cluster);
    for (const mod of MODIFIERS) {
      add(`${mod} ${primary}`, 'related', cluster);
      add(`${primary} ${mod}`, 'long_tail', cluster);
    }
    for (const q of QUESTION_PREFIXES) add(`${q} ${primary}`, 'question', cluster);
    for (const loc of LOCATION_SUFFIXES) add(`${primary} ${loc}`, 'location', cluster);
    const semanticKey = Object.keys(SEMANTIC_MAP).find((k) => primary.toLowerCase().includes(k));
    if (semanticKey) {
      for (const s of SEMANTIC_MAP[semanticKey]) add(s, 'semantic', cluster);
    }
  }

  if (industry) {
    add(`${industry} guide`, 'related', industry);
    add(`best ${industry} tools`, 'long_tail', industry);
    add(`what is ${industry}`, 'question', industry);
    add(`${industry} near me`, 'location', industry);
    for (const s of SEMANTIC_MAP[industry.toLowerCase()] ?? []) add(s, 'semantic', industry);
  }

  return out.slice(0, 60);
}

export function clusterKeywordsByTopic(records: KeywordRecord[]): Map<string, KeywordRecord[]> {
  const map = new Map<string, KeywordRecord[]>();
  for (const r of records) {
    const list = map.get(r.topicCluster) ?? [];
    list.push(r);
    map.set(r.topicCluster, list);
  }
  return map;
}
