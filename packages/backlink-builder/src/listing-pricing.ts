/**
 * Free vs paid listing classifier — user rule for Submit Backlinks.
 *
 * Rule:
 * - If the form or payment/pricing section contains the word "free" → Free
 *   (including sites that offer both free and paid — human picks free on the site)
 * - If those sections have no word "free" → Paid (set aside)
 * - No usable form/payment HTML → Unknown (keep in worklist until scanned)
 */

export type ListingPricingKind = 'free' | 'paid' | 'unknown';

const FREE_WORD_RE = /\bfree\b/i;

const PAYMENT_SECTION_RE =
  /<(section|div|aside|table|fieldset|form|ul|ol)[^>]*(?:class|id|name|data-[\w-]*)=["'][^"']*(?:pric|plan|payment|package|listing[\s_-]?type|link[\s_-]?type|membership|checkout|billing|subscribe)[^"']*["'][^>]*>[\s\S]{0,12000}/gi;

const OPTION_LABEL_RE = /<(option|label)\b[^>]*>[\s\S]*?<\/(?:option|label)>/gi;

/** Strip tags for word search. */
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
    if (/free|paid|premium|featured|price|\$|plan|listing|sponsor/i.test(chunk)) {
      parts.push(chunk);
      hasFormOrPaymentSignal = true;
    }
  }

  // Radios / checkboxes often lack wrapping labels with the plan name nearby
  if (
    /type=["']radio["']/i.test(html) &&
    /(?:link\s*type|listing\s*type|plan|package|pricing)/i.test(html)
  ) {
    hasFormOrPaymentSignal = true;
    parts.push(html);
  }

  if (parts.length) {
    return { scopeHtml: parts.join('\n'), hasFormOrPaymentSignal };
  }

  // No form/payment blocks — use full page only if it looks like a submit surface
  const looksLikeSubmit =
    /submit|add\s+(?:your\s+)?(?:site|url|listing)|directory|listing/i.test(html) ||
    /<(input|textarea)\b/i.test(html);
  return {
    scopeHtml: looksLikeSubmit ? html : '',
    hasFormOrPaymentSignal: looksLikeSubmit,
  };
}

/**
 * Classify listing pricing from page HTML using the Free-word rule.
 */
export function classifyListingPricingFromHtml(
  html: string | null | undefined
): ListingPricingKind {
  const raw = String(html ?? '');
  if (!raw.trim()) return 'unknown';

  const { scopeHtml, hasFormOrPaymentSignal } = extractFormAndPaymentHtml(raw);
  if (!hasFormOrPaymentSignal || !scopeHtml.trim()) return 'unknown';

  const blob = textBlob(scopeHtml);
  if (FREE_WORD_RE.test(blob)) return 'free';
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
