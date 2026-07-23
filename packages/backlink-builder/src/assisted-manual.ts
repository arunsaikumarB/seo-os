/**
 * Phase 7 — Assisted Manual packages (human submits; app never auto-publishes).
 * Pure logic: Form Reader, Site Recipes, packages, buckets, staleness, similarity.
 * Does NOT submit, solve gates, or change Auto/Manual routing (6.3.x).
 */

/** Soft guide for metrics dashboards — preparation is not capped. */
export const ASSISTED_MANUAL_PILOT_MAX = 10;
export const ASSISTED_PACKAGE_TTL_DAYS = 7;
export const ASSISTED_SIMILARITY_THRESHOLD = 0.85;
/** Safety ceiling per prepare request (not a product pilot cap). */
export const ASSISTED_PREPARE_BATCH_MAX = 500;

/**
 * Bump when Form Reader extraction changes (search filters, DOM fact shape, etc.).
 * Mismatched recipes re-read HTML and rebuild fields on prepare even if fingerprint matches.
 */
export const ASSISTED_FORM_READER_VERSION = 2;
/**
 * Bump when field-role / confidence rules change.
 * Mismatched recipes re-classify even when form fingerprint is unchanged.
 * v6: drop contradictory / legacy human_corrected pins; clear deletes pins.
 */
export const ASSISTED_FIELD_CLASSIFIER_VERSION = 6;

export type FieldConfidence = 'high' | 'medium' | 'low';
export type FieldSource =
  | 'dom_label'
  | 'llm_inferred'
  | 'human_corrected'
  | 'name_guess'
  /** User rejected the mapping; must re-infer on next read — never pin. */
  | 'known_bad';
export type FieldRole =
  | 'title'
  | 'short_desc'
  | 'long_desc'
  | 'url'
  | 'email'
  | 'phone'
  | 'name'
  | 'business_name'
  | 'category'
  | 'address'
  | 'attachment'
  | 'terms'
  | 'other';

export type AssistedGate =
  | 'none'
  | 'captcha'
  | 'otp_email'
  | 'otp_phone'
  | 'login'
  | 'manual_review'
  | 'multi_step';

export type AssistedBucket = 'ready' | 'check_fields' | 'needs_person';
export type PackageStatus = 'not_started' | 'in_progress' | 'done' | 'failed';
export type FingerprintStatus = 'fresh' | 'stale' | 'changed';

/** DOM facts extracted during crawl — evidence first, LLM only to disambiguate. */
export type FormFieldFacts = {
  label: string | null;
  name: string | null;
  id: string | null;
  placeholder: string | null;
  ariaLabel: string | null;
  type: string;
  required: boolean;
  maxlength: number | null;
  options: string[];
  surroundingText: string | null;
  accept: string | null;
  sizeHint: string | null;
  selector: string;
};

export type RecipeField = {
  selector: string;
  role: FieldRole;
  maxlength: number | null;
  required: boolean;
  confidence: FieldConfidence;
  source: FieldSource;
  label: string | null;
  options?: string[];
  accept?: string | null;
  sizeHint?: string | null;
};

export type SiteRecipe = {
  domain: string;
  entryUrl: string;
  formFingerprint: string;
  fields: RecipeField[];
  dropdownOptions: Record<string, string[]>;
  gate: AssistedGate;
  notes: string;
  lastVerifiedAt: string | null;
  correctionCount: number;
  multiStep: boolean;
  multiStepLabel?: string;
  /** Form Reader extraction version — bump when DOM parsing changes. */
  readerVersion?: number;
  /** Field-role / confidence classifier version — bump when mapping rules change. */
  classifierVersion?: number;
};

export function recipeVersionsCurrent(recipe: SiteRecipe | null | undefined): boolean {
  if (!recipe) return false;
  return (
    recipe.readerVersion === ASSISTED_FORM_READER_VERSION &&
    recipe.classifierVersion === ASSISTED_FIELD_CLASSIFIER_VERSION
  );
}

export type PackageFieldValue = {
  selector: string;
  role: FieldRole;
  label: string;
  value: string;
  charCount: number;
  maxlength: number | null;
  required?: boolean;
  confidence: FieldConfidence;
  source: FieldSource;
  options?: string[];
  recommendedOption?: string | null;
  overLimit: boolean;
  truncatedAtSentence?: boolean;
  humanStep?: string | null;
  imageFileName?: string | null;
  imageConstraints?: string | null;
};

export type AssistedPackagePayload = {
  entryUrl: string;
  domain: string;
  formFingerprint: string;
  preparedAt: string;
  fingerprintStatus: FingerprintStatus;
  bucket: AssistedBucket;
  status: PackageStatus;
  gate: AssistedGate;
  gateNotes: string;
  multiStep: boolean;
  multiStepLabel: string | null;
  fields: PackageFieldValue[];
  honestyNotes: string[];
  failureReason: string | null;
  readerVersion?: number;
  classifierVersion?: number;
};

export type AssistedLaneCounts = {
  automatable: number;
  assisted: number;
  /** Manual-lane sites without an Assisted package (offline Excel path). */
  manual: number;
  /** Full Manual-lane count (routing). */
  manualTotal: number;
  active: number;
  ready: number;
  checkFields: number;
  needsPerson: number;
  assistedOk: boolean;
  /** Phase 6.3 lane conservation: automatable + manualTotal === active */
  conservationOk: boolean;
};

export function computeAssistedLaneCounts(input: {
  automatable: number;
  manualTotal: number;
  assistedPackages: Array<{ bucket: AssistedBucket }>;
  /** How many Manual-lane opportunities already have an Assisted package */
  manualWithPackage?: number;
}): AssistedLaneCounts {
  const assisted = input.assistedPackages.length;
  const manualWithPkg = Math.min(
    input.manualWithPackage ?? 0,
    input.manualTotal,
    assisted
  );
  const manual = Math.max(0, input.manualTotal - manualWithPkg);
  const active = input.automatable + input.manualTotal;
  const ready = input.assistedPackages.filter((p) => p.bucket === 'ready').length;
  const checkFields = input.assistedPackages.filter((p) => p.bucket === 'check_fields').length;
  const needsPerson = input.assistedPackages.filter((p) => p.bucket === 'needs_person').length;
  return {
    automatable: input.automatable,
    assisted,
    manual,
    manualTotal: input.manualTotal,
    active,
    ready,
    checkFields,
    needsPerson,
    assistedOk: ready + checkFields + needsPerson === assisted,
    conservationOk: input.automatable + input.manualTotal === active,
  };
}

export function canAddToPilot(currentPilotCount: number, max = ASSISTED_MANUAL_PILOT_MAX): boolean {
  return currentPilotCount < max;
}

// ─── Form Reader ─────────────────────────────────────────────────────────────

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`${name}=["']([^"']*)["']`, 'i').exec(tag);
  return m?.[1] ?? null;
}

function hasRequired(tag: string): boolean {
  return /\brequired\b/i.test(tag) || /aria-required=["']true["']/i.test(tag);
}

function parseMaxlength(tag: string, surrounding: string): number | null {
  const fromAttr = Number(attr(tag, 'maxlength') ?? 0) || 0;
  if (fromAttr > 0) return fromAttr;
  const hint = /max(?:imum)?\s*[:\s]*(\d+)\s*char/i.exec(surrounding);
  if (hint) return Number(hint[1]);
  return null;
}

function optionsFromSelect(block: string): string[] {
  const opts: string[] = [];
  const re = /<option[^>]*>([\s\S]*?)<\/option>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, '').trim();
    const val = attr(m[0], 'value');
    const label = text || val || '';
    if (label && !/^select\b/i.test(label)) opts.push(label);
  }
  return opts;
}

function findLabel(html: string, id: string | null, name: string | null): string | null {
  if (id) {
    const re = new RegExp(
      `<label[^>]*for=["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>([\\s\\S]*?)<\\/label>`,
      'i'
    );
    const m = re.exec(html);
    if (m) return m[1].replace(/<[^>]+>/g, '').trim() || null;
  }
  if (name) {
    // Prefer a label that wraps an input with this name (not the first label in the doc)
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wrapRe = new RegExp(
      `<label[^>]*>([\\s\\S]*?<input\\b[^>]*\\bname=["']${esc}["'][\\s\\S]*?)<\\/label>`,
      'i'
    );
    const wrap = wrapRe.exec(html);
    if (wrap) {
      // Text nodes only — strip the nested input tag content
      const text = wrap[1]
        .replace(/<input\b[^>]*>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) return text;
    }
  }
  return null;
}

function surroundingSnippet(html: string, index: number, len = 120): string {
  const start = Math.max(0, index - 40);
  const end = Math.min(html.length, index + len);
  return html.slice(start, end).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Extract every form field as DOM facts (Phase 7 §2.1–2.3). */
export function extractFormFieldFacts(html: string): FormFieldFacts[] {
  const fields: FormFieldFacts[] = [];
  const seen = new Set<string>();

  const push = (f: FormFieldFacts) => {
    if (isSearchOrNavField(f)) return;
    const key = f.selector || `${f.name}|${f.id}|${f.type}`;
    if (seen.has(key)) return;
    seen.add(key);
    fields.push(f);
  };

  const inputRe = /<input\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = inputRe.exec(html)) !== null) {
    const attrs = m[1];
    const type = (attr(attrs, 'type') ?? 'text').toLowerCase();
    if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset') continue;
    if (type === 'search') continue;
    const name = attr(attrs, 'name');
    const id = attr(attrs, 'id');
    const label = findLabel(html, id, name);
    const surrounding = surroundingSnippet(html, m.index);
    const selector = id ? `#${id}` : name ? `[name="${name}"]` : `input[type="${type}"]`;
    push({
      label,
      name,
      id,
      placeholder: attr(attrs, 'placeholder'),
      ariaLabel: attr(attrs, 'aria-label'),
      type,
      required: hasRequired(attrs),
      maxlength: parseMaxlength(attrs, surrounding),
      options: [],
      surroundingText: surrounding,
      accept: attr(attrs, 'accept'),
      sizeHint: /(?:max|upto|up to)\s*(\d+\s*(?:kb|mb|mb\.))/i.exec(surrounding)?.[1] ?? null,
      selector,
    });
  }

  const taRe = /<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi;
  while ((m = taRe.exec(html)) !== null) {
    const attrs = m[1];
    const name = attr(attrs, 'name');
    const id = attr(attrs, 'id');
    const label = findLabel(html, id, name);
    const surrounding = surroundingSnippet(html, m.index);
    const selector = id ? `#${id}` : name ? `[name="${name}"]` : 'textarea';
    push({
      label,
      name,
      id,
      placeholder: attr(attrs, 'placeholder'),
      ariaLabel: attr(attrs, 'aria-label'),
      type: 'textarea',
      required: hasRequired(attrs),
      maxlength: parseMaxlength(attrs, surrounding),
      options: [],
      surroundingText: surrounding,
      accept: null,
      sizeHint: null,
      selector,
    });
  }

  const selRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
  while ((m = selRe.exec(html)) !== null) {
    const attrs = m[1];
    const block = m[0];
    const name = attr(attrs, 'name');
    const id = attr(attrs, 'id');
    const label = findLabel(html, id, name);
    const surrounding = surroundingSnippet(html, m.index);
    const selector = id ? `#${id}` : name ? `[name="${name}"]` : 'select';
    push({
      label,
      name,
      id,
      placeholder: null,
      ariaLabel: attr(attrs, 'aria-label'),
      type: 'select',
      required: hasRequired(attrs),
      maxlength: null,
      options: optionsFromSelect(block),
      surroundingText: surrounding,
      accept: null,
      sizeHint: null,
      selector,
    });
  }

  return fields;
}

export function detectMultiStepForm(html: string): boolean {
  const h = html.toLowerCase();
  if (/\bstep\s*[1-9]\s*(of|\/)\s*[2-9]/i.test(h)) return true;
  if (/<(button|a|input)[^>]*>\s*(next|continue|proceed)\s*</i.test(html)) return true;
  if (/wizard|multi-?step| steppers? /i.test(h)) return true;
  if (/data-step=["'][2-9]/i.test(h)) return true;
  return false;
}

export function detectGateFromHtml(html: string): AssistedGate {
  const h = html.toLowerCase();
  if (detectMultiStepForm(html)) return 'multi_step';
  if (/recaptcha|hcaptcha|g-recaptcha|cf-turnstile|captcha/i.test(h)) return 'captcha';
  if (/one[- ]?time|otp|verification code|enter the code/i.test(h) && /email/i.test(h)) {
    return 'otp_email';
  }
  if (/sms|phone.*(code|verify)|text.*(code|verify)/i.test(h)) return 'otp_phone';
  if (/type=["']password["']/i.test(h) && /login|sign\s*in|log\s*in/i.test(h)) return 'login';
  if (/pending review|manual approval|we will review/i.test(h)) return 'manual_review';
  return 'none';
}

/** Ordered hash of name/id/type set — staleness fingerprint (§2.5). */
export function computeFormFingerprint(fields: FormFieldFacts[]): string {
  const parts = fields
    .map((f) => `${f.name ?? ''}|${f.id ?? ''}|${f.type}|${f.required ? '1' : '0'}`)
    .sort();
  const raw = parts.join(';;');
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return `fp_${hash.toString(16)}_${parts.length}`;
}

// ─── Role mapping + confidence ───────────────────────────────────────────────

/** Drop trailing helper copy so "Title (Optional) Leave blank…" → "Title". */
export function primaryLabelText(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = String(raw).replace(/\s+/g, ' ').trim();
  s = s.replace(/\s*\(\s*optional\s*\).*$/i, '');
  s = s.replace(/\s*leave\s+blank\b.*$/i, '');
  s = s.replace(/\s*(?:auto[- ]?fetch|will\s+be\s+(?:filled|fetched)|hint|note|example)\b.*$/i, '');
  s = s.replace(/\s*[:–—]\s*$/g, '').trim();
  return s;
}

/** First significant word of the cleaned label (highest weight for role). */
export function leadingLabelToken(raw: string | null | undefined): string {
  const primary = primaryLabelText(raw);
  if (!primary) return '';
  const word = primary.split(/[\s:–—|/\\]+/).find((w) => /[a-z]/i.test(w)) ?? '';
  return word.toLowerCase().replace(/[^a-z0-9_-]/gi, '');
}

/**
 * Leading token from name/id attributes — same Optional / helper stripping as labels.
 * `website_url` / `listing_title` → spaced then leading token.
 */
export function leadingAttrToken(raw: string | null | undefined): string {
  if (!raw) return '';
  return leadingLabelToken(String(raw).replace(/[_\-]+/g, ' '));
}

/** Snapshot used in production logs / debugging — matches unit-test inputs. */
export function fieldFactSnapshot(facts: FormFieldFacts): {
  name: string | null;
  id: string | null;
  type: string;
  placeholder: string | null;
  ariaLabel: string | null;
  labelText: string | null;
  maxlength: number | null;
  leadingFromLabel: string;
  leadingFromAttr: string;
  role: FieldRole;
  source: FieldSource;
  confidence: FieldConfidence;
} {
  const inferred = inferFieldRole(facts);
  return {
    name: facts.name,
    id: facts.id,
    type: facts.type,
    placeholder: facts.placeholder,
    ariaLabel: facts.ariaLabel,
    labelText: facts.label,
    maxlength: facts.maxlength,
    leadingFromLabel: leadingLabelToken(facts.label || facts.ariaLabel),
    leadingFromAttr: leadingAttrToken(facts.name) || leadingAttrToken(facts.id),
    role: inferred.role,
    source: inferred.source,
    confidence: inferred.confidence,
  };
}

const LONG_DESC_MAXLENGTH = 160;

function isLongTextControl(facts: FormFieldFacts): boolean {
  if (facts.type === 'textarea') return true;
  if (facts.maxlength != null && facts.maxlength > LONG_DESC_MAXLENGTH) return true;
  return false;
}

function descriptionRoleFromControl(facts: FormFieldFacts): 'short_desc' | 'long_desc' {
  if (facts.type === 'textarea') return 'long_desc';
  if (facts.maxlength != null && facts.maxlength <= LONG_DESC_MAXLENGTH) return 'short_desc';
  if (facts.maxlength != null && facts.maxlength > LONG_DESC_MAXLENGTH) return 'long_desc';
  return 'long_desc';
}

/** Leading-token → role. URL only for URL/Website/Link (or type=url handled separately). */
function roleFromLeadingToken(
  token: string,
  facts: FormFieldFacts
): FieldRole | null {
  if (!token) return null;
  if (/^(title|headline|name)$/i.test(token)) return 'title';
  if (/^(description|about|summary|tagline|blurb|excerpt|details|bio|content|message)$/i.test(token)) {
    return descriptionRoleFromControl(facts);
  }
  if (/^(url|website|link|homepage)$/i.test(token)) return 'url';
  if (/^(email|e-?mail)$/i.test(token)) return 'email';
  if (/^(phone|mobile|tel)$/i.test(token)) return 'phone';
  if (/^(company|business|organization|org)$/i.test(token)) return 'business_name';
  if (/^(category|industry|type|topic|niche)$/i.test(token)) return 'category';
  if (/^(address|street|city|zip|postal)$/i.test(token)) return 'address';
  if (/^(logo|image|photo|file|upload|attach)$/i.test(token)) return 'attachment';
  if (/^(terms|agree|privacy|consent)$/i.test(token)) return 'terms';
  return null;
}

const ROLE_HINTS: Array<{ role: FieldRole; patterns: RegExp[] }> = [
  { role: 'email', patterns: [/e-?mail/i, /^email$/i] },
  { role: 'phone', patterns: [/phone|mobile|tel/i] },
  {
    role: 'url',
    patterns: [
      /^web\s*site$/i,
      /^website(\s*url)?$/i,
      /^url$/i,
      /^link$/i,
      /^homepage$/i,
      /^home\s*page$/i,
      /^listing\s*url$/i,
      /^company\s*url$/i,
    ],
  },
  { role: 'title', patterns: [/^title$/i, /^headline$/i, /^listing.?name$/i, /^business.?name$/i, /^name$/i] },
  { role: 'business_name', patterns: [/company|business|organization|org.?name/i] },
  { role: 'name', patterns: [/full.?name|your.?name|contact.?name|first.?name|last.?name/i] },
  { role: 'short_desc', patterns: [/^short.?desc/i, /^tagline$/i, /^summary$/i, /^blurb$/i, /^excerpt$/i] },
  { role: 'long_desc', patterns: [/^desc/i, /^about$/i, /^message$/i, /^body$/i, /^content$/i, /^details$/i, /^bio$/i] },
  { role: 'category', patterns: [/categor|industry|^type$|topic|niche/i] },
  { role: 'address', patterns: [/address|street|city|zip|postal/i] },
  { role: 'attachment', patterns: [/logo|image|photo|file|upload|attach/i] },
  { role: 'terms', patterns: [/terms|agree|privacy|consent|accept/i] },
];

/** Site search / nav chrome — never treat as directory submission fields. */
export function isSearchOrNavField(f: FormFieldFacts): boolean {
  if (f.type === 'search') return true;
  const name = (f.name ?? '').toLowerCase();
  const id = (f.id ?? '').toLowerCase();
  if (/^(q|query|search|searchbox|search_term|searchterm|keywords?|keyword)$/i.test(name)) {
    return true;
  }
  if (/^(q|query|search|searchbox)(-|_|$)/i.test(id) || /^(q|query|search|searchbox)$/i.test(id)) {
    return true;
  }
  const blob = [f.label, f.ariaLabel, f.placeholder, f.name, f.id, f.surroundingText]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/\b(search\s+this\s+site|site\s+search|search\s+…|search\s+\.\.\.)\b/i.test(blob)) {
    return true;
  }
  if (/\bsearch\b/i.test(blob) && !/\b(website|web\s*site|homepage|listing\s*url)\b/i.test(blob)) {
    return true;
  }
  if (/\b(find|query|keywords?)\b/i.test(blob) && !/\b(website|business|company|listing)\b/i.test(blob)) {
    return true;
  }
  if (/role=["']search["']/i.test(f.surroundingText ?? '')) return true;
  return false;
}

function evidenceText(f: FormFieldFacts): string {
  // Prefer cleaned primary label — never let "Leave blank… website" dominate
  const primary = primaryLabelText(f.label || f.ariaLabel);
  return [primary, f.placeholder, f.name, f.id].filter(Boolean).join(' ');
}

export function inferFieldRole(facts: FormFieldFacts): {
  role: FieldRole;
  confidence: FieldConfidence;
  source: FieldSource;
} {
  if (isSearchOrNavField(facts)) {
    return { role: 'other', confidence: 'low', source: 'name_guess' };
  }

  const explicitLabel = (facts.label || facts.ariaLabel || '').trim();
  const hasExplicitLabel = Boolean(explicitLabel);
  // Explicit <label>/aria always outranks name/id for the leading token
  const leadingFromLabel = leadingLabelToken(explicitLabel);
  const leadingFromAttr =
    leadingAttrToken(facts.name) || leadingAttrToken(facts.id);
  const leading = leadingFromLabel || (hasExplicitLabel ? '' : leadingFromAttr);
  const primary = primaryLabelText(explicitLabel);
  const text = evidenceText(facts);
  const leadSource: FieldSource = leadingFromLabel
    ? 'dom_label'
    : leadingFromAttr
      ? 'name_guess'
      : hasExplicitLabel
        ? 'dom_label'
        : 'name_guess';

  if (facts.type === 'file') {
    return {
      role: 'attachment',
      confidence: hasExplicitLabel ? 'high' : 'medium',
      source: hasExplicitLabel ? 'dom_label' : 'name_guess',
    };
  }
  if (facts.type === 'checkbox' && /terms|agree|privacy/i.test(text)) {
    return { role: 'terms', confidence: 'high', source: 'dom_label' };
  }
  if (facts.type === 'email') {
    return {
      role: 'email',
      confidence: hasExplicitLabel ? 'high' : 'medium',
      source: hasExplicitLabel ? 'dom_label' : 'name_guess',
    };
  }

  // Textarea / long maxlength → description family, never url
  if (isLongTextControl(facts)) {
    const fromLead = roleFromLeadingToken(leading, facts);
    if (fromLead === 'url') {
      return {
        role: descriptionRoleFromControl(facts),
        confidence: 'high',
        source: leadSource,
      };
    }
    if (fromLead === 'short_desc' || fromLead === 'long_desc' || fromLead === 'title') {
      // Title on a textarea is unusual — still prefer description when long control
      if (fromLead === 'title' && facts.type === 'textarea') {
        return {
          role: descriptionRoleFromControl(facts),
          confidence: 'high',
          source: leadSource,
        };
      }
      return {
        role: fromLead === 'title' ? fromLead : descriptionRoleFromControl(facts),
        confidence: 'high',
        source: leadSource,
      };
    }
    if (fromLead) {
      return { role: fromLead, confidence: 'high', source: leadSource };
    }
    return {
      role: descriptionRoleFromControl(facts),
      confidence: hasExplicitLabel ? 'medium' : 'low',
      source: hasExplicitLabel ? 'dom_label' : 'name_guess',
    };
  }

  // Leading token wins (Title…website helper → title, not url)
  // Explicit label token outranks type=url and name/id
  const fromLead = roleFromLeadingToken(leading, facts);
  if (fromLead) {
    if (fromLead === 'url' && isLongTextControl(facts)) {
      return {
        role: descriptionRoleFromControl(facts),
        confidence: 'high',
        source: leadSource,
      };
    }
    return {
      role: fromLead,
      confidence: leadingFromLabel ? 'high' : 'medium',
      source: leadSource,
    };
  }

  // type=url → url only when no conflicting explicit label token
  if (facts.type === 'url') {
    if (isLongTextControl(facts)) {
      return {
        role: descriptionRoleFromControl(facts),
        confidence: 'medium',
        source: 'dom_label',
      };
    }
    // Labeled "Title" / "Description" must never become url just because type=url
    if (hasExplicitLabel && primary) {
      for (const hint of ROLE_HINTS) {
        if (hint.role === 'url') continue;
        if (hint.patterns.some((p) => p.test(primary))) {
          return { role: hint.role, confidence: 'high', source: 'dom_label' };
        }
      }
    }
    return {
      role: 'url',
      confidence: hasExplicitLabel ? 'high' : 'medium',
      source: hasExplicitLabel ? 'dom_label' : 'name_guess',
    };
  }

  if (facts.type === 'select' || facts.options.length > 0) {
    const cat = ROLE_HINTS.find((h) => h.role === 'category');
    if (cat && cat.patterns.some((p) => p.test(primary || text))) {
      return {
        role: 'category',
        confidence: hasExplicitLabel ? 'high' : 'medium',
        source: hasExplicitLabel ? 'dom_label' : 'llm_inferred',
      };
    }
  }

  // Fallback: cleaned primary label only when labeled; else placeholder / stripped attrs
  const matchHaystack = hasExplicitLabel
    ? primary || ''
    : primary ||
      primaryLabelText(facts.placeholder) ||
      [leadingFromAttr, facts.placeholder].filter(Boolean).join(' ');
  for (const hint of ROLE_HINTS) {
    // url only via leading token or type=url — never from incidental "website" in helpers
    if (hint.role === 'url') continue;
    if (matchHaystack && hint.patterns.some((p) => p.test(matchHaystack))) {
      if (hasExplicitLabel && primary) {
        return { role: hint.role, confidence: 'medium', source: 'dom_label' };
      }
      if (facts.placeholder && hint.patterns.some((p) => p.test(facts.placeholder!))) {
        return { role: hint.role, confidence: 'medium', source: 'dom_label' };
      }
      return { role: hint.role, confidence: 'low', source: 'name_guess' };
    }
  }

  // name/id alone may still indicate url — never when an explicit label exists
  if (
    !hasExplicitLabel &&
    !leading &&
    (roleFromLeadingToken(leadingFromAttr, facts) === 'url' ||
      /^(website|url|link|homepage)(_|$)/i.test(facts.name ?? '') ||
      /^(website|url|link|homepage)(_|$)/i.test(facts.id ?? ''))
  ) {
    return { role: 'url', confidence: 'low', source: 'name_guess' };
  }

  if (facts.name && /^[a-z]+\d+$/i.test(facts.name)) {
    return { role: 'other', confidence: 'low', source: 'name_guess' };
  }
  return {
    role: 'other',
    confidence: 'low',
    source: hasExplicitLabel ? 'dom_label' : 'llm_inferred',
  };
}

/** Empty / unknown mappings must never stay high. */
export function confidenceAfterValue(
  role: FieldRole,
  source: FieldSource,
  base: FieldConfidence,
  value: string
): FieldConfidence {
  if (source === 'human_corrected') return base;
  if (role === 'terms' || role === 'attachment') return base;
  if (role === 'other') return 'low';
  if (!String(value ?? '').trim()) return 'low';
  if (source === 'name_guess' && base === 'high') return 'low';
  if (source === 'name_guess' && base === 'medium') return 'low';
  return base;
}

/** Build or merge a Site Recipe from Form Reader facts. */
export function buildSiteRecipe(input: {
  domain: string;
  entryUrl: string;
  html: string;
  existing?: SiteRecipe | null;
  /**
   * When true (classifier upgrade or user force re-read), re-infer every non-human field
   * even if the form fingerprint matches the stored recipe.
   */
  forceReclassify?: boolean;
  /** When true, ignore all human_corrected / known_bad pins (Clear corrections). */
  dropHumanPins?: boolean;
}): SiteRecipe {
  const facts = extractFormFieldFacts(input.html);
  const fingerprint = computeFormFingerprint(facts);
  const multiStep = detectMultiStepForm(input.html);
  const gate = detectGateFromHtml(input.html);

  const versionStale = !recipeVersionsCurrent(input.existing);
  const forceReclassify = Boolean(input.forceReclassify) || versionStale;
  const dropPins = Boolean(input.dropHumanPins);

  const existingBySelector = new Map(
    (dropPins ? [] : input.existing?.fields ?? [])
      .filter((f) => f.source === 'human_corrected')
      .map((f) => [f.selector, f] as const)
  );

  const fields: RecipeField[] = facts.map((f) => {
    const prev = existingBySelector.get(f.selector);
    const inferred = inferFieldRole(f);

    // Real human role replacement — keep unless it contradicts a high-confidence DOM label
    if (prev?.source === 'human_corrected') {
      const contradictsDom =
        inferred.source === 'dom_label' &&
        inferred.confidence === 'high' &&
        inferred.role !== prev.role;
      // Force reclassify also drops legacy pins that disagree with fresh inference
      const dropLegacyOnForce =
        forceReclassify && inferred.role !== prev.role && inferred.confidence !== 'low';

      if (!contradictsDom && !dropLegacyOnForce) {
        return {
          ...prev,
          maxlength: f.maxlength ?? prev.maxlength,
          options: f.options.length ? f.options : prev.options,
          required: f.required,
          label: f.label ?? f.ariaLabel ?? f.placeholder ?? prev.label,
        };
      }
      // Fall through — pin discarded; use inference
    }

    return {
      selector: f.selector,
      role: inferred.role,
      maxlength: f.maxlength,
      required: f.required,
      confidence: inferred.confidence,
      source: inferred.source,
      label: f.label ?? f.ariaLabel ?? f.placeholder ?? f.name,
      options: f.options.length ? f.options : undefined,
      accept: f.accept,
      sizeHint: f.sizeHint,
    };
  });

  const dropdownOptions: Record<string, string[]> = {};
  for (const f of fields) {
    if (f.options?.length) dropdownOptions[f.selector] = f.options;
  }

  const upgradeNote =
    forceReclassify && input.existing && versionStale
      ? `Reclassified (reader v${ASSISTED_FORM_READER_VERSION} / classifier v${ASSISTED_FIELD_CLASSIFIER_VERSION})`
      : dropPins
        ? 'Human corrections cleared'
        : null;

  return {
    domain: input.domain,
    entryUrl: input.entryUrl,
    formFingerprint: fingerprint,
    fields,
    dropdownOptions,
    gate: multiStep ? 'multi_step' : gate,
    notes: multiStep
      ? 'Multi-step form — step 1 prepared, later steps unknown'
      : [input.existing?.notes, upgradeNote].filter(Boolean).join(' · ') || '',
    lastVerifiedAt: new Date().toISOString(),
    correctionCount: dropPins ? 0 : (input.existing?.correctionCount ?? 0),
    multiStep,
    multiStepLabel: multiStep
      ? 'Multi-step form — step 1 prepared, later steps unknown'
      : undefined,
    readerVersion: ASSISTED_FORM_READER_VERSION,
    classifierVersion: ASSISTED_FIELD_CLASSIFIER_VERSION,
  };
}

/**
 * User rejected a mapping with no replacement. Clears the role pin so the next
 * read re-infers — must NOT set human_corrected (that would freeze the error).
 */
export function markFieldMappingWrong(
  recipe: SiteRecipe,
  selector: string,
  notes?: string
): SiteRecipe {
  const fields = recipe.fields.map((f) => {
    if (f.selector !== selector) return f;
    return {
      ...f,
      role: 'other' as FieldRole,
      source: 'known_bad' as const,
      confidence: 'low' as const,
    };
  });
  return {
    ...recipe,
    fields,
    correctionCount: recipe.correctionCount + 1,
    notes: notes
      ? [recipe.notes, notes].filter(Boolean).join(' · ')
      : [recipe.notes, 'Field marked wrong (re-infer)'].filter(Boolean).join(' · '),
    lastVerifiedAt: new Date().toISOString(),
  };
}

/**
 * Pin a real replacement role/value. Only call when the user supplies a role.
 */
export function applyHumanFieldCorrection(
  recipe: SiteRecipe,
  correction: { selector: string; role: FieldRole; notes?: string }
): SiteRecipe {
  const fields = recipe.fields.map((f) => {
    if (f.selector !== correction.selector) return f;
    return {
      ...f,
      role: correction.role,
      source: 'human_corrected' as const,
      confidence: 'high' as const,
    };
  });
  return {
    ...recipe,
    fields,
    correctionCount: recipe.correctionCount + 1,
    notes: correction.notes
      ? [recipe.notes, correction.notes].filter(Boolean).join(' · ')
      : recipe.notes,
    lastVerifiedAt: new Date().toISOString(),
  };
}

/**
 * Delete all human pins / known-bad flags for this site recipe.
 * Pins are stripped (not converted to known_bad) so they cannot survive merge.
 */
export function clearHumanCorrections(recipe: SiteRecipe): SiteRecipe {
  const fields = recipe.fields.map((f) => {
    if (f.source !== 'human_corrected' && f.source !== 'known_bad') return f;
    // Strip pin identity entirely — buildSiteRecipe will not preserve these
    return {
      ...f,
      source: 'name_guess' as const,
      confidence: 'low' as const,
    };
  });
  return {
    ...recipe,
    fields,
    correctionCount: 0,
    readerVersion: 0,
    classifierVersion: 0,
    notes: [recipe.notes, 'Human corrections cleared'].filter(Boolean).join(' · '),
    lastVerifiedAt: new Date().toISOString(),
  };
}

/**
 * For force re-read: keep only real human role replacements.
 * known_bad and machine guesses must not pin the next inference.
 */
export function recipePinsOnly(recipe: SiteRecipe | null | undefined): SiteRecipe | null {
  if (!recipe) return null;
  const pins = recipe.fields.filter((f) => f.source === 'human_corrected');
  return {
    ...recipe,
    fields: pins,
    readerVersion: 0,
    classifierVersion: 0,
  };
}

/** True when a stored pin should be discarded against a fresh high-confidence DOM label. */
export function humanPinContradictsInference(
  pin: { role: FieldRole; source: FieldSource },
  inferred: { role: FieldRole; source: FieldSource; confidence: FieldConfidence }
): boolean {
  if (pin.source !== 'human_corrected') return false;
  return (
    inferred.source === 'dom_label' &&
    inferred.confidence === 'high' &&
    inferred.role !== pin.role
  );
}

// ─── Limit-aware content + package build ─────────────────────────────────────

/** Fit value to maxlength — sentence-boundary truncate with flag; never ship over-limit. */
export function fitValueToLimit(
  value: string,
  maxlength: number | null
): { value: string; overLimit: boolean; truncatedAtSentence: boolean } {
  if (maxlength == null || maxlength <= 0) {
    return { value, overLimit: false, truncatedAtSentence: false };
  }
  if (value.length <= maxlength) {
    return { value, overLimit: false, truncatedAtSentence: false };
  }
  const slice = value.slice(0, maxlength);
  const lastSentence = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
  if (lastSentence > maxlength * 0.5) {
    return {
      value: slice.slice(0, lastSentence + 1).trim(),
      overLimit: false,
      truncatedAtSentence: true,
    };
  }
  return {
    value: slice.trim(),
    overLimit: true,
    truncatedAtSentence: true,
  };
}

export function recommendDropdownOption(
  options: string[],
  preferredHints: string[]
): string | null {
  if (!options.length) return null;
  const lowerHints = preferredHints.map((h) => h.toLowerCase());
  for (const opt of options) {
    const o = opt.toLowerCase();
    if (lowerHints.some((h) => o.includes(h) || h.includes(o))) return opt;
  }
  return options[0] ?? null;
}

export type ContentSource = {
  title?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
  businessName?: string | null;
  url?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  categoryHints?: string[];
  imageFileName?: string | null;
};

function valueForRole(role: FieldRole, content: ContentSource): string {
  switch (role) {
    case 'title':
      return content.title || content.businessName || '';
    case 'business_name':
      return content.businessName || content.title || '';
    case 'short_desc':
      return content.shortDescription || content.longDescription?.slice(0, 160) || '';
    case 'long_desc':
      return content.longDescription || content.shortDescription || '';
    case 'url':
      return content.url || '';
    case 'email':
      return content.email || '';
    case 'phone':
      return content.phone || '';
    case 'address':
      return content.address || '';
    case 'name':
      return content.businessName || content.title || '';
    default:
      return '';
  }
}

export function assignAssistedBucket(input: {
  recipe: SiteRecipe;
  fields: PackageFieldValue[];
  fingerprintStatus: FingerprintStatus;
  formFound: boolean;
}): AssistedBucket {
  if (!input.formFound) return 'needs_person';
  if (input.fingerprintStatus === 'changed' || input.fingerprintStatus === 'stale') {
    return 'needs_person';
  }
  if (input.recipe.multiStep || input.recipe.gate === 'multi_step') return 'needs_person';
  if (input.fields.some((f) => f.overLimit)) return 'needs_person';
  const emptyRequired = input.fields.some(
    (f) =>
      f.required &&
      f.role !== 'terms' &&
      f.role !== 'attachment' &&
      !String(f.value ?? '').trim()
  );
  if (emptyRequired) return 'check_fields';
  const unresolvedDropdown = input.fields.some(
    (f) => f.role === 'category' && f.options && f.options.length > 0 && !f.recommendedOption
  );
  if (unresolvedDropdown) return 'check_fields';
  const lowOrMed = input.fields.filter(
    (f) => f.required && (f.confidence === 'low' || f.confidence === 'medium')
  );
  if (lowOrMed.length > 0) return 'check_fields';
  const requiredHigh = input.fields.filter((f) => f.required);
  if (requiredHigh.some((f) => f.confidence !== 'high' && f.role !== 'terms')) {
    return 'check_fields';
  }
  return 'ready';
}

export function evaluateFingerprintStatus(input: {
  preparedAt: string;
  storedFingerprint: string;
  liveFingerprint: string | null;
  ttlDays?: number;
  now?: Date;
}): FingerprintStatus {
  const now = input.now ?? new Date();
  const prepared = new Date(input.preparedAt).getTime();
  const ttlMs = (input.ttlDays ?? ASSISTED_PACKAGE_TTL_DAYS) * 24 * 60 * 60 * 1000;
  if (Number.isFinite(prepared) && now.getTime() - prepared > ttlMs) return 'stale';
  if (input.liveFingerprint && input.liveFingerprint !== input.storedFingerprint) {
    return 'changed';
  }
  return 'fresh';
}

/** Token Jaccard similarity for cross-package uniqueness (§2.7). */
export function textSimilarity(a: string, b: string): number {
  const tok = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 2)
    );
  const A = tok(a);
  const B = tok(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function findSimilarPackagePairs(
  packages: Array<{ id: string; text: string }>,
  threshold = ASSISTED_SIMILARITY_THRESHOLD
): Array<{ a: string; b: string; score: number }> {
  const hits: Array<{ a: string; b: string; score: number }> = [];
  for (let i = 0; i < packages.length; i++) {
    for (let j = i + 1; j < packages.length; j++) {
      const score = textSimilarity(packages[i].text, packages[j].text);
      if (score >= threshold) {
        hits.push({ a: packages[i].id, b: packages[j].id, score });
      }
    }
  }
  return hits;
}

export function buildAssistedPackage(input: {
  recipe: SiteRecipe;
  content: ContentSource;
  preparedAt?: string;
  fingerprintStatus?: FingerprintStatus;
  formFound?: boolean;
  status?: PackageStatus;
}): AssistedPackagePayload {
  const preparedAt = input.preparedAt ?? new Date().toISOString();
  const fingerprintStatus = input.fingerprintStatus ?? 'fresh';
  const formFound = input.formFound !== false;
  const honestyNotes: string[] = [
    'Does not submit anything automatically.',
    'Does not solve CAPTCHA / OTP / login.',
    'Does not guarantee the listing goes live (directories moderate independently).',
    'Does not fully prepare multi-step forms.',
    'Does not attach images for you.',
  ];

  const fields: PackageFieldValue[] = input.recipe.fields.map((rf) => {
    if (rf.role === 'terms') {
      return {
        selector: rf.selector,
        role: rf.role,
        label: rf.label ?? 'Terms',
        value: '',
        charCount: 0,
        maxlength: null,
        required: rf.required,
        confidence: confidenceAfterValue(rf.role, rf.source, rf.confidence, ''),
        source: rf.source,
        overLimit: false,
        humanStep: 'Accept terms yourself — never pre-answered by the app.',
      };
    }
    if (rf.role === 'attachment') {
      const fileName = input.content.imageFileName ?? 'listing-image.jpg';
      const constraints = [
        rf.accept ? `accept ${rf.accept}` : null,
        rf.sizeHint ? `max ${rf.sizeHint}` : null,
      ]
        .filter(Boolean)
        .join(', ');
      return {
        selector: rf.selector,
        role: rf.role,
        label: rf.label ?? 'Upload',
        value: '',
        charCount: 0,
        maxlength: null,
        required: rf.required,
        confidence: confidenceAfterValue(rf.role, rf.source, rf.confidence, 'attach'),
        source: rf.source,
        overLimit: false,
        imageFileName: fileName,
        imageConstraints: constraints || null,
        humanStep: `Attach \`${fileName}\` to the ${rf.label ?? 'upload'} field${
          constraints ? ` (${constraints})` : ''
        }.`,
      };
    }
    if (rf.role === 'category' && rf.options?.length) {
      const recommended = recommendDropdownOption(
        rf.options,
        input.content.categoryHints ?? [input.content.businessName ?? '', 'Food', 'Business']
      );
      return {
        selector: rf.selector,
        role: rf.role,
        label: rf.label ?? 'Category',
        value: recommended ?? '',
        charCount: (recommended ?? '').length,
        maxlength: null,
        required: rf.required,
        confidence: confidenceAfterValue(
          rf.role,
          rf.source,
          rf.confidence,
          recommended ?? ''
        ),
        source: rf.source,
        options: rf.options,
        recommendedOption: recommended,
        overLimit: false,
        humanStep: recommended
          ? `Category: [${recommended}] ← recommended · ${rf.options.length - 1} other options available`
          : 'Pick a category from the real list.',
      };
    }

    const raw = valueForRole(rf.role, input.content);
    const fitted = fitValueToLimit(raw, rf.maxlength);
    return {
      selector: rf.selector,
      role: rf.role,
      label: rf.label ?? rf.role,
      value: fitted.value,
      charCount: fitted.value.length,
      maxlength: rf.maxlength,
      required: rf.required,
      confidence: confidenceAfterValue(rf.role, rf.source, rf.confidence, fitted.value),
      source: rf.source,
      overLimit: fitted.overLimit,
      truncatedAtSentence: fitted.truncatedAtSentence,
    };
  });

  const bucket = assignAssistedBucket({
    recipe: input.recipe,
    fields,
    fingerprintStatus,
    formFound,
  });

  let failureReason: string | null = null;
  if (fingerprintStatus === 'changed') {
    failureReason = 'Form changed — re-prepare';
  } else if (fingerprintStatus === 'stale') {
    failureReason = 'Package expired — re-prepare';
  } else if (input.recipe.multiStep) {
    failureReason = input.recipe.multiStepLabel ?? 'Multi-step form';
  } else if (!formFound) {
    failureReason = 'No form found';
  }

  const gateNotes =
    input.recipe.gate === 'otp_email'
      ? 'Email code will be sent to the address you enter — check inbox before submitting.'
      : input.recipe.gate === 'otp_phone'
        ? 'SMS code will be sent to the phone you enter — keep your phone ready.'
        : input.recipe.gate === 'captcha'
          ? 'CAPTCHA present — clear it yourself; the app will not solve it.'
          : input.recipe.gate === 'login'
            ? 'Login required — sign in yourself; the app will not bypass auth.'
            : input.recipe.gate === 'multi_step'
              ? honestyNotes[3]
              : 'No special gate detected beyond normal form submit.';

  return {
    entryUrl: input.recipe.entryUrl,
    domain: input.recipe.domain,
    formFingerprint: input.recipe.formFingerprint,
    preparedAt,
    fingerprintStatus,
    bucket,
    status: input.status ?? 'not_started',
    gate: input.recipe.gate,
    gateNotes,
    multiStep: input.recipe.multiStep,
    multiStepLabel: input.recipe.multiStepLabel ?? null,
    fields,
    honestyNotes,
    failureReason,
    readerVersion: input.recipe.readerVersion ?? ASSISTED_FORM_READER_VERSION,
    classifierVersion: input.recipe.classifierVersion ?? ASSISTED_FIELD_CLASSIFIER_VERSION,
  };
}

/** Static self-check: prepared mapping still matches live DOM facts (§2.1). */
export function verifyMappingAgainstDom(
  recipe: SiteRecipe,
  liveHtml: string
): { ok: boolean; mismatches: string[] } {
  const live = extractFormFieldFacts(liveHtml);
  const bySelector = new Map(live.map((f) => [f.selector, f]));
  const mismatches: string[] = [];
  for (const rf of recipe.fields) {
    const fact = bySelector.get(rf.selector);
    if (!fact) {
      mismatches.push(rf.selector);
      continue;
    }
    const inferred = inferFieldRole(fact);
    if (rf.source !== 'human_corrected' && inferred.role !== rf.role && rf.required) {
      mismatches.push(rf.selector);
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}
