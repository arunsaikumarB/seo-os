import { fieldDisplayLabel, mergeAliasLists, normalizeText } from '../detect/dom-scanner';
import type {
  DomainLearningHook,
  FieldClassification,
  FieldRole,
  FillableRole,
  NormalizedField,
} from '../types';
import { CONFIDENCE_FILL_THRESHOLD, FILLABLE_ROLES } from '../types';
import { FIELD_ALIASES, STRUCTURAL_HINTS } from './aliases';
import { bestAliasScore, blobHasHint } from './confidence';

function signalBlob(field: NormalizedField): string {
  return [
    field.label,
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

  if (type === 'password') {
    return {
      field,
      role: 'login',
      confidence: 100,
      matchedAlias: 'type=password',
      matchedBy: ['Type'],
      reason: 'Password input',
    };
  }

  if (type === 'submit' || type === 'button' || type === 'image' || type === 'reset') {
    return {
      field,
      role: 'submit',
      confidence: 100,
      matchedAlias: `type=${type}`,
      matchedBy: ['Type'],
      reason: 'Submit/button control',
    };
  }

  if (type === 'email') {
    return {
      field,
      role: 'email',
      confidence: 95,
      matchedAlias: 'type=email',
      matchedBy: ['Type'],
      reason: 'input type=email',
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
    };
  }
  if (type === 'search') {
    return {
      field,
      role: 'search',
      confidence: 95,
      matchedAlias: 'type=search',
      matchedBy: ['Type'],
      reason: 'input type=search',
    };
  }

  // CAPTCHA — field-level only
  if (blobHasHint(blob, STRUCTURAL_HINTS.captcha)) {
    return {
      field,
      role: 'captcha',
      confidence: 95,
      matchedAlias: 'captcha hint',
      matchedBy: ['Keyword'],
      reason: 'CAPTCHA-related control',
    };
  }

  // Payment / pricing — field-level only (never page-level)
  if (
    field.autocomplete.includes('cc-') ||
    blobHasHint(blob, STRUCTURAL_HINTS.payment) ||
    /^(cc-|card)/i.test(field.name) ||
    /^(cc-|card)/i.test(field.id)
  ) {
    // Radio/checkbox pricing plans
    if (field.kind === 'radio' || field.kind === 'checkbox' || field.kind === 'select') {
      return {
        field,
        role: 'payment',
        confidence: 92,
        matchedAlias: 'pricing/payment',
        matchedBy: ['Keyword'],
        reason: 'Payment or pricing control',
      };
    }
    return {
      field,
      role: 'payment',
      confidence: 95,
      matchedAlias: 'payment',
      matchedBy: ['Keyword'],
      reason: 'Payment field',
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
    };
  }

  if (blobHasHint(blob, STRUCTURAL_HINTS.search) && (type === 'search' || /search/i.test(field.name + field.id))) {
    return {
      field,
      role: 'search',
      confidence: 88,
      matchedAlias: 'search',
      matchedBy: ['Keyword'],
      reason: 'Search control',
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
    };
  }

  if (blobHasHint(blob, STRUCTURAL_HINTS.submit) && field.kind === 'input' && (type === 'submit' || type === 'button')) {
    return {
      field,
      role: 'submit',
      confidence: 90,
      matchedAlias: 'submit',
      matchedBy: ['Keyword'],
      reason: 'Submit control',
    };
  }

  return null;
}

export interface ClassifyOptions {
  domainLearning?: DomainLearningHook;
  hostname?: string;
  aliases?: Record<FillableRole, string[]>;
}

/**
 * Per-field classifier — never classifies an entire page as payment.
 */
export function classifyFields(
  fields: NormalizedField[],
  options: ClassifyOptions = {}
): FieldClassification[] {
  let aliases = options.aliases ?? FIELD_ALIASES;
  const host = options.hostname ?? (typeof location !== 'undefined' ? location.hostname : '');
  if (options.domainLearning?.getDomainAliases && host) {
    aliases = mergeAliasLists(aliases, options.domainLearning.getDomainAliases(host));
  }

  const raw: FieldClassification[] = fields.map((field) => {
    const structural = classifyStructural(field);
    if (structural) return structural;

    let best: FieldClassification | null = null;
    for (const role of FILLABLE_ROLES) {
      const hit = bestAliasScore(field, aliases[role] ?? []);
      if (!hit) continue;
      if (!best || hit.score > best.confidence) {
        best = {
          field,
          role,
          confidence: hit.score,
          matchedAlias: hit.matchedAlias,
          matchedBy: hit.matchedBy,
          reason: `Matched alias "${hit.matchedAlias}" via ${hit.matchedBy.join(', ')}`,
        };
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
      };
    }
    return best;
  });

  // One fillable role → strongest field only (others demoted to unknown for fill,
  // but keep classification for inspector with note)
  const winners = new Map<FieldRole, FieldClassification>();
  for (const c of raw) {
    if (!FILLABLE_ROLES.includes(c.role as FillableRole)) continue;
    const prev = winners.get(c.role);
    if (!prev || c.confidence > prev.confidence) winners.set(c.role, c);
  }

  return raw.map((c) => {
    if (!FILLABLE_ROLES.includes(c.role as FillableRole)) return c;
    const win = winners.get(c.role);
    if (win && win.field.uid !== c.field.uid) {
      return {
        ...c,
        role: 'unknown' as FieldRole,
        confidence: 0,
        matchedAlias: null,
        matchedBy: [],
        reason: `Duplicate ${c.role} — weaker than ${fieldDisplayLabel(win.field)}`,
      };
    }
    return c;
  });
}

export function isFillConfident(c: FieldClassification, threshold = CONFIDENCE_FILL_THRESHOLD): boolean {
  return (
    FILLABLE_ROLES.includes(c.role as FillableRole) &&
    c.confidence >= threshold
  );
}

export function debugLogClassifications(
  classifications: FieldClassification[],
  filledUids: Set<string>
): void {
  const lines: string[] = ['[SEO OS Companion] Detected Fields', '================'];
  for (const c of classifications) {
    const name = ROLE_LABELS_SAFE(c.role);
    lines.push(name);
    lines.push(`Confidence ${c.confidence}%`);
    if (c.matchedBy.length) lines.push(`Matched By\n${c.matchedBy.join(', ')}`);
    if (c.matchedAlias) lines.push(`Matched Alias\n${c.matchedAlias}`);
    const filled = filledUids.has(c.field.uid);
    if (FILLABLE_ROLES.includes(c.role as FillableRole) && c.confidence >= CONFIDENCE_FILL_THRESHOLD) {
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
  // lazy avoid circular — inline titles
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
