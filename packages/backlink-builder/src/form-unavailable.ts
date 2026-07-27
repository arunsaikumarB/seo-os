/**
 * Form unavailability + SPA shell detection for Assisted Manual.
 */

export const FORM_UNAVAILABLE_CODE = 'form_unavailable' as const;

export const FORM_UNAVAILABLE_MESSAGE =
  'Form is JavaScript-rendered / behind login — open the site and submit manually, or skip.';

export function htmlHasFormElement(html: string): boolean {
  return /<form[\s>]/i.test(String(html ?? ''));
}

/** Heuristic: page is likely a client-rendered SPA shell (forms may appear after JS). */
export function looksLikeSpaShell(html: string): boolean {
  const raw = String(html ?? '');
  if (!raw.trim()) return false;
  const head = raw.slice(0, 80_000);
  const lower = head.toLowerCase();
  if (
    /__next_data__|__nuxt|data-reactroot|ng-version|webpackjsonp|parcelrequire/i.test(head)
  ) {
    return true;
  }
  if (/id=["'](root|app|__next|__nuxt)["']/i.test(head)) return true;
  if (
    /\b(react|vue\.js|angular|ember|svelte|vite|next\.js|nuxt|remix|gatsby)\b/i.test(lower)
  ) {
    return true;
  }
  // Large script payload, almost no form markup
  const scriptTags = (head.match(/<script[\s>]/gi) ?? []).length;
  if (scriptTags >= 5 && !htmlHasFormElement(raw)) return true;
  return false;
}

/** True when discovery / Form Reader failure is permanently un-actionable in-app. */
export function isFormUnavailableFailure(reason: string | null | undefined): boolean {
  const r = String(reason ?? '').toLowerCase();
  if (!r.trim()) return false;
  if (r.includes(FORM_UNAVAILABLE_CODE)) return true;
  if (r.includes('javascript-rendered') || r.includes('behind login')) return true;
  if (/no\s*<form>|no form elements|page has no <form>/i.test(r)) return true;
  if (/no html fetched/i.test(r)) return true;
  return false;
}

export function formUnavailableMessage(
  _discoveryOrTargetReason?: string | null
): string {
  return FORM_UNAVAILABLE_MESSAGE;
}
