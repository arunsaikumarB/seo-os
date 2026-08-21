/**
 * Web Directory Form Intelligence — DirectoryFormSchema.
 *
 * Reuses Form Reader (extractFormFieldFacts / selectTargetForm / inferFieldRole).
 * Does NOT hardcode Jayde / Cipinet / SecretSearchEngineLabs as the only forms —
 * those patterns are covered by the same deterministic semantic mapper.
 * Never submits. Never solves CAPTCHA.
 */
import {
  extractFormFieldFacts,
  extractTargetFormFieldFacts,
  inferFieldRole,
  computeFormFingerprint,
  detectGateFromHtml,
  type FieldRole,
  type FormFieldFacts,
} from './assisted-manual.js';
import { selectTargetForm } from './target-form.js';
import { evaluateDetectors, gateFromClaim } from './detector-registry.js';
import { normalizeSiteDomain } from './site-crawl.js';

export const DIRECTORY_FORM_SCHEMA_VERSION = 1;

/** Canonical vocabulary for directory submission forms. */
export const DIRECTORY_CANONICAL_FIELDS = [
  'website_url',
  'company_name',
  'business_name',
  'email',
  'company_email',
  'phone',
  'street_address',
  'city',
  'state',
  'province',
  'postal_code',
  'country',
  'industry',
  'category',
  'title',
  'description',
  'facebook_url',
  'instagram_url',
  'twitter_url',
  'linkedin_url',
  'youtube_url',
  'google_maps_url',
  'google_plus_url',
  'twellow_url',
  'logo_url',
  'captcha',
  'terms_acceptance',
  'unknown',
] as const;

export type DirectoryCanonicalField = (typeof DIRECTORY_CANONICAL_FIELDS)[number];

export type DirectoryFieldFillStatus =
  | 'auto_populated'
  | 'needs_user_input'
  | 'needs_manual_verification'
  | 'directory_specific'
  | 'skip';

export type DirectoryDetectedField = {
  originalLabel: string | null;
  canonicalField: DirectoryCanonicalField;
  inputType: string;
  required: boolean;
  optional: boolean;
  placeholder: string | null;
  defaultValue: string | null;
  options: string[];
  maxLength: number | null;
  minLength: number | null;
  pattern: string | null;
  validation: string[];
  selector: string;
  fieldName: string | null;
  fieldId: string | null;
  confidence: number;
  fillStatus: DirectoryFieldFillStatus;
  /** Bridge to Assisted Manual FieldRole when applicable. */
  assistedRole: FieldRole | null;
};

export type DirectoryCaptchaInfo = {
  present: boolean;
  kinds: Array<'recaptcha' | 'hcaptcha' | 'turnstile' | 'cloudflare' | 'image' | 'other'>;
  notes: string[];
};

export type DirectoryTermsInfo = {
  present: boolean;
  required: boolean;
  label: string | null;
  selector: string | null;
};

export type DirectoryCategoryInfo = {
  fieldSelector: string | null;
  originalValues: string[];
  /** Closest match from originalValues only — never invented. */
  suggestedMatch: string | null;
  suggestionConfidence: number;
  suggestionReason: string | null;
};

export type DirectorySubmitControl = {
  label: string;
  selector: string;
  type: 'submit' | 'button' | 'link';
};

export type DirectoryFormSchema = {
  schemaVersion: number;
  domain: string;
  directoryUrl: string;
  submissionUrl: string;
  analyzedAt: string;
  formFingerprint: string;
  fields: DirectoryDetectedField[];
  categories: DirectoryCategoryInfo;
  captcha: DirectoryCaptchaInfo;
  terms: DirectoryTermsInfo;
  submitControls: DirectorySubmitControl[];
  overallConfidence: number;
  reviewRequired: boolean;
  status: 'draft' | 'reviewed' | 'stale';
  /** Human-readable pattern hint (not a hard-coded exclusive list). */
  formPatternHint: string | null;
  gate: string;
};

export type BusinessProfileForDirectory = {
  businessName?: string | null;
  companyName?: string | null;
  websiteUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  industry?: string | null;
  category?: string | null;
  title?: string | null;
  description?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  twitterUrl?: string | null;
  linkedinUrl?: string | null;
  youtubeUrl?: string | null;
  googleMapsUrl?: string | null;
  logoUrl?: string | null;
};

/** Semantic alias groups — order matters (first match wins among equals). */
const CANONICAL_ALIASES: Array<{ field: DirectoryCanonicalField; patterns: RegExp[] }> = [
  {
    field: 'website_url',
    patterns: [
      /\b(your\s+)?url\b/,
      /\bwebsite\b/,
      /\bsite\s*url\b/,
      /\bwebsite\s*(address|url)\b/,
      /\bhomepage\b/,
      /\bweb\s*address\b/,
      /\blanding\s*page\b/,
      /\blink\s*url\b/,
    ],
  },
  {
    field: 'company_email',
    patterns: [/\bcompany\s*e-?mail\b/, /\bbusiness\s*e-?mail\b/],
  },
  {
    field: 'email',
    patterns: [/\be-?mail\b/, /\byour\s*e-?mail\b/],
  },
  {
    field: 'business_name',
    patterns: [
      /\bbusiness\s*name\b/,
      /\borganization\s*name\b/,
      /\borg(anisation)?\s*name\b/,
    ],
  },
  {
    field: 'company_name',
    patterns: [/\bcompany\s*name\b/, /\btrading\s*name\b/],
  },
  {
    field: 'title',
    patterns: [
      /\bsite\s*title\b/,
      /\blisting\s*title\b/,
      /\bpage\s*title\b/,
      /\btitle\b/,
      /\bheadline\b/,
    ],
  },
  {
    field: 'description',
    patterns: [
      /\bbusiness\s*description\b/,
      /\babout\s*(your\s+)?business\b/,
      /\bdescription\b/,
      /\bshort\s*description\b/,
      /\blong\s*description\b/,
      /\boverview\b/,
    ],
  },
  {
    field: 'phone',
    patterns: [
      /\b(business\s+)?phone\b/,
      /\btelephone\b/,
      /\bmobile\b/,
      /\btel\b/,
    ],
  },
  {
    field: 'street_address',
    patterns: [
      /\bstreet\s*address\b/,
      /\bbusiness\s*(street\s*)?address\b/,
      /\baddress\s*line\b/,
      /\bmailing\s*address\b/,
      /^(address)$/,
    ],
  },
  {
    field: 'postal_code',
    patterns: [/\bzip\b/, /\bpostal\b/, /\bpost\s*code\b/, /\bzip\s*\/\s*postal\b/],
  },
  {
    field: 'city',
    patterns: [/\bcity\b/, /\btown\b/],
  },
  {
    field: 'state',
    patterns: [/\bstate\b/, /\bstate\s*or\s*province\b/],
  },
  {
    field: 'province',
    patterns: [/\bprovince\b/],
  },
  {
    field: 'country',
    patterns: [/\bcountry\b/],
  },
  {
    field: 'industry',
    patterns: [/\bindustry\b/, /\bbusiness\s*type\b/],
  },
  {
    field: 'category',
    patterns: [/\bcategory\b/, /\bcategories\b/, /\bdirectory\s*category\b/],
  },
  {
    field: 'facebook_url',
    patterns: [/\bfacebook\b/],
  },
  {
    field: 'instagram_url',
    patterns: [/\binstagram\b/],
  },
  {
    field: 'twitter_url',
    patterns: [/\btwitter\b/, /\bx\s*\(?twitter\)?\b/],
  },
  {
    field: 'linkedin_url',
    patterns: [/\blinkedin\b/],
  },
  {
    field: 'youtube_url',
    patterns: [/\byoutube\b/],
  },
  {
    field: 'google_maps_url',
    patterns: [/\bgoogle\s*maps\b/, /\bmaps\s*url\b/],
  },
  {
    field: 'google_plus_url',
    patterns: [/\bgoogle\s*\+?\b/, /\bgoogle\s*plus\b/],
  },
  {
    field: 'twellow_url',
    patterns: [/\btwellow\b/],
  },
  {
    field: 'logo_url',
    patterns: [/\blogo\b/, /\bcompany\s*logo\b/],
  },
  {
    field: 'terms_acceptance',
    patterns: [
      /\bterms\b/,
      /\bagree\b/,
      /\bprivacy\b/,
      /\bi\s*agree\b/,
      /\bterms\s*of\s*service\b/,
    ],
  },
  {
    field: 'captcha',
    patterns: [/\bcaptcha\b/, /\bspam\s*prevention\b/, /\bsecurity\s*code\b/, /\bverify\b/],
  },
];

function norm(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Map a label / name / placeholder blob → canonical field + confidence. */
export function mapToCanonicalField(input: {
  label?: string | null;
  name?: string | null;
  id?: string | null;
  placeholder?: string | null;
  type?: string | null;
  options?: string[];
}): { field: DirectoryCanonicalField; confidence: number; matchedBy: string } {
  const type = String(input.type ?? '').toLowerCase();
  if (type === 'checkbox') {
    const blob = norm([input.label, input.name, input.id].filter(Boolean).join(' '));
    if (/terms|agree|privacy|tos|conditions/.test(blob)) {
      return { field: 'terms_acceptance', confidence: 0.95, matchedBy: 'checkbox+terms' };
    }
  }

  // Prefer unambiguous name/id before polluted <label> blobs from adjacent DOM text
  const attrBlob = norm([input.name, input.id].filter(Boolean).join(' | '));
  if (attrBlob) {
    for (const row of CANONICAL_ALIASES) {
      for (const p of row.patterns) {
        if (p.test(attrBlob)) {
          return {
            field: row.field,
            confidence: 0.94,
            matchedBy: `attr:${p.source}`,
          };
        }
      }
    }
  }

  if (type === 'email') return { field: 'email', confidence: 0.9, matchedBy: 'input[type=email]' };
  if (type === 'url') return { field: 'website_url', confidence: 0.9, matchedBy: 'input[type=url]' };
  if (type === 'tel') return { field: 'phone', confidence: 0.9, matchedBy: 'input[type=tel]' };

  // Clean label: avoid findLabel glue; keep full phrase when it is a known compound
  const rawLabel = String(input.label ?? '').trim();
  const compound =
    rawLabel.match(
      /\b((?:your\s+)?(?:website|site)\s+(?:url|address)|(?:your\s+)?url|site\s+title|business\s+description|business\s+name|company\s+name|zip\s*\/\s*postal(?:\s*code)?|postal\s*code|google\s*maps\s*url|facebook\s*url|youtube\s*url|company\s+logo(?:\s+image)?\s*url)\b/i
    )?.[1] ?? null;
  const trailing =
    compound ||
    rawLabel.match(
      /\b((?:site\s+)?title|description|e-?mail|email|category|business\s+name|company\s+name|phone|industry)\s*:?\s*$/i
    )?.[1] ||
    rawLabel.split(/(?<=:)\s+/).filter(Boolean).slice(-1)[0] ||
    rawLabel;

  const labelBlob = norm([trailing, input.placeholder].filter(Boolean).join(' | '));
  if (labelBlob) {
    let best: { field: DirectoryCanonicalField; confidence: number; matchedBy: string } | null =
      null;
    for (const row of CANONICAL_ALIASES) {
      for (const p of row.patterns) {
        if (p.test(labelBlob)) {
          const confidence =
            /\b(your\s+)?url\b/.test(labelBlob) && row.field === 'website_url' ? 0.92 : 0.86;
          if (!best || confidence > best.confidence) {
            best = { field: row.field, confidence, matchedBy: `label:${p.source}` };
          }
          break;
        }
      }
    }
    if (best) return best;
  }

  // Category select with many options
  if (
    (type === 'select' || type === 'select-one' || type === 'select-multiple') &&
    (input.options?.length ?? 0) >= 3
  ) {
    const blob = norm([input.label, input.name, input.id].filter(Boolean).join(' '));
    if (/categor|industry|topic/.test(blob) || (input.options?.length ?? 0) >= 5) {
      return { field: 'category', confidence: 0.9, matchedBy: 'select+options' };
    }
  }

  if (type === 'textarea') return { field: 'description', confidence: 0.55, matchedBy: 'textarea' };

  return { field: 'unknown', confidence: 0.25, matchedBy: 'unmatched' };
}

function assistedRoleForCanonical(field: DirectoryCanonicalField): FieldRole | null {
  switch (field) {
    case 'website_url':
      return 'url';
    case 'email':
    case 'company_email':
      return 'email';
    case 'phone':
      return 'phone';
    case 'business_name':
    case 'company_name':
      return 'business_name';
    case 'title':
      return 'title';
    case 'description':
      return 'long_desc';
    case 'category':
    case 'industry':
      return 'category';
    case 'street_address':
    case 'city':
    case 'state':
    case 'province':
    case 'postal_code':
    case 'country':
      return 'address';
    case 'terms_acceptance':
      return 'terms';
    case 'captcha':
      return 'captcha';
    default:
      return null;
  }
}

function detectCaptcha(html: string): DirectoryCaptchaInfo {
  const h = html.toLowerCase();
  const kinds: DirectoryCaptchaInfo['kinds'] = [];
  const notes: string[] = [];
  if (/recaptcha|g-recaptcha|google\.com\/recaptcha/.test(h)) {
    kinds.push('recaptcha');
    notes.push('reCAPTCHA detected — manual verification required');
  }
  if (/hcaptcha|h-captcha/.test(h)) {
    kinds.push('hcaptcha');
    notes.push('hCaptcha detected — manual verification required');
  }
  if (/cf-turnstile|turnstile/.test(h)) {
    kinds.push('turnstile');
    notes.push('Cloudflare Turnstile detected');
  }
  if (/cloudflare|cf-challenge|challenge-platform/.test(h)) {
    kinds.push('cloudflare');
    notes.push('Cloudflare challenge detected');
  }
  if (/captcha|spam prevention|security code|enter the code/.test(h) && kinds.length === 0) {
    kinds.push('image');
    notes.push('CAPTCHA / spam prevention field detected');
  }
  const det = evaluateDetectors({ html, url: '', targetingSubmissionForm: true });
  const gate = gateFromClaim(det.primary?.claim ?? null);
  if ((gate === 'captcha' || gate === 'cloudflare') && kinds.length === 0) {
    kinds.push(gate === 'cloudflare' ? 'cloudflare' : 'other');
    notes.push('Anti-bot detector flagged captcha / challenge');
  }
  return { present: kinds.length > 0, kinds, notes };
}

function detectSubmitControls(html: string): DirectorySubmitControl[] {
  const out: DirectorySubmitControl[] = [];
  const btnRe =
    /<(?:button|input)([^>]*)(?:type=["']submit["'][^>]*)?(?:>([\s\S]*?)<\/button>|\/?>)/gi;
  let m: RegExpExecArray | null;
  while ((m = btnRe.exec(html)) && out.length < 8) {
    const attrs = m[1] ?? '';
    const type = (attrs.match(/type=["']([^"']+)["']/i)?.[1] ?? 'submit').toLowerCase();
    if (type !== 'submit' && type !== 'button') continue;
    const value = attrs.match(/value=["']([^"']+)["']/i)?.[1];
    const id = attrs.match(/\bid=["']([^"']+)["']/i)?.[1];
    const name = attrs.match(/\bname=["']([^"']+)["']/i)?.[1];
    const label = (
      value ||
      (m[2] ?? '').replace(/<[^>]+>/g, '').trim() ||
      'Submit'
    ).slice(0, 80);
    if (!/submit|add|save|send|list|click/i.test(label) && type !== 'submit') continue;
    out.push({
      label,
      selector: id ? `#${id}` : name ? `[name="${name}"]` : `input[type="${type}"]`,
      type: type === 'submit' ? 'submit' : 'button',
    });
  }
  // Common directory CTAs
  const ctaRe = />(Add URL|Add my Site|Click to Submit|Submit|Submit Site|Add Listing)</gi;
  while ((m = ctaRe.exec(html)) && out.length < 10) {
    const label = m[1];
    if (!out.some((o) => o.label === label)) {
      out.push({ label, selector: `text=${label}`, type: 'button' });
    }
  }
  return out;
}

/**
 * Suggest the closest directory category from the site's own options.
 * NEVER invents a category that is not in originalValues.
 */
export function suggestDirectoryCategory(
  businessCategory: string | null | undefined,
  originalValues: string[]
): { match: string | null; confidence: number; reason: string | null } {
  const needle = norm(businessCategory ?? '');
  if (!needle || !originalValues.length) {
    return { match: null, confidence: 0, reason: null };
  }
  const cleaned = originalValues
    .map((v) => String(v).trim())
    .filter((v) => v && !/^--+|^select|^choose|^pick/i.test(v));

  // Exact (case-insensitive)
  const exact = cleaned.find((v) => norm(v) === needle);
  if (exact) return { match: exact, confidence: 1, reason: 'exact' };

  // Contains either way
  const contains = cleaned.find(
    (v) => norm(v).includes(needle) || needle.includes(norm(v))
  );
  if (contains) return { match: contains, confidence: 0.85, reason: 'contains' };

  // Token overlap (e.g. Food/Restaurant → Food And Beverage)
  const needleTokens = new Set(needle.split(/[^a-z0-9]+/).filter((t) => t.length > 2));
  let best: { v: string; score: number } | null = null;
  for (const v of cleaned) {
    const tokens = norm(v).split(/[^a-z0-9]+/).filter((t) => t.length > 2);
    if (!tokens.length) continue;
    let hit = 0;
    for (const t of tokens) if (needleTokens.has(t)) hit += 1;
    // Synonym boosts
    if (/food|restaurant|dining|beverage|hospitality/.test(needle)) {
      if (/food|restaurant|beverage|hospitality|dining/.test(norm(v))) hit += 1.5;
    }
    const score = hit / Math.max(tokens.length, needleTokens.size);
    if (!best || score > best.score) best = { v, score };
  }
  if (best && best.score >= 0.34) {
    return {
      match: best.v,
      confidence: Math.min(0.9, 0.5 + best.score),
      reason: 'token_overlap',
    };
  }
  return { match: null, confidence: 0, reason: 'no_safe_match' };
}

function formPatternHint(fields: DirectoryDetectedField[]): string | null {
  const keys = new Set(fields.map((f) => f.canonicalField));
  const fillable = fields.filter(
    (f) => !['captcha', 'terms_acceptance', 'unknown'].includes(f.canonicalField)
  );
  if (fillable.length <= 1 && keys.has('website_url')) {
    return 'minimal_url_only';
  }
  if (
    keys.has('website_url') &&
    keys.has('title') &&
    keys.has('description') &&
    keys.has('email') &&
    (keys.has('category') || keys.has('industry'))
  ) {
    return 'classic_directory';
  }
  if (
    keys.has('street_address') ||
    keys.has('facebook_url') ||
    keys.has('industry') ||
    (keys.has('business_name') && keys.has('phone'))
  ) {
    return 'rich_business_directory';
  }
  return null;
}

function factsToDetected(facts: FormFieldFacts): DirectoryDetectedField {
  const mapped = mapToCanonicalField({
    label: facts.label,
    name: facts.name,
    id: facts.id,
    placeholder: facts.placeholder,
    type: facts.type,
    options: facts.options,
  });

  // Cross-check with assisted inferFieldRole for confidence blend
  const assisted = inferFieldRole(facts);
  let confidence = mapped.confidence;
  if (mapped.field === 'unknown' && assisted.role !== 'other') {
    // Lift from assisted roles
    const lift: Partial<Record<FieldRole, DirectoryCanonicalField>> = {
      url: 'website_url',
      email: 'email',
      phone: 'phone',
      title: 'title',
      long_desc: 'description',
      short_desc: 'description',
      business_name: 'business_name',
      category: 'category',
      terms: 'terms_acceptance',
      captcha: 'captcha',
      address: 'street_address',
    };
    const lifted = lift[assisted.role];
    if (lifted) {
      confidence = assisted.confidence === 'high' ? 0.8 : 0.6;
      return buildDetected(facts, lifted, confidence, assisted.role);
    }
  }

  // Prefer assisted role alignment for confidence bump
  const expected = assistedRoleForCanonical(mapped.field);
  if (expected && assisted.role === expected && assisted.confidence === 'high') {
    confidence = Math.min(0.99, confidence + 0.08);
  }

  return buildDetected(facts, mapped.field, confidence, assisted.role === 'other' ? null : assisted.role);
}

function buildDetected(
  facts: FormFieldFacts,
  canonical: DirectoryCanonicalField,
  confidence: number,
  assistedRole: FieldRole | null
): DirectoryDetectedField {
  const validation: string[] = [];
  if (facts.required) validation.push('required');
  if (facts.maxlength != null) validation.push(`maxLength:${facts.maxlength}`);
  if (facts.type === 'email') validation.push('email');
  if (facts.type === 'url') validation.push('url');

  let fillStatus: DirectoryFieldFillStatus = 'needs_user_input';
  if (canonical === 'captcha') fillStatus = 'needs_manual_verification';
  else if (canonical === 'terms_acceptance') fillStatus = 'needs_manual_verification';
  else if (canonical === 'category' || canonical === 'industry') fillStatus = 'directory_specific';
  else if (canonical === 'unknown') fillStatus = 'needs_manual_verification';
  else if (confidence >= 0.75) fillStatus = 'needs_user_input';

  return {
    originalLabel: facts.label || facts.ariaLabel || facts.name || null,
    canonicalField: canonical,
    inputType: facts.type,
    required: facts.required,
    optional: !facts.required,
    placeholder: facts.placeholder,
    defaultValue: null,
    options: facts.options ?? [],
    maxLength: facts.maxlength,
    minLength: null,
    pattern: null,
    validation,
    selector: facts.selector,
    fieldName: facts.name,
    fieldId: facts.id,
    confidence: Math.round(confidence * 100) / 100,
    fillStatus,
    assistedRole: assistedRole ?? assistedRoleForCanonical(canonical),
  };
}

/**
 * Build a DirectoryFormSchema from live HTML (one submission page).
 * Uses target-form selection so login/search/newsletter forms are ignored.
 */
export function buildDirectoryFormSchema(input: {
  html: string;
  directoryUrl: string;
  submissionUrl?: string | null;
  businessCategory?: string | null;
}): DirectoryFormSchema {
  const directoryUrl = String(input.directoryUrl || '').trim();
  const submissionUrl = String(input.submissionUrl || directoryUrl).trim();
  const domain = normalizeSiteDomain(submissionUrl || directoryUrl) || 'unknown';
  const html = input.html ?? '';

  const target = selectTargetForm(html, { minScore: 2 });
  const facts = target.formFound
    ? extractTargetFormFieldFacts(html, {
        lockedSelector: target.form?.selector ?? undefined,
        lockedIndex: target.form?.index ?? undefined,
      }).fields
    : extractFormFieldFacts(html);

  const fields = facts.map(factsToDetected);

  // Promote captcha/terms from page-level detectors when not in fields
  const captcha = detectCaptcha(html);
  if (captcha.present && !fields.some((f) => f.canonicalField === 'captcha')) {
    fields.push({
      originalLabel: 'CAPTCHA / Spam Prevention',
      canonicalField: 'captcha',
      inputType: 'captcha',
      required: true,
      optional: false,
      placeholder: null,
      defaultValue: null,
      options: [],
      maxLength: null,
      minLength: null,
      pattern: null,
      validation: ['manual_verification'],
      selector: '',
      fieldName: null,
      fieldId: null,
      confidence: 0.9,
      fillStatus: 'needs_manual_verification',
      assistedRole: 'captcha',
    });
  }

  const termsField = fields.find((f) => f.canonicalField === 'terms_acceptance');
  const terms: DirectoryTermsInfo = {
    present: Boolean(termsField) || /terms of service|i agree|by submitting/i.test(html),
    required: termsField?.required ?? /agree to the terms/i.test(html),
    label: termsField?.originalLabel ?? (termsField ? null : 'Terms of Service'),
    selector: termsField?.selector ?? null,
  };
  if (terms.present && !termsField) {
    fields.push({
      originalLabel: terms.label,
      canonicalField: 'terms_acceptance',
      inputType: 'checkbox',
      required: terms.required,
      optional: !terms.required,
      placeholder: null,
      defaultValue: null,
      options: [],
      maxLength: null,
      minLength: null,
      pattern: null,
      validation: terms.required ? ['required'] : [],
      selector: '',
      fieldName: null,
      fieldId: null,
      confidence: 0.8,
      fillStatus: 'needs_manual_verification',
      assistedRole: 'terms',
    });
  }

  const categoryField =
    fields.find((f) => f.canonicalField === 'category') ||
    fields.find((f) => f.canonicalField === 'industry' && f.options.length >= 3);
  const originalValues = categoryField?.options ?? [];
  const suggestion = suggestDirectoryCategory(input.businessCategory, originalValues);

  const fingerprint = computeFormFingerprint(facts);

  const confidences = fields
    .filter((f) => !['captcha', 'terms_acceptance'].includes(f.canonicalField))
    .map((f) => f.confidence);
  const overallConfidence =
    confidences.length === 0
      ? 0
      : Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100;

  const lowConfidence = fields.some(
    (f) => f.canonicalField === 'unknown' || f.confidence < 0.55
  );
  const gate = detectGateFromHtml(html);

  return {
    schemaVersion: DIRECTORY_FORM_SCHEMA_VERSION,
    domain,
    directoryUrl,
    submissionUrl,
    analyzedAt: new Date().toISOString(),
    formFingerprint: fingerprint,
    fields,
    categories: {
      fieldSelector: categoryField?.selector ?? null,
      originalValues,
      suggestedMatch: suggestion.match,
      suggestionConfidence: suggestion.confidence,
      suggestionReason: suggestion.reason,
    },
    captcha,
    terms,
    submitControls: detectSubmitControls(html),
    overallConfidence,
    reviewRequired: lowConfidence || overallConfidence < 0.7 || captcha.present,
    status: 'draft',
    formPatternHint: formPatternHint(fields),
    gate,
  };
}

/** Populate schema fields from the project business profile (never invents categories). */
export function populateDirectoryFormFromProfile(
  schema: DirectoryFormSchema,
  profile: BusinessProfileForDirectory
): DirectoryFormSchema {
  const valueFor = (field: DirectoryCanonicalField): string => {
    switch (field) {
      case 'website_url':
        return String(profile.websiteUrl ?? '').trim();
      case 'business_name':
        return String(profile.businessName || profile.companyName || '').trim();
      case 'company_name':
        return String(profile.companyName || profile.businessName || '').trim();
      case 'email':
      case 'company_email':
        return String(profile.email ?? '').trim();
      case 'phone':
        return String(profile.phone ?? '').trim();
      case 'street_address':
        return String(profile.streetAddress ?? '').trim();
      case 'city':
        return String(profile.city ?? '').trim();
      case 'state':
      case 'province':
        return String(profile.state ?? '').trim();
      case 'postal_code':
        return String(profile.postalCode ?? '').trim();
      case 'country':
        return String(profile.country ?? '').trim();
      case 'industry':
        return String(profile.industry ?? '').trim();
      case 'title':
        return String(profile.title || profile.businessName || '').trim();
      case 'description':
        return String(profile.description ?? '').trim();
      case 'facebook_url':
        return String(profile.facebookUrl ?? '').trim();
      case 'instagram_url':
        return String(profile.instagramUrl ?? '').trim();
      case 'twitter_url':
        return String(profile.twitterUrl ?? '').trim();
      case 'linkedin_url':
        return String(profile.linkedinUrl ?? '').trim();
      case 'youtube_url':
        return String(profile.youtubeUrl ?? '').trim();
      case 'google_maps_url':
        return String(profile.googleMapsUrl ?? '').trim();
      case 'logo_url':
        return String(profile.logoUrl ?? '').trim();
      case 'category': {
        const sug = suggestDirectoryCategory(
          profile.category || profile.industry,
          schema.categories.originalValues
        );
        return sug.match ?? '';
      }
      default:
        return '';
    }
  };

  const fields = schema.fields.map((f) => {
    if (f.canonicalField === 'captcha' || f.canonicalField === 'terms_acceptance') {
      return { ...f, fillStatus: 'needs_manual_verification' as const };
    }
    let value = valueFor(f.canonicalField);
    if (f.canonicalField === 'description' && f.maxLength != null && value.length > f.maxLength) {
      value = value.slice(0, f.maxLength).trim();
    }
    if (!value) {
      return {
        ...f,
        defaultValue: null,
        fillStatus:
          f.canonicalField === 'category' || f.canonicalField === 'unknown'
            ? ('directory_specific' as const)
            : ('needs_user_input' as const),
      };
    }
    return {
      ...f,
      defaultValue: value,
      fillStatus: 'auto_populated' as const,
    };
  });

  const categorySuggestion = suggestDirectoryCategory(
    profile.category || profile.industry,
    schema.categories.originalValues
  );

  return {
    ...schema,
    fields,
    categories: {
      ...schema.categories,
      suggestedMatch: categorySuggestion.match,
      suggestionConfidence: categorySuggestion.confidence,
      suggestionReason: categorySuggestion.reason,
    },
  };
}

/** Detect whether a re-fetched form drifted from a persisted schema. */
export function detectDirectorySchemaDrift(
  previous: DirectoryFormSchema,
  next: DirectoryFormSchema
): { changed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (previous.formFingerprint !== next.formFingerprint) {
    reasons.push('form_fingerprint_changed');
  }
  const prevKeys = previous.fields.map((f) => `${f.canonicalField}:${f.selector}`).sort();
  const nextKeys = next.fields.map((f) => `${f.canonicalField}:${f.selector}`).sort();
  if (prevKeys.join('|') !== nextKeys.join('|')) {
    reasons.push('field_set_changed');
  }
  if (
    previous.categories.originalValues.join('|') !== next.categories.originalValues.join('|')
  ) {
    reasons.push('category_options_changed');
  }
  if (previous.captcha.present !== next.captcha.present) {
    reasons.push('captcha_presence_changed');
  }
  return { changed: reasons.length > 0, reasons };
}

/** Apply human review corrections to canonical mappings. */
export function applyDirectoryFieldReview(
  schema: DirectoryFormSchema,
  corrections: Array<{ selector: string; canonicalField: DirectoryCanonicalField }>
): DirectoryFormSchema {
  const map = new Map(corrections.map((c) => [c.selector, c.canonicalField]));
  const fields = schema.fields.map((f) => {
    const next = map.get(f.selector);
    if (!next) return f;
    return {
      ...f,
      canonicalField: next,
      confidence: 1,
      fillStatus:
        next === 'captcha' || next === 'terms_acceptance'
          ? ('needs_manual_verification' as const)
          : next === 'category'
            ? ('directory_specific' as const)
            : f.fillStatus === 'auto_populated'
              ? f.fillStatus
              : ('needs_user_input' as const),
      assistedRole: assistedRoleForCanonical(next),
    };
  });
  return {
    ...schema,
    fields,
    status: 'reviewed',
    reviewRequired: false,
    overallConfidence: 1,
  };
}
