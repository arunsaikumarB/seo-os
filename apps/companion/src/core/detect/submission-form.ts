/**
 * Locate the actual directory / listing submission form.
 * Never treat search, login, newsletter, or coupon widgets as the target.
 */

const SUBMIT_HEADING =
  /\b(submit|add business|add listing|directory submission|business details|add url|suggest listing|new listing|submit (your )?site|list your (business|site|company)|create listing|post listing)\b/i;

const IGNORE_FORM =
  /\b(search|newsletter|subscribe|login|log in|sign in|signin|register|sign up|signup|filter|coupon|promo|password|forgot|cart|checkout|payment|donate)\b/i;

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
    (form.textContent ?? '').slice(0, 800),
  ].join(' ');
}

function controlCount(form: HTMLFormElement): number {
  return form.querySelectorAll('input:not([type="hidden"]), textarea, select, [contenteditable="true"]')
    .length;
}

function scoreForm(form: HTMLFormElement): number {
  const blob = formBlob(form);
  if (IGNORE_FORM.test(blob) && !SUBMIT_HEADING.test(blob)) return -100;
  let score = controlCount(form) * 2;
  if (SUBMIT_HEADING.test(blob)) score += 50;
  if (/method\s*=\s*["']?post/i.test(form.outerHTML.slice(0, 200))) score += 5;
  if (form.querySelector('textarea')) score += 8;
  if (form.querySelector('input[type="url"], input[name*="url" i]')) score += 10;
  if (form.querySelector('input[type="email"]')) score += 6;
  // Penalize tiny search-like forms
  if (controlCount(form) <= 2 && /search/i.test(blob)) score -= 40;
  return score;
}

/**
 * Returns the best submission form, or null if none look like a listing form.
 * Callers may fall back to document for orphan fields inside a wizard without <form>.
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
  // Require a positive signal — avoid grabbing a search box
  if (!best || bestScore < 8) return null;
  return best;
}

/** Root to scan: preferred submission form, else document (wizard / formless pages). */
export function resolveScanRoot(doc: Document = document): {
  root: ParentNode;
  form: HTMLFormElement | null;
  reason: string;
} {
  const form = findSubmissionForm(doc);
  if (form) {
    return { root: form, form, reason: 'submission_form' };
  }
  return { root: doc.body ?? doc, form: null, reason: 'page_fallback' };
}
