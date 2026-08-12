import { normalizeText } from '../detect/dom-scanner';
import type { NormalizedField } from '../types';

/**
 * Weighted confidence — Phase 2.3
 * Domain knowledge applies +100 separately in the classifier.
 * Phase 2.3.1: primary path matches the resolved label only; resolver confidence wins.
 */
export const WEIGHTS = {
  exactLabel: 60,
  placeholder: 40,
  nameAttr: 35,
  idAttr: 30,
  ariaLabel: 25,
  nearbyLabel: 20,
  sectionHeading: 15,
  domainMapping: 100,
} as const;

export interface SignalScore {
  score: number;
  matchedBy: string[];
  matchedAlias: string;
}

function exactOrWord(signal: string, alias: string): 'exact' | 'word' | 'none' {
  if (!signal || !alias) return 'none';
  if (signal === alias) return 'exact';
  // Alias as a whole word inside the signal (e.g. "short description" contains "description").
  const re = new RegExp(`(?:^|\\s)${escapeReg(alias)}(?:\\s|$)`);
  if (re.test(signal)) return 'word';
  if (alias.length >= 4 && signal.includes(alias)) return 'word';
  // Do NOT match reverse includes (alias.includes(signal)) — "article" must not
  // hit title alias "article title", or META Description stays unmapped after demotion.
  return 'none';
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Phase 2.3.1 — match ONLY the resolved label against an alias.
 * Confidence is filled in by the classifier from labelResolverConfidence.
 */
export function scoreResolvedLabelAgainstAlias(
  resolvedLabel: string,
  aliasRaw: string
): SignalScore | null {
  const label = normalizeText(resolvedLabel);
  const alias = normalizeText(aliasRaw);
  if (!label || !alias) return null;
  const hit = exactOrWord(label, alias);
  if (hit === 'none') return null;
  return {
    score: hit === 'exact' ? 100 : 90,
    matchedBy: ['Resolved Label'],
    matchedAlias: aliasRaw,
  };
}

export function bestResolvedLabelScore(
  resolvedLabel: string,
  aliases: string[]
): SignalScore | null {
  let best: SignalScore | null = null;
  for (const alias of aliases) {
    const hit = scoreResolvedLabelAgainstAlias(resolvedLabel, alias);
    if (!hit) continue;
    if (!best || hit.score > best.score) best = hit;
  }
  return best;
}

/**
 * Legacy multi-signal scorer (kept for domain alias overlays / fallbacks).
 */
export function scoreAliasAgainstField(field: NormalizedField, aliasRaw: string): SignalScore {
  const alias = normalizeText(aliasRaw);
  let score = 0;
  const matchedBy: string[] = [];

  const label = normalizeText(field.label);
  const placeholder = normalizeText(field.placeholder);
  const name = normalizeText(field.name);
  const id = normalizeText(field.id);
  const aria = normalizeText(field.ariaLabel);
  const nearby = normalizeText(field.nearbyText);
  const heading = normalizeText(field.sectionHeading);

  const labelHit = exactOrWord(label, alias);
  if (labelHit === 'exact') {
    score += WEIGHTS.exactLabel;
    matchedBy.push('Label');
  } else if (labelHit === 'word') {
    score += Math.round(WEIGHTS.exactLabel * 0.85);
    matchedBy.push('Label');
  }

  if (exactOrWord(placeholder, alias) !== 'none') {
    score += WEIGHTS.placeholder;
    matchedBy.push('Placeholder');
  }
  if (exactOrWord(name, alias) !== 'none') {
    score += WEIGHTS.nameAttr;
    matchedBy.push('Name');
  }
  if (exactOrWord(id, alias) !== 'none') {
    score += WEIGHTS.idAttr;
    matchedBy.push('ID');
  }
  if (exactOrWord(aria, alias) !== 'none') {
    score += WEIGHTS.ariaLabel;
    matchedBy.push('Aria-label');
  }
  if (exactOrWord(nearby, alias) !== 'none') {
    score += WEIGHTS.nearbyLabel;
    matchedBy.push('Nearby');
  }
  if (exactOrWord(heading, alias) !== 'none') {
    score += WEIGHTS.sectionHeading;
    matchedBy.push('Section');
  }

  return {
    score: Math.min(100, score),
    matchedBy: [...new Set(matchedBy)],
    matchedAlias: aliasRaw,
  };
}

export function bestAliasScore(
  field: NormalizedField,
  aliases: string[]
): SignalScore | null {
  let best: SignalScore | null = null;
  for (const alias of aliases) {
    const hit = scoreAliasAgainstField(field, alias);
    if (!best || hit.score > best.score) best = hit;
  }
  return best && best.score > 0 ? best : null;
}

export function blobHasHint(blob: string, hints: string[]): boolean {
  const n = normalizeText(blob);
  return hints.some(
    (h) => exactOrWord(n, normalizeText(h)) !== 'none' || n.includes(normalizeText(h))
  );
}

/** Normalize a DOM field key for domain knowledge lookup */
export function fieldKnowledgeKey(field: NormalizedField): string[] {
  const keys = [
    field.name,
    field.id,
    field.label,
    field.rawLabel,
    field.ariaLabel,
    field.placeholder,
  ]
    .map((s) =>
      String(s ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
    )
    .filter(Boolean);
  return [...new Set(keys)];
}
