import { FIELD_ALIASES, mergeAliases, type AliasDictionary } from './aliases';
import type {
  DetectedField,
  DomainLearningHook,
  FieldMatch,
  FieldRole,
  MatchConfidence,
} from '../types';

export interface MatchOptions {
  aliases?: AliasDictionary;
  /** Phase 2 hook — domain-specific alias overlays */
  domainLearning?: DomainLearningHook;
  hostname?: string;
  /** Only treat high (and optionally medium) as fillable */
  minConfidence?: MatchConfidence;
}

const CONFIDENCE_RANK: Record<MatchConfidence, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

function scoreAlias(signal: string, alias: string): MatchConfidence {
  if (!signal || !alias) return 'none';
  if (signal === alias) return 'high';
  // Token boundary / whole-word style
  const re = new RegExp(`(?:^|\\s)${escapeReg(alias)}(?:\\s|$)`);
  if (re.test(signal)) return 'high';
  if (signal.includes(alias) && alias.length >= 3) {
    // Prefer longer aliases for medium
    return alias.length >= 5 ? 'medium' : 'low';
  }
  return 'none';
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function bestRoleForField(
  field: DetectedField,
  aliases: AliasDictionary
): { role: FieldRole; confidence: MatchConfidence; matchedAlias: string | null; reason: string } {
  let best: {
    role: FieldRole;
    confidence: MatchConfidence;
    matchedAlias: string | null;
    reason: string;
  } = { role: 'unknown', confidence: 'none', matchedAlias: null, reason: 'no alias hit' };

  // Type-based boosts
  if (field.type === 'email') {
    return {
      role: 'email',
      confidence: 'high',
      matchedAlias: 'type=email',
      reason: 'input type=email',
    };
  }
  if (field.type === 'tel') {
    return {
      role: 'phone',
      confidence: 'high',
      matchedAlias: 'type=tel',
      reason: 'input type=tel',
    };
  }
  if (field.type === 'url') {
    return {
      role: 'website',
      confidence: 'high',
      matchedAlias: 'type=url',
      reason: 'input type=url',
    };
  }

  for (const [role, list] of Object.entries(aliases) as Array<
    [Exclude<FieldRole, 'unknown'>, string[]]
  >) {
    for (const alias of list) {
      for (const signal of field.signals) {
        const conf = scoreAlias(signal, alias);
        if (CONFIDENCE_RANK[conf] > CONFIDENCE_RANK[best.confidence]) {
          best = {
            role,
            confidence: conf,
            matchedAlias: alias,
            reason: `alias "${alias}" in signal "${signal}"`,
          };
        }
      }
    }
  }

  return best;
}

/**
 * Match detected fields to FieldRoles using the alias dictionary.
 * One role → at most one field (highest confidence wins).
 * Unknown / low-confidence fields are returned as skipped candidates.
 */
export function matchFields(fields: DetectedField[], options: MatchOptions = {}): FieldMatch[] {
  let aliases = options.aliases ?? FIELD_ALIASES;
  const host = options.hostname ?? (typeof location !== 'undefined' ? location.hostname : '');
  if (options.domainLearning?.getDomainAliases && host) {
    const overlay = options.domainLearning.getDomainAliases(host);
    if (overlay) {
      aliases = mergeAliases(aliases, overlay as Partial<AliasDictionary>);
    }
  }

  const raw: FieldMatch[] = fields.map((field) => {
    const hit = bestRoleForField(field, aliases);
    return {
      field,
      role: hit.role,
      confidence: hit.confidence,
      matchedAlias: hit.matchedAlias,
      reason: hit.reason,
    };
  });

  // Deduplicate roles: keep highest confidence per role
  const byRole = new Map<FieldRole, FieldMatch>();
  for (const m of raw) {
    if (m.role === 'unknown' || m.confidence === 'none' || m.confidence === 'low') {
      continue;
    }
    const prev = byRole.get(m.role);
    if (!prev || CONFIDENCE_RANK[m.confidence] > CONFIDENCE_RANK[prev.confidence]) {
      byRole.set(m.role, m);
    }
  }

  const claimed = new Set(byRole.values());
  return raw.map((m) => {
    if (m.role === 'unknown' || m.confidence === 'none' || m.confidence === 'low') {
      return { ...m, role: 'unknown' as FieldRole, confidence: 'none' as MatchConfidence };
    }
    if (!claimed.has(m) && byRole.get(m.role) !== m) {
      return {
        ...m,
        role: 'unknown' as FieldRole,
        confidence: 'none' as MatchConfidence,
        reason: `duplicate role ${m.role} — weaker match skipped`,
      };
    }
    return m;
  });
}

export function isConfidentMatch(m: FieldMatch, min: MatchConfidence = 'medium'): boolean {
  return (
    m.role !== 'unknown' &&
    CONFIDENCE_RANK[m.confidence] >= CONFIDENCE_RANK[min]
  );
}
