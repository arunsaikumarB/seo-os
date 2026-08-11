import { fieldDisplayLabel, mergeAliasLists, normalizeText } from '../detect/dom-scanner';
import type {
  DomainFieldMapping,
  DomainLearningHook,
  FieldClassification,
  FieldRole,
  FillableRole,
  MappingDiagnostics,
  MatchSource,
  NormalizedField,
} from '../types';
import { CONFIDENCE_FILL_THRESHOLD, FILLABLE_ROLES } from '../types';
import { FIELD_ALIASES, STRUCTURAL_HINTS } from './aliases';
import {
  bestAliasScore,
  bestResolvedLabelScore,
  blobHasHint,
  fieldKnowledgeKey,
  WEIGHTS,
} from './confidence';
import { logResolvedFields } from '../detect/label-resolver';
import { ROLE_LABELS } from './aliases';

function signalBlob(field: NormalizedField): string {
  return [
    field.label,
    field.rawLabel,
    field.placeholder,
    field.name,
    field.id,
    field.ariaLabel,
    field.nearbyText,
    field.sectionHeading,
    field.autocomplete,
    field.valueAttr,
    field.inputType,
  ].join(' ');
}

function classifyStructural(field: NormalizedField): FieldClassification | null {
  const blob = signalBlob(field);
  const type = field.inputType;
  const structural = (role: FieldRole, confidence: number, reason: string, alias: string): FieldClassification => ({
    field,
    role,
    confidence,
    matchedAlias: alias,
    matchedBy: ['Type'],
    reason,
    matchSource: 'structural',
  });

  if (type === 'password') {
    return structural('login', 100, 'Password input', 'type=password');
  }
  if (type === 'submit' || type === 'button' || type === 'image' || type === 'reset') {
    return structural('submit', 100, 'Submit/button control', `type=${type}`);
  }
  if (type === 'email') {
    return {
      field,
      role: 'email',
      confidence: 95,
      matchedAlias: 'type=email',
      matchedBy: ['Type'],
      reason: 'input type=email',
      matchSource: 'alias',
    };
  }
  if (type === 'tel') {
    return {
      field,
      role: 'phone',
      confidence: 95,
      matchedAlias: 'type=tel',
      matchedBy: ['Type'],
      reason: 'input type=tel',
      matchSource: 'alias',
    };
  }
  if (type === 'url') {
    return {
      field,
      role: 'website',
      confidence: 90,
      matchedAlias: 'type=url',
      matchedBy: ['Type'],
      reason: 'input type=url',
      matchSource: 'alias',
    };
  }
  if (type === 'search') {
    return structural('search', 95, 'input type=search', 'type=search');
  }

  if (blobHasHint(blob, STRUCTURAL_HINTS.captcha)) {
    return {
      field,
      role: 'captcha',
      confidence: 95,
      matchedAlias: 'captcha hint',
      matchedBy: ['Keyword'],
      reason: 'CAPTCHA-related control',
      matchSource: 'structural',
    };
  }

  if (
    field.autocomplete.includes('cc-') ||
    blobHasHint(blob, STRUCTURAL_HINTS.payment) ||
    /^(cc-|card)/i.test(field.name) ||
    /^(cc-|card)/i.test(field.id)
  ) {
    return {
      field,
      role: 'payment',
      confidence: 95,
      matchedAlias: 'payment',
      matchedBy: ['Keyword'],
      reason: 'Payment field',
      matchSource: 'structural',
    };
  }

  if (blobHasHint(blob, STRUCTURAL_HINTS.login)) {
    return {
      field,
      role: 'login',
      confidence: 90,
      matchedAlias: 'login hint',
      matchedBy: ['Keyword'],
      reason: 'Login-related control',
      matchSource: 'structural',
    };
  }

  if (
    blobHasHint(blob, STRUCTURAL_HINTS.search) &&
    (type === 'search' || /search/i.test(field.name + field.id))
  ) {
    return {
      field,
      role: 'search',
      confidence: 88,
      matchedAlias: 'search',
      matchedBy: ['Keyword'],
      reason: 'Search control',
      matchSource: 'structural',
    };
  }

  if (blobHasHint(blob, STRUCTURAL_HINTS.newsletter)) {
    return {
      field,
      role: 'newsletter',
      confidence: 90,
      matchedAlias: 'newsletter',
      matchedBy: ['Keyword'],
      reason: 'Newsletter / promo / coupon control',
      matchSource: 'structural',
    };
  }

  return null;
}

function matchDomainMapping(
  field: NormalizedField,
  mappings: DomainFieldMapping[]
): FieldClassification | null {
  if (!mappings.length) return null;
  const keys = fieldKnowledgeKey(field);
  for (const m of mappings) {
    const wf = String(m.websiteField ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    if (!wf) continue;
    const hit =
      keys.includes(wf) ||
      keys.some((k) => k === wf || k.includes(wf) || wf.includes(k));
    if (!hit) continue;

    const mapped = String(m.mappedTo ?? '').trim().toLowerCase();
    if (mapped === 'skip') {
      return {
        field,
        role: 'unknown',
        confidence: 0,
        matchedAlias: wf,
        matchedBy: ['Domain Knowledge'],
        reason: 'Domain mapping: Skip',
        matchSource: 'skipped',
      };
    }
    if (!FILLABLE_ROLES.includes(mapped as FillableRole)) continue;
    return {
      field,
      role: mapped as FillableRole,
      confidence: WEIGHTS.domainMapping,
      matchedAlias: wf,
      matchedBy: ['Domain Knowledge'],
      reason: `Verified domain mapping "${wf}" → ${mapped}`,
      matchSource: 'domain',
    };
  }
  return null;
}

export interface ClassifyOptions {
  domainLearning?: DomainLearningHook;
  hostname?: string;
  aliases?: Record<FillableRole, string[]>;
}

function matchDirectoryNameAttr(field: NormalizedField): FieldClassification | null {
  const n = (field.name || field.id || '').trim().toUpperCase().replace(/[- ]+/g, '_');
  const map: Record<string, FillableRole> = {
    TITLE: 'title',
    HEADLINE: 'title',
    LISTING_TITLE: 'title',
    URL: 'website',
    WEBSITE: 'website',
    SITE_URL: 'website',
    HOME_URL: 'website',
    DESCRIPTION: 'description',
    DESC: 'description',
    LONG_DESCRIPTION: 'description',
    SHORT_DESCRIPTION: 'description',
    OWNER_NAME: 'business_name',
    CONTACT_NAME: 'business_name',
    YOUR_NAME: 'business_name',
    OWNER_EMAIL: 'email',
    CONTACT_EMAIL: 'email',
    EMAIL: 'email',
    PHONE: 'phone',
    OWNER_PHONE: 'phone',
  };
  const role = map[n];
  if (!role) return null;
  return {
    field,
    role,
    confidence: 98,
    matchedAlias: field.name || field.id,
    matchedBy: ['NameAttr'],
    reason: `Directory name attribute "${field.name || field.id}" → ${role}`,
    matchSource: 'alias',
  };
}

/**
 * Mapping priority:
 * 1 Domain Knowledge → 2 Shared verified → 3 Global Alias → 4 Confidence → 5 Skip
 * Never guess. Unknown stays unknown until verified.
 */
export function classifyFields(
  fields: NormalizedField[],
  options: ClassifyOptions = {}
): FieldClassification[] {
  let aliases = options.aliases ?? FIELD_ALIASES;
  const host = options.hostname ?? (typeof location !== 'undefined' ? location.hostname : '');
  const mappings =
    (options.domainLearning?.getDomainMappings && host
      ? options.domainLearning.getDomainMappings(host)
      : null) ?? [];

  if (options.domainLearning?.getDomainAliases && host) {
    aliases = mergeAliasLists(aliases, options.domainLearning.getDomainAliases(host));
  }

  const raw: FieldClassification[] = fields.map((field) => {
    const structural = classifyStructural(field);
    // Directory name attrs beat weak structural "payment" hits on pricing radios near listing fields
    const byName = matchDirectoryNameAttr(field);
    if (byName) return byName;
    if (structural) return structural;

    // Priority 1–2: domain / shared verified knowledge
    const domainHit = matchDomainMapping(field, mappings);
    if (domainHit) return domainHit;

    // Priority 3–4: resolved label → alias library (Phase 2.3.1)
    // Pass ONLY the resolved label into the alias engine; confidence from resolver.
    let best: FieldClassification | null = null;
    for (const role of FILLABLE_ROLES) {
      const aliasesForRole = aliases[role] ?? [];
      const labelHit = field.label
        ? bestResolvedLabelScore(field.label, aliasesForRole)
        : null;
      if (labelHit) {
        const confidence = Math.max(
          field.labelResolverConfidence || 0,
          Math.min(100, labelHit.score)
        );
        // Prefer resolver confidence when we have a real text resolver
        const useConfidence =
          field.labelResolverConfidence >= 75
            ? field.labelResolverConfidence
            : confidence;
        if (!best || useConfidence > best.confidence) {
          best = {
            field,
            role,
            confidence: useConfidence,
            matchedAlias: labelHit.matchedAlias,
            matchedBy: [
              ...labelHit.matchedBy,
              `Resolver:${field.labelResolver || 'NONE'}`,
            ],
            reason: `Resolved "${field.rawLabel || field.label}" via ${field.labelResolver} → alias "${labelHit.matchedAlias}"`,
            matchSource:
              useConfidence >= CONFIDENCE_FILL_THRESHOLD ? 'alias' : 'confidence',
          };
        }
        continue;
      }

      // Fallback multi-signal only when label resolver was weak (name/id)
      if (
        field.labelResolver === 'NAME_ATTR' ||
        field.labelResolver === 'ID_ATTR' ||
        field.labelResolver === 'NONE' ||
        !field.label
      ) {
        const hit = bestAliasScore(field, aliasesForRole);
        if (!hit) continue;
        if (!best || hit.score > best.confidence) {
          best = {
            field,
            role,
            confidence: hit.score,
            matchedAlias: hit.matchedAlias,
            matchedBy: hit.matchedBy,
            reason: `Matched alias "${hit.matchedAlias}" via ${hit.matchedBy.join(', ')}`,
            matchSource:
              hit.score >= CONFIDENCE_FILL_THRESHOLD ? 'confidence' : 'confidence',
          };
        }
      }
    }

    if (!best) {
      return {
        field,
        role: 'unknown' as FieldRole,
        confidence: 0,
        matchedAlias: null,
        matchedBy: [],
        reason: 'No alias match',
        matchSource: 'unknown',
      };
    }
    return best;
  });

  // Mandatory label-resolution log (Phase 2.3.1)
  logResolvedFields(
    raw.map((c) => c.field),
    raw.map((c) => ({
      matchedAlias: c.matchedAlias ?? ROLE_LABELS[c.role] ?? c.role,
      confidence: c.confidence,
      role: ROLE_LABELS[c.role] ?? c.role,
    }))
  );

  // One fillable role → strongest field only
  const winners = new Map<FieldRole, FieldClassification>();
  for (const c of raw) {
    if (!FILLABLE_ROLES.includes(c.role as FillableRole)) continue;
    if (c.matchSource === 'skipped') continue;
    const prev = winners.get(c.role);
    if (!prev || c.confidence > prev.confidence) winners.set(c.role, c);
  }

  return raw.map((c) => {
    if (!FILLABLE_ROLES.includes(c.role as FillableRole)) return c;
    if (c.matchSource === 'skipped') return c;
    const win = winners.get(c.role);
    if (win && win.field.uid !== c.field.uid) {
      return {
        ...c,
        role: 'unknown' as FieldRole,
        confidence: 0,
        matchedAlias: null,
        matchedBy: [],
        reason: `Duplicate ${c.role} — weaker than ${fieldDisplayLabel(win.field)}`,
        matchSource: 'unknown' as MatchSource,
      };
    }
    return c;
  });
}

export function isFillConfident(
  c: FieldClassification,
  threshold = CONFIDENCE_FILL_THRESHOLD
): boolean {
  if (c.matchSource === 'skipped' || c.matchSource === 'structural') return false;
  return FILLABLE_ROLES.includes(c.role as FillableRole) && c.confidence >= threshold;
}

export function computeMappingDiagnostics(
  classifications: FieldClassification[]
): MappingDiagnostics {
  let mapped = 0;
  let domainMatches = 0;
  let aliasMatches = 0;
  let confidenceMatches = 0;
  let unknown = 0;
  let skipped = 0;
  let confSum = 0;
  let confN = 0;

  for (const c of classifications) {
    if (c.matchSource === 'domain') {
      domainMatches++;
      mapped++;
      confSum += c.confidence;
      confN++;
    } else if (c.matchSource === 'alias') {
      aliasMatches++;
      if (c.confidence >= CONFIDENCE_FILL_THRESHOLD) mapped++;
      confSum += c.confidence;
      confN++;
    } else if (c.matchSource === 'confidence') {
      confidenceMatches++;
      if (c.confidence >= CONFIDENCE_FILL_THRESHOLD) mapped++;
      confSum += c.confidence;
      confN++;
    } else if (
      c.matchSource === 'structural' ||
      c.matchSource === 'skipped' ||
      ['captcha', 'payment', 'submit', 'login', 'search', 'newsletter'].includes(c.role)
    ) {
      skipped++;
    } else {
      unknown++;
    }
  }

  return {
    detected: classifications.length,
    mapped,
    domainMatches,
    aliasMatches,
    confidenceMatches,
    unknown,
    skipped,
    avgConfidence: confN ? Math.round(confSum / confN) : 0,
  };
}

export function debugLogClassifications(
  classifications: FieldClassification[],
  filledUids: Set<string>
): void {
  logResolvedFields(
    classifications.map((c) => c.field),
    classifications.map((c) => ({
      matchedAlias: c.matchedAlias ?? ROLE_LABELS[c.role] ?? c.role,
      confidence: c.confidence,
      role: ROLE_LABELS[c.role] ?? c.role,
    }))
  );

  const lines: string[] = ['[Backlink Agent Companion] Detected Fields', '================'];
  for (const c of classifications) {
    lines.push(ROLE_LABELS_SAFE(c.role));
    lines.push(`Confidence ${c.confidence}%`);
    lines.push(`Source ${c.matchSource ?? '—'}`);
    lines.push(`Resolver ${c.field.labelResolver ?? 'NONE'}`);
    lines.push(`Raw Label ${c.field.rawLabel || '(none)'}`);
    lines.push(`Normalized ${c.field.label || '(none)'}`);
    if (c.matchedBy.length) lines.push(`Matched By\n${c.matchedBy.join(', ')}`);
    if (c.matchedAlias) lines.push(`Matched Alias\n${c.matchedAlias}`);
    const filled = filledUids.has(c.field.uid);
    if (isFillConfident(c)) {
      lines.push(`Filled\n${filled ? 'YES' : 'NO'}`);
    } else {
      lines.push(`Reason\n${c.reason || 'Low Confidence'}`);
      lines.push('Skipped');
    }
    lines.push('----------------');
  }
  console.info(lines.join('\n'));
}

function ROLE_LABELS_SAFE(role: FieldRole): string {
  const map: Record<string, string> = {
    business_name: 'Business Name',
    title: 'Title',
    website: 'Website',
    email: 'Email',
    phone: 'Phone',
    description: 'Description',
    address: 'Address',
    city: 'City',
    state: 'State',
    country: 'Country',
    zip: 'ZIP',
    category: 'Category',
    facebook: 'Facebook',
    linkedin: 'LinkedIn',
    twitter: 'Twitter',
    captcha: 'CAPTCHA',
    payment: 'Payment',
    submit: 'Submit',
    login: 'Login',
    search: 'Search',
    newsletter: 'Newsletter',
    unknown: 'Unknown',
  };
  return map[role] ?? role;
}

export function isEmptyValue(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return !el.value.trim();
  }
  if (el instanceof HTMLSelectElement) {
    return !el.value || el.selectedIndex <= 0;
  }
  if (el.isContentEditable) {
    return !(el.textContent ?? '').trim();
  }
  return true;
}

export { normalizeText };
