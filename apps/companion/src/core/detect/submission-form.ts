/**
 * Locate the actual directory / listing submission form.
 * Never treat search, login, newsletter, or coupon widgets as the target.
 * Prefer large listing forms (TITLE/URL/DESCRIPTION) over tiny POST widgets.
 */

const SUBMIT_HEADING =
  /\b(submit|add business|add listing|directory submission|business details|add url|suggest listing|new listing|submit (your )?site|list your (business|site|company)|create listing|post listing|submit link|continue|next step)\b/i;

/** Widgets to ignore — NOT listing forms that merely mention pricing/payment. */
const IGNORE_FORM =
  /\b(search|newsletter|subscribe|login|log in|sign in|signin|register|sign up|signup|filter|coupon|promo|password|forgot|cart|donate)\b/i;

const LISTING_NAME_RE =
  /\b(TITLE|URL|DESCRIPTION|OWNER_NAME|OWNER_EMAIL|CATEGORY_ID|LINK_TYPE|title|website|description|business_?name)\b/i;

function formBlob(form: HTMLFormElement): string {
  const headingBits: string[] = [];
  let node: Element | null = form;
  for (let i = 0; i < 5 && node; i++) {
    const h = node.querySelector?.('h1,h2,h3,h4,legend,[role="heading"]');
    if (h?.textContent) headingBits.push(h.textContent);
    const prev = node.previousElementSibling;
    if (prev && /^H[1-6]$/i.test(prev.tagName)) headingBits.push(prev.textContent ?? '');
    node = node.parentElement;
  }
  return [
    form.id,
    form.className,
    form.getAttribute('action') ?? '',
    form.getAttribute('name') ?? '',
    form.getAttribute('aria-label') ?? '',
    headingBits.join(' '),
    (form.textContent ?? '').slice(0, 1200),
  ].join(' ');
}

function controlCount(form: HTMLFormElement): number {
  return form.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="reset"]), textarea, select, [contenteditable="true"]'
  ).length;
}

function listingFieldBonus(form: HTMLFormElement): number {
  let bonus = 0;
  const html = form.innerHTML;
  if (LISTING_NAME_RE.test(html)) bonus += 35;
  if (/name=["']TITLE["']/i.test(html) || /name=["']title["']/i.test(html)) bonus += 12;
  if (/name=["']URL["']/i.test(html) || /name=["']url["']/i.test(html)) bonus += 12;
  if (/name=["']DESCRIPTION["']/i.test(html) || /<textarea/i.test(html)) bonus += 12;
  if (/name=["']OWNER_EMAIL["']/i.test(html) || /type=["']email["']/i.test(html)) bonus += 8;
  if (/name=["']OWNER_NAME["']/i.test(html)) bonus += 6;
  if (/name=["']CATEGORY/i.test(html) || /<select/i.test(html)) bonus += 6;
  // Continue / Submit buttons common on directories
  if (/value=["'][^"']*(continue|submit|add|next)[^"']*["']/i.test(html)) bonus += 15;
  return bonus;
}

function hasListingSignals(form: HTMLFormElement): boolean {
  return listingFieldBonus(form) >= 20 || controlCount(form) >= 4;
}

function scoreForm(form: HTMLFormElement): number {
  const blob = formBlob(form);
  const listing = hasListingSignals(form);
  // Ignore search/login widgets — but never kill a real listing form
  if (IGNORE_FORM.test(blob) && !SUBMIT_HEADING.test(blob) && !listing) return -100;

  let score = controlCount(form) * 3;
  if (SUBMIT_HEADING.test(blob)) score += 50;
  if (/method\s*=\s*["']?post/i.test(form.outerHTML.slice(0, 200))) score += 5;
  if (form.querySelector('textarea')) score += 10;
  if (form.querySelector('input[type="url"], input[name*="url" i], input[name="URL" i]')) {
    score += 12;
  }
  if (form.querySelector('input[type="email"], input[name*="email" i]')) score += 8;
  score += listingFieldBonus(form);

  // Penalize tiny search-like forms hard
  const n = controlCount(form);
  if (n <= 2 && /search|\bq\b|name=["']q["']/i.test(blob + form.innerHTML)) score -= 50;
  if (n <= 2 && !listing) score -= 25;
  // Prefer bigger listing forms over 2-field POST widgets
  if (n >= 5) score += 15;
  return score;
}

/**
 * Returns the best submission form, or null if none look like a listing form.
 */
export function findSubmissionForm(root: ParentNode = document): HTMLFormElement | null {
  const forms = Array.from(root.querySelectorAll('form'));
  if (!forms.length) return null;

  let best: HTMLFormElement | null = null;
  let bestScore = 0;
  for (const form of forms) {
    const s = scoreForm(form);
    if (s > bestScore) {
      bestScore = s;
      best = form;
    }
  }
  if (!best || bestScore < 8) return null;
  return best;
}

/**
 * When the winning <form> is tiny (broken HTML / early </form>) but the page
 * still has listing fields nearby, expand the scan root so orphans are filled.
 */
function expandBrokenFormRoot(
  form: HTMLFormElement,
  doc: Document
): { root: ParentNode; reason: string } {
  const n = controlCount(form);
  const pageListing = doc.querySelectorAll(
    'input[name="TITLE" i], input[name="URL" i], textarea[name="DESCRIPTION" i], input[name*="title" i], input[name*="url" i], textarea[name*="desc" i], input[name="OWNER_NAME" i], input[name="OWNER_EMAIL" i]'
  ).length;

  if (n >= 4 || pageListing <= n) {
    return { root: form, reason: 'submission_form' };
  }

  const container =
    form.closest('table, .content, #content, #main, main, article, .submit, #submit') ??
    form.parentElement ??
    doc.body;
  return { root: container ?? doc.body ?? doc, reason: 'form_plus_orphans' };
}

/** Root to scan: preferred submission form (expanded if broken), else document. */
export function resolveScanRoot(doc: Document = document): {
  root: ParentNode;
  form: HTMLFormElement | null;
  reason: string;
} {
  const form = findSubmissionForm(doc);
  if (form) {
    const expanded = expandBrokenFormRoot(form, doc);
    return { root: expanded.root, form, reason: expanded.reason };
  }
  return { root: doc.body ?? doc, form: null, reason: 'page_fallback' };
}
