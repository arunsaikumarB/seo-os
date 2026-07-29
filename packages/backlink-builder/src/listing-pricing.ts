/**
 * Free vs paid listing classifier — form-first, never sidebar-ad $ prices.
 *
 * Priority:
 * 1) Hard paid: premium token / free submissions disabled
 * 2) Link-type / pricing radios INSIDE the listing <form>
 *    - any Free option → free (human picks Free when both exist)
 *    - only $-priced / premium options → paid
 * 3) Listing form with no plan radios → free if form is a normal
 *    Title/URL/Description submit (classic free directory), or page
 *    says FREE directory / free listing
 * 4) Sidebar “Your Link Here $0.80” / banner ads are IGNORED
 */

export type ListingPricingKind = 'free' | 'paid' | 'unknown';

const FREE_DISABLED_RE =
  /\bfree\s+submissions?\s+(?:are\s+)?(?:currently\s+|temporarily\s+)?(?:disabled|unavailable|closed|suspended|not\s+(?:accepted|allowed|available))\b|\bfree\s+submissions?\s+(?:have\s+been\s+|is\s+|are\s+)?(?:disabled|closed|suspended)\b|\b(?:no|not)\s+(?:longer\s+)?(?:accepting\s+)?free\s+submissions?\b|\bthere\s+is\s+no\s+point\s+in\s+accepting\s+free\b|\bfree\s+(?:listing|submission)s?\s+(?:are\s+)?(?:currently\s+|temporarily\s+)?disabled\b|\bunable\s+to\s+(?:accept\s+)?free\s+(?:listing|submission)s?\b|\bno\s+free\s+(?:listing|submission|option)\b/i;

const PREMIUM_TOKEN_RE =
  /\bpremium\s+(?:listing\s+)?token\b|\benter\s+your\s+premium\s+token\b|\b(?:a\s+)?premium\s+token\s+is\s+required\b|\btoken\s+(?:is\s+)?required\s+to\s+submit\b|\bpaid\s+(?:listing\s+)?token\b|\bpremium\s+token\s*\(required\)/i;

const COST_RE = /\$\s*\d+(?:\.\d+)?|\€\s*\d+(?:\.\d+)?|£\s*\d+(?:\.\d+)?|\b\d+(?:\.\d+)?\s*(?:usd|eur|gbp)\b/i;
const FREE_WORD_RE = /\bfree\b/i;
const ZERO_COST_RE = /\$\s*0(?:\.0+)?\b|\b0\s*(?:usd|eur|gbp)\b|\bno\s+cost\b|\bcomplimentary\b/i;

/** Ad / sidebar noise — never treat as listing plan options. */
const AD_NOISE_RE =
  /\byour\s+link\s+here\b|\bput\s+your\s+(?:\d+x\d+\s+)?banner\b|\bbuy\s+(?:steroids|followers|likes)\b|\bsmm\s+panel\b|\bsponsored\s+links?\b(?!\s*(?:option|plan|listing|radio))/i;

const LISTING_FIELD_RE =
  /\b(TITLE|URL|DESCRIPTION|OWNER_NAME|OWNER_EMAIL|CATEGORY_ID|title|website|description|owner_?name|owner_?email)\b/i;

const PLAN_CONTROL_RE =
  /name=["'][^"']*(link[_\s-]?type|listing[_\s-]?type|plan|package|pricing|LINK_TYPE|payment)[^"']*["']/i;

function textBlob(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(raw: string): string {
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export type PlanOption = { text: string; kind: 'free' | 'paid' | 'unknown' };

/** All <form> blocks that look like directory listing submit forms. */
export function extractListingForms(html: string): string[] {
  const forms: string[] = [];
  for (const m of html.matchAll(/<form\b[\s\S]*?<\/form>/gi)) {
    const f = m[0]!;
    if (LISTING_FIELD_RE.test(f) || /<(textarea)\b/i.test(f)) {
      forms.push(f);
      continue;
    }
    // Small forms with url + title-ish inputs
    if (
      /<(input)\b[^>]*(name|id)=["'][^"']*(url|website|title)[^"']*["']/i.test(f) &&
      /<(input|textarea|select)\b/i.test(f)
    ) {
      forms.push(f);
    }
  }
  return forms;
}

function isAdNoiseLabel(text: string): boolean {
  return AD_NOISE_RE.test(text);
}

function classifyPlanLabel(text: string): PlanOption['kind'] {
  if (isAdNoiseLabel(text)) return 'unknown';
  const hasCost = COST_RE.test(text);
  const hasFree = FREE_WORD_RE.test(text) || ZERO_COST_RE.test(text);
  const looksPaidTier =
    /\b(premium|featured|paid|express|fast\s+review|sponsored|gold|silver|platinum)\b/i.test(text) &&
    !/\bfree\b/i.test(text);

  if (hasFree && (!hasCost || ZERO_COST_RE.test(text))) return 'free';
  if (hasCost || looksPaidTier) return 'paid';
  if (hasFree) return 'free';
  return 'unknown';
}

/**
 * Plan / link-type options from radios & selects INSIDE a form only.
 * Category dropdowns and ad text are excluded.
 */
export function extractInFormPlanOptions(formHtml: string): PlanOption[] {
  const labels = new Set<string>();
  const push = (raw: string) => {
    const t = stripTags(raw);
    if (!t || t.length < 2 || t.length > 140) return;
    if (/^(select|choose|pick|--+|\[?top\]?)$/i.test(t)) return;
    if (isAdNoiseLabel(t)) return;
    // Category tree options (Business, Computers…) — not pricing
    if (
      !COST_RE.test(t) &&
      !FREE_WORD_RE.test(t) &&
      !/\b(premium|featured|paid|regular|basic|standard|listing|review|plan|package|express)\b/i.test(
        t
      )
    ) {
      return;
    }
    labels.add(t);
  };

  // Radios that look like link-type / plan controls
  for (const m of formHtml.matchAll(/<input\b[^>]*type=["']radio["'][^>]*>/gi)) {
    const tag = m[0]!;
    if (!PLAN_CONTROL_RE.test(tag) && !/LINK_TYPE|linktype|listingtype|plan|pricing/i.test(tag)) {
      // Still include if nearby label in parent chunk has plan words — handled via labels below
      if (!COST_RE.test(tag) && !/value=["'][^"']*(free|premium|paid|featured|regular)/i.test(tag)) {
        continue;
      }
    }
    const val = /value=["']([^"']+)["']/i.exec(tag)?.[1];
    if (val) push(val);
  }

  // Labels wrapping radios / next to plan controls
  for (const m of formHtml.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/gi)) {
    const chunk = m[0]!;
    if (
      /type=["']radio["']/i.test(chunk) ||
      COST_RE.test(chunk) ||
      FREE_WORD_RE.test(chunk) ||
      /\b(premium|featured|paid|regular|listing|review|plan)\b/i.test(chunk)
    ) {
      push(chunk);
    }
  }

  // <select name="LINK_TYPE|plan|…">
  for (const m of formHtml.matchAll(/<select\b[^>]*>[\s\S]*?<\/select>/gi)) {
    const sel = m[0]!;
    if (!PLAN_CONTROL_RE.test(sel) && !/LINK_TYPE|plan|pricing|package/i.test(sel)) continue;
    for (const opt of sel.matchAll(/<option[^>]*>([\s\S]*?)<\/option>/gi)) {
      push(opt[1] ?? '');
    }
  }

  const out: PlanOption[] = [];
  const seen = new Set<string>();
  for (const text of labels) {
    const kind = classifyPlanLabel(text);
    if (kind === 'unknown') continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text, kind });
  }
  return out;
}

/** @deprecated use extractInFormPlanOptions — kept for callers */
export function extractPlanOptions(html: string): PlanOption[] {
  const forms = extractListingForms(html);
  if (forms.length) {
    return forms.flatMap((f) => extractInFormPlanOptions(f));
  }
  return extractInFormPlanOptions(html);
}

export function freePathIsDisabled(blob: string): boolean {
  return FREE_DISABLED_RE.test(blob);
}

export function requiresPremiumToken(blob: string): boolean {
  return PREMIUM_TOKEN_RE.test(blob);
}

function formHasPremiumTokenField(formHtml: string): boolean {
  return (
    PREMIUM_TOKEN_RE.test(formHtml) ||
    /name=["'][^"']*(premium|paid)?[_\s-]?token[^"']*["']/i.test(formHtml) ||
    /premium\s+token/i.test(formHtml)
  );
}

function pageSignalsFreeDirectory(html: string): boolean {
  const blob = textBlob(html).slice(0, 4000);
  return (
    /\bfree\s*(?:&|and)?\s*instant\s+directory\b/i.test(blob) ||
    /\bfree\s+(?:&|and)\s+instant\b/i.test(blob) ||
    /\bfree\s+directory\s+(?:list|listing|submission)\b/i.test(blob) ||
    /\bsubmit\s+(?:for\s+)?free\b/i.test(blob) ||
    /\bfree\s+listing\b/i.test(blob) ||
    /\bfree\s+submission\b/i.test(blob)
  );
}

/**
 * Prefer form + payment sections for diagnostics; plan detection uses forms only.
 */
export function extractFormAndPaymentHtml(html: string): {
  scopeHtml: string;
  hasFormOrPaymentSignal: boolean;
} {
  const forms = extractListingForms(html);
  if (forms.length) {
    return { scopeHtml: forms.join('\n'), hasFormOrPaymentSignal: true };
  }
  if (/<(form|input|textarea)\b/i.test(html)) {
    return { scopeHtml: html, hasFormOrPaymentSignal: true };
  }
  return { scopeHtml: '', hasFormOrPaymentSignal: false };
}

/**
 * Classify listing pricing — form radios first; ignore sidebar ad dollars.
 */
export function classifyListingPricingFromHtml(
  html: string | null | undefined
): ListingPricingKind {
  const raw = String(html ?? '');
  if (!raw.trim()) return 'unknown';

  const fullBlob = textBlob(raw);

  // 1) Hard paid gates (page-level — these are about the listing path itself)
  if (requiresPremiumToken(fullBlob) || freePathIsDisabled(fullBlob)) return 'paid';

  const forms = extractListingForms(raw);
  if (!forms.length) {
    // No listing form — not a pricing decision for submit worklist
    return 'unknown';
  }

  let sawPaidOnlyForm = false;
  let sawFreeOption = false;
  let sawClassicFreeForm = false;

  for (const form of forms) {
    if (formHasPremiumTokenField(form)) return 'paid';

    const plans = extractInFormPlanOptions(form);
    const freePlans = plans.filter((p) => p.kind === 'free');
    const paidPlans = plans.filter((p) => p.kind === 'paid');

    if (freePlans.length > 0) {
      sawFreeOption = true;
      continue;
    }

    if (paidPlans.length > 0) {
      // In-form paid-only radios ($1.99 / featured) — paid
      sawPaidOnlyForm = true;
      continue;
    }

    // No plan radios — classic directory submit (Title/URL/Description)
    if (LISTING_FIELD_RE.test(form) || /<(textarea)\b/i.test(form)) {
      sawClassicFreeForm = true;
    }
  }

  if (sawFreeOption) return 'free';
  if (sawPaidOnlyForm && !sawClassicFreeForm) return 'paid';
  // Mixed pages: paid radios on one step + classic form — if free disabled already returned
  if (sawPaidOnlyForm && sawClassicFreeForm) {
    // Prefer free classic path when page advertises free directory
    if (pageSignalsFreeDirectory(raw)) return 'free';
    return 'paid';
  }

  if (sawClassicFreeForm) {
    // Sidebar may say $0.80 for ads — ignore; this is a free submit form
    if (pageSignalsFreeDirectory(raw) || FREE_WORD_RE.test(textBlob(forms.join(' ')))) {
      return 'free';
    }
    // Classic Title/URL/Desc form without paid radios = free listing path
    return 'free';
  }

  return 'unknown';
}

/**
 * Resolve final pricing for a package/probe, applying wizard overrides.
 */
export function resolveListingPricing(input: {
  html?: string | null;
  wizardWalkStatus?: string | null;
  prior?: ListingPricingKind | null;
}): ListingPricingKind {
  if (input.wizardWalkStatus === 'paid_only') return 'paid';

  const fromHtml = classifyListingPricingFromHtml(input.html);
  if (fromHtml !== 'unknown') return fromHtml;

  if (input.prior === 'free' || input.prior === 'paid') return input.prior;
  return 'unknown';
}

export function listingPricingLabel(kind: ListingPricingKind): string {
  switch (kind) {
    case 'free':
      return 'Free';
    case 'paid':
      return 'Paid (set aside)';
    default:
      return 'Pricing unknown';
  }
}
