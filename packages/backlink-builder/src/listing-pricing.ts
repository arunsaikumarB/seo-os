/**
 * Free vs paid listing classifier for Submit Backlinks.
 *
 * Active free path required. Mentions of “free” that mean disabled / token /
 * paid-only pricing must park as paid — never false-free.
 */

export type ListingPricingKind = 'free' | 'paid' | 'unknown';

/** Explicit: free submissions are off / unavailable. */
const FREE_DISABLED_RE =
  /\bfree\s+submissions?\s+(?:are\s+)?(?:currently\s+|temporarily\s+)?(?:disabled|unavailable|closed|suspended|not\s+(?:accepted|allowed|available))\b|\bfree\s+submissions?\s+(?:have\s+been\s+|is\s+|are\s+)?(?:disabled|closed|suspended)\b|\b(?:no|not)\s+(?:longer\s+)?(?:accepting\s+)?free\s+submissions?\b|\bthere\s+is\s+no\s+point\s+in\s+accepting\s+free\b|\bfree\s+(?:listing|submission)s?\s+(?:are\s+)?(?:currently\s+|temporarily\s+)?disabled\b|\bunable\s+to\s+(?:accept\s+)?free\s+(?:listing|submission)s?\b|\bfree\s+submissions?\s+are\s+currently\s+disabled\b|\bno\s+free\s+(?:listing|submission|option)\b|\bfree\s+path\s+(?:is\s+)?(?:closed|disabled)\b/i;

/** Premium / paid token gates — always paid. */
const PREMIUM_TOKEN_RE =
  /\bpremium\s+(?:listing\s+)?token\b|\benter\s+your\s+premium\s+token\b|\b(?:a\s+)?premium\s+token\s+is\s+required\b|\btoken\s+(?:is\s+)?required\s+to\s+submit\b|\bpaid\s+(?:listing\s+)?token\b|\blisting\s+token\s*\*?\b.*\brequired\b|\bpremium\s+token\s*\(required\)/i;

const COST_RE = /\$\s*\d+(?:\.\d+)?|\€\s*\d+(?:\.\d+)?|£\s*\d+(?:\.\d+)?|\b\d+(?:\.\d+)?\s*(?:usd|eur|gbp)\b/i;
const FREE_WORD_RE = /\bfree\b/i;
const ZERO_COST_RE = /\$\s*0(?:\.0+)?\b|\b0\s*(?:usd|eur|gbp)\b|\bno\s+cost\b|\bcomplimentary\b/i;

const PAYMENT_SECTION_RE =
  /<(section|div|aside|table|fieldset|form|ul|ol)[^>]*(?:class|id|name|data-[\w-]*)=["'][^"']*(?:pric|plan|payment|package|listing[\s_-]?type|link[\s_-]?type|membership|checkout|billing|subscribe|token)[^"']*["'][^>]*>[\s\S]{0,14000}/gi;

const OPTION_LABEL_RE = /<(option|label)\b[^>]*>[\s\S]*?<\/(?:option|label)>/gi;

function textBlob(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Prefer form + payment/pricing sections. Falls back to full page when none found.
 */
export function extractFormAndPaymentHtml(html: string): {
  scopeHtml: string;
  hasFormOrPaymentSignal: boolean;
} {
  const parts: string[] = [];
  let hasFormOrPaymentSignal = false;

  for (const m of html.matchAll(/<form\b[\s\S]*?<\/form>/gi)) {
    parts.push(m[0]!);
    hasFormOrPaymentSignal = true;
  }

  for (const m of html.matchAll(PAYMENT_SECTION_RE)) {
    parts.push(m[0]!);
    hasFormOrPaymentSignal = true;
  }

  for (const m of html.matchAll(OPTION_LABEL_RE)) {
    const chunk = m[0]!;
    if (/free|paid|premium|featured|price|\$|plan|listing|sponsor|token|review/i.test(chunk)) {
      parts.push(chunk);
      hasFormOrPaymentSignal = true;
    }
  }

  if (
    /type=["']radio["']/i.test(html) &&
    /(?:link\s*type|listing\s*type|plan|package|pricing|review)/i.test(html)
  ) {
    hasFormOrPaymentSignal = true;
    parts.push(html);
  }

  if (parts.length) {
    return { scopeHtml: parts.join('\n'), hasFormOrPaymentSignal };
  }

  const looksLikeSubmit =
    /submit|add\s+(?:your\s+)?(?:site|url|listing)|directory|listing|premium\s+token/i.test(
      html
    ) || /<(input|textarea)\b/i.test(html);
  return {
    scopeHtml: looksLikeSubmit ? html : '',
    hasFormOrPaymentSignal: looksLikeSubmit,
  };
}

type PlanOption = { text: string; kind: 'free' | 'paid' | 'unknown' };

function stripTags(raw: string): string {
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Collect selectable plan / link-type options from radios, options, labels.
 */
export function extractPlanOptions(html: string): PlanOption[] {
  const labels = new Set<string>();
  const push = (raw: string) => {
    const t = stripTags(raw);
    if (!t || t.length < 2 || t.length > 120) return;
    if (/^(select|choose|pick|--+)$/i.test(t)) return;
    labels.add(t);
  };

  for (const m of html.matchAll(/<option[^>]*>([\s\S]*?)<\/option>/gi)) {
    push(m[1] ?? '');
  }
  for (const m of html.matchAll(/<label[^>]*>([\s\S]*?)<\/label>/gi)) {
    push(m[1] ?? '');
  }
  // Radio value attributes often carry the plan name
  for (const m of html.matchAll(
    /<input[^>]*type=["']radio["'][^>]*(?:value=["']([^"']+)["'][^>]*>|>[\s\S]{0,80})/gi
  )) {
    if (m[1]) push(m[1]);
  }

  const out: PlanOption[] = [];
  for (const text of labels) {
    const hasCost = COST_RE.test(text);
    const hasFree = FREE_WORD_RE.test(text) || ZERO_COST_RE.test(text);
    const looksPaidTier =
      /\b(premium|featured|paid|express|fast\s+review|sponsored|gold|silver|platinum)\b/i.test(
        text
      );
    let kind: PlanOption['kind'] = 'unknown';
    if (hasFree && !hasCost) kind = 'free';
    else if (hasFree && ZERO_COST_RE.test(text)) kind = 'free';
    else if (hasCost || looksPaidTier) kind = 'paid';
    else if (hasFree) kind = 'free';
    // Only keep options that look like pricing / listing type
    if (
      kind === 'unknown' &&
      !/\b(listing|review|plan|package|directory|link\s*type|regular|basic|standard)\b/i.test(
        text
      )
    ) {
      continue;
    }
    out.push({ text, kind: kind === 'unknown' && hasCost ? 'paid' : kind });
  }
  return out;
}

/** True when “free” appears only as disabled / unavailable copy. */
export function freePathIsDisabled(blob: string): boolean {
  return FREE_DISABLED_RE.test(blob);
}

export function requiresPremiumToken(blob: string): boolean {
  return PREMIUM_TOKEN_RE.test(blob);
}

/**
 * Classify listing pricing from page HTML.
 * Paid wins on: free disabled, premium token, paid-only $ options.
 * Free only when an active free option exists (or clear free path not negated).
 */
export function classifyListingPricingFromHtml(
  html: string | null | undefined
): ListingPricingKind {
  const raw = String(html ?? '');
  if (!raw.trim()) return 'unknown';

  const { scopeHtml, hasFormOrPaymentSignal } = extractFormAndPaymentHtml(raw);
  if (!hasFormOrPaymentSignal || !scopeHtml.trim()) return 'unknown';

  const blob = textBlob(scopeHtml);
  const fullBlob = textBlob(raw);

  // 1) Hard paid gates
  if (requiresPremiumToken(blob) || requiresPremiumToken(fullBlob)) return 'paid';
  if (freePathIsDisabled(blob) || freePathIsDisabled(fullBlob)) return 'paid';

  // 2) Selectable plan options
  const plans = extractPlanOptions(scopeHtml);
  const freePlans = plans.filter((p) => p.kind === 'free');
  const paidPlans = plans.filter((p) => p.kind === 'paid');

  if (freePlans.length > 0) {
    // Free option exists — still paid if page says free is disabled
    if (freePathIsDisabled(blob) || freePathIsDisabled(fullBlob)) return 'paid';
    return 'free';
  }

  if (paidPlans.length > 0 && freePlans.length === 0) {
    // Only paid tiers with prices / premium names
    if (paidPlans.some((p) => COST_RE.test(p.text)) || paidPlans.length >= 1) {
      // If page has free word only in disabled copy, already handled
      // If free word exists elsewhere as active copy without a plan option, be conservative: paid
      return 'paid';
    }
  }

  // 3) Pricing section shows $ amounts and no active free plan
  const priceHits = blob.match(COST_RE) || fullBlob.match(COST_RE);
  if (priceHits && priceHits.length > 0 && !FREE_WORD_RE.test(blob)) {
    return 'paid';
  }
  if (
    /(?:pricing|price|payment)/i.test(blob) &&
    COST_RE.test(blob) &&
    !/\bfree\b/i.test(blob.replace(FREE_DISABLED_RE, ' '))
  ) {
    return 'paid';
  }

  // 4) Strip disabled free / token noise, then look for remaining active free language
  const cleaned = blob.replace(FREE_DISABLED_RE, ' ').replace(PREMIUM_TOKEN_RE, ' ');
  const hasActiveFreePhrase =
    /\bfree\s+(?:listing|submission|review|plan|option)\b/i.test(cleaned) ||
    /\bregular\s+(?:listings?|reviews?)\s+free\b/i.test(cleaned) ||
    /\breviews?\s+free\b/i.test(cleaned) ||
    (FREE_WORD_RE.test(cleaned) && !COST_RE.test(cleaned));

  if (hasActiveFreePhrase) {
    // Free phrase + only $-priced radio options and no free plan option → paid
    if (paidPlans.length > 0 && freePlans.length === 0 && paidPlans.every((p) => COST_RE.test(p.text) || /\b(premium|featured|paid)\b/i.test(p.text))) {
      return 'paid';
    }
    return 'free';
  }

  // 5) User rule: no usable free → paid when we have a submit surface
  return 'paid';
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
