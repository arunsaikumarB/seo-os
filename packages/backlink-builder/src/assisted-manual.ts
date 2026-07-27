import {
  confidenceGateSummary,
  selfCheckPackageFields,
} from './assisted-self-check.js';
import {
  detectFormHumanSteps,
  formatYouMustSteps,
  selectTargetForm,
} from './target-form.js';
import {
  CONTENT_SIMILARITY_THRESHOLD,
  fitDescriptionToCap,
  jaccardTokenSimilarity,
  maxPairwiseSimilarity,
  textsAreRepetitive,
} from './content-limits.js';
import {
  formUnavailableMessage,
} from './form-unavailable.js';

/**
 * Phase 7 — Assisted Manual packages (human submits; app never auto-publishes).
 * Pure logic: Form Reader, Site Recipes, packages, buckets, staleness, similarity.
 * Does NOT submit, solve gates, or change Auto/Manual routing (6.3.x).
 */

/** Soft guide for metrics dashboards — preparation is not capped. */
export const ASSISTED_MANUAL_PILOT_MAX = 10;
export const ASSISTED_PACKAGE_TTL_DAYS = 7;
/** Phase 12 — aligned with CONTENT_SIMILARITY_THRESHOLD (0.80). */
export const ASSISTED_SIMILARITY_THRESHOLD = CONTENT_SIMILARITY_THRESHOLD;
export { maxPairwiseSimilarity };
/** Safety ceiling per prepare request (not a product pilot cap). */
export const ASSISTED_PREPARE_BATCH_MAX = 500;

/**
 * Bump when Form Reader extraction changes (search filters, DOM fact shape, etc.).
 * Mismatched recipes re-read HTML and rebuild fields on prepare even if fingerprint matches.
 * v3: resolve submission page (SI strategy / bounded crawl) before reading.
 * v4: select ONE target <form> — never merge login/search widgets with the submit form.
 * v5: Playwright HTML fallback when HTTP is bot-blocked + homepage deep-seed for crawl.
 */
export const ASSISTED_FORM_READER_VERSION = 5;
/**
 * Bump when field-role / confidence rules change.
 * Mismatched recipes re-classify even when form fingerprint is unchanged.
 * v6: drop contradictory / legacy human_corrected pins; clear deletes pins.
 * v7: Phase 8 self-check + confidence gate (never high on role/value mismatch).
 * v8: Phase 9 role-value binding — no description fallback into url/name/email;
 *     owner/contact tokens map correctly; unknown long fields → other (empty).
 * v9: url only on text/url inputs (never LINK_TYPE selects); captcha as human step.
 * v10: category <select> omitted from packages entirely (team picks on live form).
 */
export const ASSISTED_FIELD_CLASSIFIER_VERSION = 10;

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
  | 'captcha'
  | 'other';

export type AssistedGate =
  | 'none'
  | 'captcha'
  | 'cloudflare'
  | 'registration'
  | 'otp_email'
  | 'otp_phone'
  | 'login'
  | 'manual_review'
  | 'multi_step';

/** OTP is one extra human step — Check these fields, not Needs a person / Ready. */
export function gateIsOtp(gate: AssistedGate | string | null | undefined): boolean {
  return String(gate ?? '').startsWith('otp_');
}

/**
 * Hard blockers — never paste-and-submit Ready; always Needs a person.
 * (OTP is excluded — see gateIsOtp / assignAssistedBucket.)
 */
export function gateRequiresPerson(gate: AssistedGate | string | null | undefined): boolean {
  const g = String(gate ?? 'none');
  if (g === 'none' || g === '' || gateIsOtp(g)) return false;
  return (
    g === 'login' ||
    g === 'captcha' ||
    g === 'cloudflare' ||
    g === 'registration' ||
    g === 'manual_review' ||
    g === 'multi_step'
  );
}

/** True when the package cannot be Ready (gate must be none). Includes OTP. */
export function gateBlocksReady(gate: AssistedGate | string | null | undefined): boolean {
  const g = String(gate ?? 'none');
  return g !== 'none' && g !== '';
}

export type AssistedBucket = 'ready' | 'check_fields' | 'needs_person';
export type PackageStatus = 'not_started' | 'in_progress' | 'done' | 'failed' | 'skipped';
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
  /** Imported / seed URL (may be a landing page). */
  entryUrl: string;
  /**
   * Actual submission form URL used for Form Reader + package Open link.
   * Cached per domain so discovery runs once.
   */
  resolvedFormUrl?: string | null;
  /** Paths/URLs checked during form discovery (honesty / debugging). */
  formDiscoveryPagesChecked?: string[];
  formDiscoverySource?:
    | 'cache'
    | 'site_intelligence'
    | 'entry'
    | 'crawl'
    | 'none'
    | null;
  formFingerprint: string;
  fields: RecipeField[];
  dropdownOptions: Record<string, string[]>;
  gate: AssistedGate;
  notes: string;
  lastVerifiedAt: string | null;
  correctionCount: number;
  multiStep: boolean;
  multiStepLabel?: string;
  /** Locked target <form> — re-reads prefer this form. */
  targetFormSelector?: string | null;
  targetFormIndex?: number | null;
  targetFormAction?: string | null;
  /** Captcha / agreement steps — not fillable fields. */
  humanSteps?: string[];
  /** Honest: Form Reader found no qualifying submission form. */
  formFound?: boolean;
  formFailureReason?: string | null;
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
  /** Phase 8 — self-check failed or classifier uncertain */
  flagged?: boolean;
  flagReason?: string | null;
};

export const MULTI_STEP_FORM_LABEL =
  'Multi-step — content ready, paste on the later step';

/** Shown when the live form has a category select — never auto-filled in packages. */
export const CATEGORY_PICK_YOURSELF_NOTE = 'Pick the category yourself on the site';

export type PasteReadyContentItem = {
  role: 'title' | 'short_desc' | 'long_desc' | 'url' | 'business_name' | 'email' | 'phone';
  label: string;
  value: string;
};

export type AssistedPackagePayload = {
  entryUrl: string;
  /** Original imported URL when different from the resolved form page. */
  importedEntryUrl?: string | null;
  resolvedFormUrl?: string | null;
  formDiscoveryPagesChecked?: string[];
  formDiscoverySource?: string | null;
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
  /** Unknown-role fields — fill yourself; not shown as forgotten blanks */
  otherFields?: Array<{
    selector: string;
    label: string;
    humanStep: string;
  }>;
  /**
   * Generated listing content ready to paste on a later wizard step
   * when step 1 has no title/desc/url fields (or multi-step in general).
   */
  pasteReadyContent?: PasteReadyContentItem[];
  /**
   * Intentional omission — category selects are never mapped or recommended.
   * Present only when the form has a category field the team must pick live.
   */
  categoryNote?: string | null;
  honestyNotes: string[];
  failureReason: string | null;
  /**
   * Form cannot be prepared in-app (SPA with no form after settle, or login-walled / no HTML).
   * Needs a person — Skip or open the site manually; Re-read will not help.
   */
  formUnavailable?: boolean;
  /** Phase 8 — e.g. "3 confident · 2 need a check" */
  confidenceSummary?: string | null;
  /** Captcha / agreement — "you must: …" */
  humanSteps?: string[];
  targetFormSelector?: string | null;
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
  const patterns = [
    /max(?:imum)?\s*(?:length|chars?|characters?)?\s*[:\s]*(\d+)/i,
    /(\d+)\s*(?:chars?|characters?)\b/i,
    /\(\s*(\d+)\s*(?:chars?|characters?|max)?\s*\)/i,
    /(?:limit|upto|up to)\s*[:\s]*(\d+)/i,
  ];
  for (const p of patterns) {
    const hint = p.exec(surrounding);
    if (hint) {
      const n = Number(hint[1]);
      if (n >= 10 && n <= 100_000) return n;
    }
  }
  return null;
}

function optionsFromSelect(block: string): string[] {
  const opts: string[] = [];
  const re = /<option[^>]*>([\s\S]*?)<\/option>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, '').trim();
    const val = attr(m[0], 'value');
    const label = sanitizeOptionLabel(text || val || '');
    if (label && !/^select\b/i.test(label) && !/^-+\s*$/.test(label)) opts.push(label);
  }
  return [...new Set(opts)];
}

/** Decode entities and strip directory indent markers (|__, &nbsp;, underscores). */
export function sanitizeOptionLabel(raw: string): string {
  let s = String(raw ?? '');
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    });
  s = s.replace(/\|+/g, ' ').replace(/_+/g, ' ').replace(/\u00a0/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
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

function surroundingSnippet(html: string, index: number, len = 220): string {
  const start = Math.max(0, index - 80);
  const end = Math.min(html.length, index + len);
  return html.slice(start, end).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Extract form fields as DOM facts from a single HTML fragment (one form or page). */
export function extractFormFieldFacts(html: string): FormFieldFacts[] {
  const fields: FormFieldFacts[] = [];
  const seen = new Set<string>();

  const push = (f: FormFieldFacts) => {
    if (isSearchOrNavField(f)) return;
    // Password fields belong to login widgets — never emit as fill targets
    if (f.type === 'password') return;
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

/**
 * Phase 10 — extract fields from the single target submission form only.
 * Login / search / newsletter forms are disqualified, never merged.
 */
export function extractTargetFormFieldFacts(
  pageHtml: string,
  opts?: {
    lockedSelector?: string | null;
    lockedIndex?: number | null;
  }
): {
  fields: FormFieldFacts[];
  formFound: boolean;
  failureReason: string | null;
  targetFormSelector: string | null;
  targetFormIndex: number | null;
  targetFormAction: string | null;
  targetFormHtml: string | null;
  humanSteps: string[];
  gateHtml: string;
} {
  const pick = selectTargetForm(pageHtml, {
    lockedSelector: opts?.lockedSelector,
    lockedIndex: opts?.lockedIndex,
  });

  if (!pick.formFound || !pick.form) {
    return {
      fields: [],
      formFound: false,
      failureReason: pick.failureReason,
      targetFormSelector: null,
      targetFormIndex: null,
      targetFormAction: null,
      targetFormHtml: null,
      humanSteps: [],
      gateHtml: pageHtml,
    };
  }

  const formHtml = pick.form.fullHtml;
  const fields = extractFormFieldFacts(formHtml);
  const humanSteps = detectFormHumanSteps(formHtml);

  return {
    fields,
    formFound: fields.length > 0,
    failureReason:
      fields.length === 0
        ? 'No submission form found — target form had no fillable fields'
        : null,
    targetFormSelector: pick.form.selector,
    targetFormIndex: pick.form.index,
    targetFormAction: pick.form.action,
    targetFormHtml: formHtml,
    humanSteps,
    gateHtml: formHtml,
  };
}

export function detectMultiStepForm(html: string): boolean {
  const h = html.toLowerCase();
  if (/\bstep\s*[1-9]\s*(of|\/)\s*[2-9]/i.test(h)) return true;
  // "Step One: Choose a Category" / "Step Two" wording (tagshub-style)
  if (/\bstep\s+(one|two|three|four|1|2|3|4)\b/i.test(h) && /step\s+(two|three|four|2|3|4)\b/i.test(h)) {
    return true;
  }
  if (/\bstep\s+one\b/i.test(h) && /(go\s+to|next|continue|proceed)/i.test(h)) return true;
  if (/go\s+to\s+step\s*(two|2|three|3|four|4)/i.test(h)) return true;
  if (
    /<(button|a|input)[^>]*(value|aria-label)=["'][^"']*(go\s+to\s+step|next\s+step|continue)[^"']*["']/i.test(
      html
    )
  ) {
    return true;
  }
  if (/<(button|a|input)[^>]*>\s*(next|continue|proceed|go\s+to\s+step)\s*</i.test(html)) {
    return true;
  }
  if (/wizard|multi-?step| steppers? /i.test(h)) return true;
  if (/data-step=["'][2-9]/i.test(h)) return true;
  return false;
}

/** True when step 1 looks like category/nav only — content fields appear later. */
export function isContentSparseStepOne(fields: Array<{ role: string }>): boolean {
  const contentRoles = new Set(['title', 'short_desc', 'long_desc', 'url', 'business_name']);
  const hasContent = fields.some((f) => contentRoles.has(f.role));
  const hasCategoryOrNav = fields.some(
    (f) => f.role === 'category' || f.role === 'other' || f.role === 'terms'
  );
  return !hasContent && (hasCategoryOrNav || fields.length === 0);
}

export function detectGateFromHtml(html: string): AssistedGate {
  const h = html.toLowerCase();
  if (detectMultiStepForm(html)) return 'multi_step';
  if (/cloudflare|cf-challenge|cf-turnstile|attention required|checking your browser/i.test(h)) {
    return 'cloudflare';
  }
  if (/recaptcha|hcaptcha|g-recaptcha|captcha|security.?code|enter the code/i.test(h)) {
    return 'captcha';
  }
  if (/one[- ]?time|otp|verification code|enter the code/i.test(h) && /email/i.test(h)) {
    return 'otp_email';
  }
  if (/sms|phone.*(code|verify)|text.*(code|verify)/i.test(h)) return 'otp_phone';
  // Login/registration only when THIS fragment has a password field
  if (/type=["']password["']/i.test(h)) {
    if (/sign\s*up|create\s*(an?\s*)?account|register|registration/i.test(h)) {
      return 'registration';
    }
    if (/login|sign\s*in|log\s*in|remember.?me|password/i.test(h)) {
      return 'login';
    }
    return 'login';
  }
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
  // Treat underscores as separators so OWNER_NAME / owner_email → owner / email
  const normalized = primary.replace(/_/g, ' ');
  const word = normalized.split(/[\s:–—|/\\]+/).find((w) => /[a-z]/i.test(w)) ?? '';
  return word.toLowerCase().replace(/[^a-z0-9-]/gi, '');
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

/** True when a control can genuinely hold a website URL value. */
export function isUrlCapableControl(facts: FormFieldFacts): boolean {
  const t = (facts.type || 'text').toLowerCase();
  return t === 'text' || t === 'url' || t === '';
}

/** Leading-token → role. URL only for URL/Website (text/url inputs — never selects). */
function roleFromLeadingToken(
  token: string,
  facts: FormFieldFacts
): FieldRole | null {
  const blob = [facts.label, facts.name, facts.id, facts.placeholder]
    .filter(Boolean)
    .join(' ');
  // Compound owner/contact attrs win before bare "owner" → name
  if (/owner[_\s-]?email|contact[_\s-]?email/i.test(blob)) return 'email';
  if (
    /owner[_\s-]?name|contact[_\s-]?name|contact[_\s-]?person|full[_\s-]?name|your[_\s-]?name/i.test(
      blob
    )
  ) {
    return 'name';
  }
  if (/captcha|security.?code|seccode|verify.?code|human.?check/i.test(blob)) {
    return 'captcha';
  }
  if (!token) return null;
  if (/^(title|headline)$/i.test(token)) return 'title';
  if (/^(name)$/i.test(token) && !/company|business|site/i.test(facts.label ?? '')) {
    if (/owner|contact|person|full.?name|your.?name/i.test(blob)) return 'name';
    return 'title';
  }
  if (
    /^(description|about|summary|tagline|blurb|excerpt|details|bio|content|message|notes|article)$/i.test(
      token
    )
  ) {
    return descriptionRoleFromControl(facts);
  }
  // url / website / homepage — never from bare "link" (LINK_TYPE selects)
  if (/^(url|website|homepage)$/i.test(token)) {
    return isUrlCapableControl(facts) ? 'url' : null;
  }
  if (/^(link)$/i.test(token)) {
    // "Link" / LINK_TYPE on a select is not a URL field
    return isUrlCapableControl(facts) ? 'url' : null;
  }
  if (/^(email|e-?mail)$/i.test(token)) return 'email';
  if (/^(phone|mobile|tel)$/i.test(token)) return 'phone';
  if (/^(owner|contact|person)$/i.test(token)) return 'name';
  if (/^(company|business|organization|org)$/i.test(token)) return 'business_name';
  if (/^(category|industry|type|topic|niche)$/i.test(token)) return 'category';
  if (/^(address|street|city|zip|postal)$/i.test(token)) return 'address';
  if (/^(logo|image|photo|file|upload|attach)$/i.test(token)) return 'attachment';
  if (/^(terms|agree|privacy|consent)$/i.test(token)) return 'terms';
  if (/^(captcha|seccode)$/i.test(token)) return 'captcha';
  return null;
}

const ROLE_HINTS: Array<{ role: FieldRole; patterns: RegExp[] }> = [
  { role: 'email', patterns: [/e-?mail/i, /^email$/i, /owner.?email/i, /contact.?email/i] },
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
  { role: 'title', patterns: [/^title$/i, /^headline$/i, /^listing.?name$/i, /^site.?name$/i] },
  { role: 'business_name', patterns: [/company|business|organization|org.?name|trading.?name/i] },
  {
    role: 'name',
    patterns: [
      /full.?name|your.?name|contact.?name|first.?name|last.?name|owner.?name|contact.?person|owner$/i,
    ],
  },
  {
    role: 'short_desc',
    patterns: [
      /^short\s*desc/i,
      /short\s+description/i,
      /^tagline$/i,
      /^summary$/i,
      /^blurb$/i,
      /^excerpt$/i,
    ],
  },
  {
    role: 'long_desc',
    patterns: [
      /^desc/i,
      /description/i,
      /^about$/i,
      /^message$/i,
      /^body$/i,
      /^content$/i,
      /^details$/i,
      /^bio$/i,
      /\bnotes\b/i,
    ],
  },
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

  const captchaBlob = [facts.label, facts.name, facts.id, facts.placeholder]
    .filter(Boolean)
    .join(' ');
  // Do NOT use surroundingText — a nearby g-recaptcha widget must not mark Title as captcha
  if (/captcha|security.?code|seccode|verify.?code|human.?check/i.test(captchaBlob)) {
    return {
      role: 'captcha',
      confidence: 'high',
      source: hasExplicitLabel ? 'dom_label' : 'name_guess',
    };
  }

  if (facts.type === 'file') {
    return {
      role: 'attachment',
      confidence: hasExplicitLabel ? 'high' : 'medium',
      source: hasExplicitLabel ? 'dom_label' : 'name_guess',
    };
  }
  if (facts.type === 'checkbox' && /terms|agree|privacy|rules|consent/i.test(text + captchaBlob)) {
    return { role: 'terms', confidence: 'high', source: 'dom_label' };
  }
  if (facts.type === 'email') {
    return {
      role: 'email',
      confidence: hasExplicitLabel ? 'high' : 'medium',
      source: hasExplicitLabel ? 'dom_label' : 'name_guess',
    };
  }

  // Selects are never URL fields (LINK_TYPE / link-type dropdowns)
  if (facts.type === 'select' || facts.options.length > 0) {
    const fromLeadSelect = roleFromLeadingToken(leading, facts);
    if (fromLeadSelect === 'category' || /categor|industry|topic|niche/i.test(primary || text)) {
      return {
        role: 'category',
        confidence: hasExplicitLabel ? 'high' : 'medium',
        source: hasExplicitLabel ? 'dom_label' : 'llm_inferred',
      };
    }
    if (fromLeadSelect && fromLeadSelect !== 'url') {
      return {
        role: fromLeadSelect,
        confidence: leadingFromLabel ? 'high' : 'medium',
        source: leadSource,
      };
    }
    // LINK_TYPE / "link" select → other (empty), never paste the website URL
    if (
      /link.?type|link_type|^link$/i.test([facts.name, facts.id, primary].filter(Boolean).join(' '))
    ) {
      return { role: 'other', confidence: 'medium', source: leadSource };
    }
    if (facts.type === 'select') {
      return {
        role: 'other',
        confidence: 'low',
        source: hasExplicitLabel ? 'dom_label' : 'name_guess',
      };
    }
  }

  // Textarea / long maxlength → description family ONLY when the label says so.
  // Never remap an explicit email/name/phone label into a description.
  // URL leading token on a long control ("Website notes") is notes, not a URL field.
  if (isLongTextControl(facts)) {
    const fromLead = roleFromLeadingToken(leading, facts);
    if (fromLead === 'short_desc' || fromLead === 'long_desc') {
      return {
        role: descriptionRoleFromControl(facts),
        confidence: 'high',
        source: leadSource,
      };
    }
    if (fromLead === 'title' && facts.type === 'textarea') {
      return {
        role: descriptionRoleFromControl(facts),
        confidence: 'high',
        source: leadSource,
      };
    }
    // Textarea (or notes-style label) with "website" in the name ≠ URL field.
    // Plain text inputs labeled URL/Website keep url even when maxlength is large.
    if (
      fromLead === 'url' &&
      (facts.type === 'textarea' ||
        /\b(notes|about|description|details|comment)\b/i.test(primary || text))
    ) {
      return {
        role: descriptionRoleFromControl(facts),
        confidence: 'medium',
        source: leadSource,
      };
    }
    if (fromLead === 'url' && !isUrlCapableControl(facts)) {
      return {
        role: 'other',
        confidence: 'low',
        source: leadSource,
      };
    }
    if (fromLead) {
      return {
        role: fromLead,
        confidence: leadingFromLabel ? 'high' : 'medium',
        source: leadSource,
      };
    }
    // Labeled long control: try description / other known roles before empty other
    const hay = primary || text;
    for (const hint of ROLE_HINTS) {
      if (hint.role === 'url') continue;
      if (hay && hint.patterns.some((p) => p.test(hay))) {
        const role =
          hint.role === 'short_desc' || hint.role === 'long_desc'
            ? descriptionRoleFromControl(facts)
            : hint.role;
        return {
          role,
          confidence: 'medium',
          source: hasExplicitLabel ? 'dom_label' : 'name_guess',
        };
      }
    }
    // Unknown long control → other (empty fill), never dump the description into it
    return {
      role: 'other',
      confidence: 'low',
      source: hasExplicitLabel ? 'dom_label' : 'name_guess',
    };
  }

  // Leading token wins (Title…website helper → title, not url)
  // Explicit label token outranks type=url and name/id
  const fromLead = roleFromLeadingToken(leading, facts);
  if (fromLead === 'url' && !isUrlCapableControl(facts)) {
    return {
      role: 'other',
      confidence: 'low',
      source: leadSource,
    };
  }
  if (fromLead) {
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

  // name/id alone may still indicate url — never when an explicit label exists,
  // and never for select / non-text controls
  if (
    isUrlCapableControl(facts) &&
    !hasExplicitLabel &&
    !leading &&
    (roleFromLeadingToken(leadingFromAttr, facts) === 'url' ||
      /^(website|url|homepage)(_|$)/i.test(facts.name ?? '') ||
      /^(website|url|homepage)(_|$)/i.test(facts.id ?? ''))
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
  if (role === 'terms' || role === 'attachment' || role === 'captcha') return base;
  if (role === 'other') return 'low';
  if (!String(value ?? '').trim()) return 'low';
  if (source === 'name_guess' && base === 'high') return 'low';
  if (source === 'name_guess' && base === 'medium') return 'low';
  return base;
}

/** Build or merge a Site Recipe from Form Reader facts. */
export function buildSiteRecipe(input: {
  domain: string;
  /** Imported / seed URL. */
  entryUrl: string;
  html: string;
  existing?: SiteRecipe | null;
  /** Actual form page URL (Open package + re-read target). */
  resolvedFormUrl?: string | null;
  formDiscoveryPagesChecked?: string[];
  formDiscoverySource?: SiteRecipe['formDiscoverySource'];
  /**
   * When true (classifier upgrade or user force re-read), re-infer every non-human field
   * even if the form fingerprint matches the stored recipe.
   */
  forceReclassify?: boolean;
  /** When true, ignore all human_corrected / known_bad pins (Clear corrections). */
  dropHumanPins?: boolean;
}): SiteRecipe {
  const target = extractTargetFormFieldFacts(input.html, {
    lockedSelector: input.existing?.targetFormSelector,
    lockedIndex: input.existing?.targetFormIndex,
  });
  const facts = target.fields;
  const fingerprint = computeFormFingerprint(facts);
  const gateSource = target.gateHtml || input.html;
  // Detect on form fragment AND full page (step headings often sit outside <form>)
  const multiStep =
    detectMultiStepForm(gateSource) || detectMultiStepForm(input.html);
  // Cloudflare can be page-level; other gates come from the target form only
  const pageGate = detectGateFromHtml(input.html);
  const formGate = detectGateFromHtml(gateSource);
  // When no submission form qualifies, do not inherit login gate from a sibling widget
  const gate =
    !target.formFound
      ? 'none'
      : pageGate === 'cloudflare'
        ? 'cloudflare'
        : formGate !== 'none'
          ? formGate
          : pageGate === 'captcha'
            ? 'captcha'
            : 'none';
  const humanSteps = [
    ...(target.humanSteps ?? []),
    ...detectFormHumanSteps(gateSource),
  ].filter((s, i, a) => a.indexOf(s) === i);

  const versionStale = !recipeVersionsCurrent(input.existing);
  const forceReclassify = Boolean(input.forceReclassify) || versionStale;
  const dropPins = Boolean(input.dropHumanPins);

  const existingBySelector = new Map(
    (dropPins ? [] : input.existing?.fields ?? [])
      .filter((f) => f.source === 'human_corrected')
      .map((f) => [f.selector, f] as const)
  );

  // Recipe fields exclude captcha/terms — those become humanSteps only
  const fields: RecipeField[] = facts
    .map((f) => {
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
    })
    .filter((f) => f.role !== 'captcha' && f.role !== 'terms');

  // Ensure agreement/captcha still surface even if widgets aren't input fields
  const ensuredSteps = [...humanSteps];
  if (gate === 'captcha' && !ensuredSteps.some((s) => /code/i.test(s))) {
    ensuredSteps.push('enter the code shown');
  }
  if (
    /terms|agree|submission.?rules/i.test(gateSource) &&
    !ensuredSteps.some((s) => /agreement|tick/i.test(s))
  ) {
    ensuredSteps.push('tick the submission-rules agreement');
  }

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

  const formNote = target.formFound
    ? target.targetFormSelector
      ? `Target form: ${target.targetFormSelector}`
      : null
    : target.failureReason;

  return {
    domain: input.domain,
    entryUrl: input.entryUrl,
    resolvedFormUrl:
      input.resolvedFormUrl ??
      input.existing?.resolvedFormUrl ??
      input.entryUrl,
    formDiscoveryPagesChecked:
      input.formDiscoveryPagesChecked ?? input.existing?.formDiscoveryPagesChecked,
    formDiscoverySource:
      input.formDiscoverySource ?? input.existing?.formDiscoverySource ?? null,
    formFingerprint: fingerprint,
    fields,
    dropdownOptions,
    gate: multiStep ? 'multi_step' : gate,
    notes: multiStep
      ? MULTI_STEP_FORM_LABEL
      : [input.existing?.notes, upgradeNote, formNote].filter(Boolean).join(' · ') || '',
    lastVerifiedAt: new Date().toISOString(),
    correctionCount: dropPins ? 0 : (input.existing?.correctionCount ?? 0),
    multiStep,
    multiStepLabel: multiStep ? MULTI_STEP_FORM_LABEL : undefined,
    targetFormSelector: target.targetFormSelector,
    targetFormIndex: target.targetFormIndex,
    targetFormAction: target.targetFormAction,
    humanSteps: ensuredSteps,
    formFound: target.formFound,
    formFailureReason: target.failureReason,
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

export function looksLikeCategoryFieldLabel(label: string): boolean {
  return /categor|industry|^type$|topic|niche/i.test(String(label ?? '').trim());
}

/**
 * Remove category fields from an existing package payload and recompute bucket.
 * Category is never recommended and never blocks Ready / Check these fields.
 */
export function stripCategoryFromAssistedPayload(
  payload: AssistedPackagePayload
): { payload: AssistedPackagePayload; changed: boolean } {
  const hadCategoryField = payload.fields.some((f) => f.role === 'category');
  const nextFields = payload.fields.filter((f) => f.role !== 'category');
  const prevOther = payload.otherFields ?? [];
  const nextOther = prevOther.filter((o) => !looksLikeCategoryFieldLabel(o.label));
  const hadCategoryOther = nextOther.length !== prevOther.length;
  const wantNote = hadCategoryField || hadCategoryOther || Boolean(payload.categoryNote);
  const nextNote = wantNote ? CATEGORY_PICK_YOURSELF_NOTE : null;

  const formFound = payload.formUnavailable !== true;
  const nextBucket = assignAssistedBucket({
    recipe: {
      gate: payload.gate,
      multiStep: payload.multiStep,
    } as SiteRecipe,
    fields: nextFields,
    fingerprintStatus: payload.fingerprintStatus,
    formFound,
  });

  const changed =
    hadCategoryField ||
    hadCategoryOther ||
    nextBucket !== payload.bucket ||
    (nextNote ?? null) !== (payload.categoryNote ?? null);

  if (!changed) return { payload, changed: false };

  return {
    changed: true,
    payload: {
      ...payload,
      fields: nextFields,
      otherFields: nextOther.length ? nextOther : undefined,
      categoryNote: nextNote,
      bucket: nextBucket,
    },
  };
}

export type ContentSource = {
  title?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
  metaDescription?: string | null;
  businessName?: string | null;
  /** Company / trading name for business_name fields */
  companyName?: string | null;
  /** Person / owner / contact name — never the brand description */
  contactName?: string | null;
  url?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  /** @deprecated Category is never auto-matched; ignored by package builder. */
  categoryHints?: string[];
  imageFileName?: string | null;
  /** Cross-package uniqueness failed after max attempts */
  contentTooSimilar?: boolean;
};

/**
 * Phase 9 hard rule: a field only gets a value that matches its type.
 * Missing profile data → empty (never fall back to the description paragraph).
 * Content fields (title / short_desc / long_desc) always bind generated copy when present —
 * optional / "leave blank to auto-fetch" labels must NOT leave them empty.
 */
export function valueForRole(role: FieldRole, content: ContentSource): string {
  switch (role) {
    case 'title':
      return String(content.title ?? '').trim();
    case 'business_name':
      return String(content.companyName || content.businessName || '').trim();
    case 'short_desc':
      // Prefer short/meta — do not paste longDescription (cross-field reuse).
      return String(content.shortDescription || content.metaDescription || '').trim();
    case 'long_desc':
      // Prefer long; fall back to short only when long is empty (single Description field forms).
      return String(
        content.longDescription ||
          content.shortDescription ||
          content.metaDescription ||
          ''
      ).trim();
    case 'url':
      return String(content.url ?? '').trim();
    case 'email':
      return String(content.email ?? '').trim();
    case 'phone':
      return String(content.phone ?? '').trim();
    case 'address':
      return String(content.address ?? '').trim();
    case 'name':
      return String(content.contactName ?? '').trim();
    case 'category':
    case 'attachment':
    case 'terms':
    case 'other':
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
  // Hard gates (login/captcha/cloudflare/registration/multi_step) → Needs a person
  if (gateRequiresPerson(input.recipe.gate) || input.recipe.multiStep) {
    return 'needs_person';
  }
  if (input.fields.some((f) => f.overLimit)) return 'needs_person';
  const emptyRequired = input.fields.some(
    (f) =>
      f.required &&
      f.role !== 'terms' &&
      f.role !== 'attachment' &&
      f.role !== 'category' &&
      !String(f.value ?? '').trim()
  );
  if (emptyRequired) return 'check_fields';
  // Phase 8 — any flagged / self-check failure → Check these fields (never Ready)
  // Category is never packaged; ignore leftover category flags on legacy payloads.
  if (input.fields.some((f) => f.flagged && f.role !== 'category')) return 'check_fields';
  const lowOrMed = input.fields.filter(
    (f) =>
      f.required &&
      f.role !== 'category' &&
      (f.confidence === 'low' || f.confidence === 'medium')
  );
  if (lowOrMed.length > 0) return 'check_fields';
  const requiredHigh = input.fields.filter((f) => f.required && f.role !== 'category');
  if (requiredHigh.some((f) => f.confidence !== 'high' && f.role !== 'terms')) {
    return 'check_fields';
  }
  // OTP: still paste-and-submit + one code step — Check these fields (with gate warning)
  if (gateIsOtp(input.recipe.gate)) return 'check_fields';
  // Ready only when gate is explicitly none
  if (input.recipe.gate !== 'none') return 'needs_person';
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

/** Token Jaccard similarity for cross-package uniqueness (§2.7 / Phase 12). */
export function textSimilarity(a: string, b: string): number {
  return jaccardTokenSimilarity(a, b);
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

/**
 * Listing copy the user can paste on a later wizard step when step 1
 * has no mapped title/desc/url fields (or the form is multi-step).
 */
export function buildPasteReadyContent(
  content: ContentSource,
  mappedRoles: Set<string>
): PasteReadyContentItem[] {
  const candidates: Array<{
    role: PasteReadyContentItem['role'];
    label: string;
    value: string;
  }> = [
    { role: 'title', label: 'Title', value: String(content.title ?? '').trim() },
    {
      role: 'business_name',
      label: 'Business name',
      value: String(content.companyName || content.businessName || '').trim(),
    },
    {
      role: 'short_desc',
      label: 'Short description',
      value: String(content.shortDescription || content.metaDescription || '').trim(),
    },
    {
      role: 'long_desc',
      label: 'Description',
      value: String(
        content.longDescription || content.shortDescription || content.metaDescription || ''
      ).trim(),
    },
    { role: 'url', label: 'URL', value: String(content.url ?? '').trim() },
    { role: 'email', label: 'Email', value: String(content.email ?? '').trim() },
    { role: 'phone', label: 'Phone', value: String(content.phone ?? '').trim() },
  ];

  const out: PasteReadyContentItem[] = [];
  const seenValues = new Set<string>();
  for (const c of candidates) {
    if (!c.value) continue;
    // Skip roles already mapped onto a real step-1 field (user already has a card)
    if (mappedRoles.has(c.role)) continue;
    // Avoid duplicate short/long when identical
    const key = `${c.role}:${c.value}`;
    if (seenValues.has(c.value) && (c.role === 'short_desc' || c.role === 'long_desc')) {
      continue;
    }
    seenValues.add(c.value);
    out.push({ role: c.role, label: c.label, value: c.value });
    void key;
  }
  return out;
}

export function buildAssistedPackage(input: {
  recipe: SiteRecipe;
  content: ContentSource;
  preparedAt?: string;
  fingerprintStatus?: FingerprintStatus;
  formFound?: boolean;
  status?: PackageStatus;
  /** Honest discovery failure (overrides bare "No form found"). */
  discoveryFailureReason?: string | null;
}): AssistedPackagePayload {
  const preparedAt = input.preparedAt ?? new Date().toISOString();
  const fingerprintStatus = input.fingerprintStatus ?? 'fresh';
  const formFound = input.formFound !== false;
  const honestyNotes: string[] = [
    'Does not submit anything automatically.',
    'Does not solve CAPTCHA / OTP / login.',
    'Does not guarantee the listing goes live (directories moderate independently).',
    'Multi-step forms: content is prepared for later steps — you navigate and paste.',
    'Does not attach images for you.',
  ];

  const openUrl =
    input.recipe.resolvedFormUrl?.trim() ||
    input.recipe.entryUrl;

  const PROFILE_ROLES = new Set(['url', 'email', 'phone', 'name', 'business_name', 'address']);
  const CONTENT_ROLES = new Set(['title', 'short_desc', 'long_desc']);
  const usedTitles = new Set<string>();
  const usedDescs = new Set<string>();
  const otherFields: NonNullable<AssistedPackagePayload['otherFields']> = [];

  const mappedFields: PackageFieldValue[] = [];
  let formHasCategoryField = false;
  for (const rf of input.recipe.fields) {
    // Category selects are never mapped, recommended, or listed — team picks on the live form.
    if (rf.role === 'category') {
      formHasCategoryField = true;
      continue;
    }
    if (rf.role === 'attachment') {
      const fileName = input.content.imageFileName ?? 'listing-image.jpg';
      const constraints = [
        rf.accept ? `accept ${rf.accept}` : null,
        rf.sizeHint ? `max ${rf.sizeHint}` : null,
      ]
        .filter(Boolean)
        .join(', ');
      mappedFields.push({
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
      });
      continue;
    }

    // Unknown / other → list under "other fields", not as blank content slots
    if (rf.role === 'other' || rf.source === 'known_bad') {
      if (looksLikeCategoryFieldLabel(rf.label ?? '')) {
        formHasCategoryField = true;
        continue;
      }
      otherFields.push({
        selector: rf.selector,
        label: rf.label ?? rf.role,
        humanStep: 'you fill this — unknown field role (app will not invent a value)',
      });
      continue;
    }

    let raw = valueForRole(rf.role, input.content);
    // Description caps: ≤200 or smaller form maxlength
    if (rf.role === 'short_desc' || rf.role === 'long_desc') {
      const capped = fitDescriptionToCap(raw, rf.maxlength);
      raw = capped.value;
    } else if (rf.maxlength != null && rf.maxlength > 0) {
      const fitted = fitValueToLimit(raw, rf.maxlength);
      raw = fitted.value;
    }

    // Intra-package: avoid desc↔desc repeats. Never blank a description because it shares
    // a brand/title prefix — and never leave optional / auto-fetch labeled fields empty.
    const norm = raw.replace(/\s+/g, ' ').trim().toLowerCase();
    if (rf.role === 'title' && norm) {
      if (usedTitles.has(norm)) {
        raw = '';
      } else {
        usedTitles.add(norm);
      }
    } else if ((rf.role === 'short_desc' || rf.role === 'long_desc') && raw) {
      let clashes = false;
      for (const prev of usedDescs) {
        if (norm === prev || textsAreRepetitive(raw, prev)) {
          clashes = true;
          break;
        }
      }
      if (clashes) {
        const altRaw =
          rf.role === 'long_desc'
            ? String(
                input.content.shortDescription || input.content.metaDescription || ''
              ).trim()
            : String(
                input.content.longDescription || input.content.metaDescription || ''
              ).trim();
        const alt = fitDescriptionToCap(altRaw, rf.maxlength).value;
        const altNorm = alt.replace(/\s+/g, ' ').trim().toLowerCase();
        if (
          alt &&
          altNorm !== norm &&
          ![...usedDescs].some((p) => textsAreRepetitive(alt, p))
        ) {
          raw = alt;
        }
        // else keep raw — empty content is a defect; mild overlap is better
      }
      const keepNorm = raw.replace(/\s+/g, ' ').trim().toLowerCase();
      if (keepNorm) usedDescs.add(keepNorm);
    }

    const fitted = fitValueToLimit(raw, rf.maxlength);
    const empty = !fitted.value.trim();
    const isProfile = PROFILE_ROLES.has(rf.role);
    const isContent = CONTENT_ROLES.has(rf.role);

    if (isProfile && empty) {
      mappedFields.push({
        selector: rf.selector,
        role: rf.role,
        label: rf.label ?? rf.role,
        value: '',
        charCount: 0,
        maxlength: rf.maxlength,
        required: rf.required,
        confidence: 'low',
        source: rf.source,
        overLimit: false,
        flagged: true,
        flagReason: `No project ${rf.role} on file — add it in Settings`,
        humanStep: 'you fill this',
      });
      continue;
    }

    if (isContent && empty) {
      mappedFields.push({
        selector: rf.selector,
        role: rf.role,
        label: rf.label ?? rf.role,
        value: '',
        charCount: 0,
        maxlength: rf.maxlength,
        required: rf.required,
        confidence: 'low',
        source: rf.source,
        overLimit: false,
        flagged: true,
        flagReason: 'Content field empty — regenerate package (defect)',
        humanStep: 'Content missing — re-prepare or edit',
      });
      continue;
    }

    if (rf.confidence === 'low' && !isProfile && !isContent && empty) {
      if (looksLikeCategoryFieldLabel(rf.label ?? rf.role)) {
        formHasCategoryField = true;
        continue;
      }
      otherFields.push({
        selector: rf.selector,
        label: rf.label ?? rf.role,
        humanStep: 'you fill this — low-confidence mapping',
      });
      continue;
    }

    mappedFields.push({
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
      flagged: fitted.overLimit || undefined,
      flagReason: fitted.overLimit ? 'Truncated to field limit at a sentence/word boundary' : null,
    });
  }

  // Phase 8 — self-check + confidence gate before bucket / ship
  const checkedFields = selfCheckPackageFields(mappedFields);
  const confSummary = confidenceGateSummary(checkedFields);

  const mappedRoles = new Set(checkedFields.map((f) => f.role));
  const multiStep =
    Boolean(input.recipe.multiStep) || input.recipe.gate === 'multi_step';
  const sparseStepOne = isContentSparseStepOne(input.recipe.fields);
  // Always attach generated listing copy when we have it — especially Needs a person /
  // multi-step / form-not-found, so the user never gets an empty card.
  const pasteReadyContent = buildPasteReadyContent(input.content, mappedRoles);

  const multiStepLabel = multiStep
    ? input.recipe.multiStepLabel?.trim() || MULTI_STEP_FORM_LABEL
    : null;

  let bucket = assignAssistedBucket({
    recipe: input.recipe,
    fields: checkedFields,
    fingerprintStatus,
    formFound,
  });
  if (input.content.contentTooSimilar) {
    bucket = 'needs_person';
  }

  let failureReason: string | null = null;
  let formUnavailable = false;
  if (!formFound) {
    // Still ship paste-ready content for multi-step / sparse / any generated copy.
    // Only mark formUnavailable when we truly have nothing useful for the user.
    if (multiStep || sparseStepOne || pasteReadyContent.length > 0) {
      formUnavailable = false;
      failureReason = multiStep
        ? multiStepLabel ?? MULTI_STEP_FORM_LABEL
        : input.discoveryFailureReason?.trim() ||
          (pasteReadyContent.length
            ? 'Needs a person — content ready to paste on the site'
            : null);
    } else {
      formUnavailable = true;
      failureReason = formUnavailableMessage(
        input.discoveryFailureReason?.trim() ||
          input.recipe.formFailureReason?.trim() ||
          null
      );
    }
  } else if (input.content.contentTooSimilar) {
    failureReason =
      'content_too_similar — description too close to another package after 3 regenerations';
  } else if (fingerprintStatus === 'changed') {
    failureReason = 'Form changed — re-prepare';
  } else if (fingerprintStatus === 'stale') {
    failureReason = 'Package expired — re-prepare';
  } else if (multiStep) {
    failureReason = multiStepLabel ?? MULTI_STEP_FORM_LABEL;
  } else if (gateRequiresPerson(input.recipe.gate)) {
    failureReason = `Gate: ${input.recipe.gate} — needs a person (not paste-and-submit Ready)`;
  } else if (gateIsOtp(input.recipe.gate)) {
    failureReason =
      input.recipe.gate === 'otp_phone'
        ? 'SMS confirmation code required after submit — keep your phone ready.'
        : 'Email confirmation code required after submit — check inbox before finishing.';
  }

  const youMust = formatYouMustSteps(input.recipe.humanSteps ?? []);
  const gateNotesBase =
    input.recipe.gate === 'otp_email'
      ? 'Email code will be sent to the address you enter — check inbox before submitting.'
      : input.recipe.gate === 'otp_phone'
        ? 'SMS code will be sent to the phone you enter — keep your phone ready.'
        : input.recipe.gate === 'captcha'
          ? 'CAPTCHA present — clear it yourself; the app will not solve it.'
          : input.recipe.gate === 'cloudflare'
            ? 'Cloudflare / anti-bot challenge — clear it yourself; the app will not bypass it.'
            : input.recipe.gate === 'login'
              ? 'Login required — sign in yourself; the app will not bypass auth.'
              : input.recipe.gate === 'registration'
                ? 'Registration required — create an account yourself; the app will not sign up.'
                : multiStep
                  ? MULTI_STEP_FORM_LABEL
                  : 'No special gate detected beyond normal form submit.';
  const gateNotes = youMust ? `${gateNotesBase} · ${youMust}` : gateNotesBase;

  return {
    entryUrl: openUrl,
    importedEntryUrl:
      input.recipe.entryUrl !== openUrl ? input.recipe.entryUrl : null,
    resolvedFormUrl: input.recipe.resolvedFormUrl ?? openUrl,
    formDiscoveryPagesChecked: input.recipe.formDiscoveryPagesChecked,
    formDiscoverySource: input.recipe.formDiscoverySource ?? null,
    domain: input.recipe.domain,
    formFingerprint: input.recipe.formFingerprint,
    preparedAt,
    fingerprintStatus,
    bucket,
    status: input.status ?? 'not_started',
    gate: input.recipe.gate,
    gateNotes,
    multiStep,
    multiStepLabel,
    fields: checkedFields,
    otherFields: otherFields.length ? otherFields : undefined,
    pasteReadyContent: pasteReadyContent.length ? pasteReadyContent : undefined,
    categoryNote: formHasCategoryField ? CATEGORY_PICK_YOURSELF_NOTE : null,
    honestyNotes,
    failureReason: failureReason ?? confSummary.line,
    formUnavailable: formUnavailable || undefined,
    confidenceSummary: confSummary.line,
    humanSteps: input.recipe.humanSteps ?? [],
    targetFormSelector: input.recipe.targetFormSelector ?? null,
    // Never default to CURRENT — that fake-stamps failed prepares and skips the next re-read.
    readerVersion: Number(input.recipe.readerVersion) || 0,
    classifierVersion: Number(input.recipe.classifierVersion) || 0,
  };
}

/** Static self-check: prepared mapping still matches live DOM facts (§2.1). */
export function verifyMappingAgainstDom(
  recipe: SiteRecipe,
  liveHtml: string
): { ok: boolean; mismatches: string[] } {
  const target = extractTargetFormFieldFacts(liveHtml, {
    lockedSelector: recipe.targetFormSelector,
    lockedIndex: recipe.targetFormIndex,
  });
  const live = target.fields;
  const bySelector = new Map(live.map((f) => [f.selector, f]));
  const mismatches: string[] = [];
  for (const rf of recipe.fields) {
    if (
      rf.role === 'other' ||
      rf.role === 'captcha' ||
      rf.role === 'terms' ||
      rf.role === 'category'
    ) {
      continue;
    }
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
