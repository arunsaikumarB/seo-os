import { normalizeText } from '../detect/dom-scanner';
import type { NormalizedField } from '../types';

/** Weighted confidence — Phase 1.1 */
export const WEIGHTS = {
  exactLabel: 60,
  placeholder: 25,
  nameAttr: 20,
  ariaLabel: 20,
  nearbyLabel: 15,
  sectionHeading: 10,
} as const;

export interface SignalScore {
  score: number;
  matchedBy: string[];
  matchedAlias: string;
}

function exactOrWord(signal: string, alias: string): 'exact' | 'word' | 'none' {
  if (!signal || !alias) return 'none';
  if (signal === alias) return 'exact';
  const re = new RegExp(`(?:^|\\s)${escapeReg(alias)}(?:\\s|$)`);
  if (re.test(signal)) return 'word';
  // name/id style: company_name contains company name tokens
  if (alias.length >= 4 && signal.includes(alias)) return 'word';
  return 'none';
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Score one field against one alias using weighted signal hits.
 * Cap at 100.
 */
export function scoreAliasAgainstField(field: NormalizedField, aliasRaw: string): SignalScore {
  const alias = normalizeText(aliasRaw);
  let score = 0;
  const matchedBy: string[] = [];

  const label = normalizeText(field.label);
  const placeholder = normalizeText(field.placeholder);
  const name = normalizeText(field.name);
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
  return hints.some((h) => exactOrWord(n, normalizeText(h)) !== 'none' || n.includes(normalizeText(h)));
}
