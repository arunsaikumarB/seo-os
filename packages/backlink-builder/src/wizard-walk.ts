/**
 * Phase 14 — multi-step submission wizard detection + step heuristics.
 * Pure logic (no Playwright). The API walker uses these signals to advance
 * category → free link-type → continue until the real content form appears.
 */

export const WIZARD_MAX_STEPS = 4;

export const WIZARD_COULD_NOT_REACH_LABEL =
  'Multi-step form — could not auto-reach the form; open and submit manually';

export const WIZARD_PAID_ONLY_LABEL =
  'Paid submission only — skip or submit manually';

export type WizardStepKind =
  | 'content_form'
  | 'category'
  | 'link_type'
  | 'continue_gate'
  | 'paid_only'
  | 'unknown';

export type WizardWalkStatus =
  | 'reached_form'
  | 'paid_only'
  | 'could_not_reach'
  | 'not_a_wizard'
  | 'error';

const NEXT_CONTROL_RE =
  /go\s+to\s+step|next\s+step|\bcontinue\b|\bnext\b|\bproceed\b|go\s+to\s+step\s*(two|2|three|3|four|4)/i;

const FREE_OPTION_RE =
  /\b(regular|free|normal|standard|basic|nofollow\s*free|free\s*listing|no\s*cost|\$\s*0|0\s*(usd|eur)?)\b/i;

const PAID_OPTION_RE =
  /\b(featured|premium|paid|gold|silver|platinum|sponsored|promoted|express|priority)\b/i;

const PRICE_RE = /\$\s*\d+|€\s*\d+|£\s*\d+|\d+\s*(usd|eur|gbp)|per\s*year|\/\s*yr/i;

/** Core listing fields that mean "we're on the real form." */
export function htmlHasCoreContentFields(html: string): boolean {
  const h = String(html ?? '');
  if (!h.trim()) return false;
  // Prefer named inputs that look like title / url / description
  const hasTitle = /<(input|textarea)\b[^>]*(name|id)=["'][^"']*(title|headline|listing.?name)[^"']*["']/i.test(
    h
  );
  const hasUrl =
    /<(input)\b[^>]*(name|id)=["'][^"']*(url|website|site_url|your_url|homepage|recpr_url)[^"']*["']/i.test(
      h
    ) || /<(input)\b[^>]*type=["']url["']/i.test(h);
  const hasDesc =
    /<(textarea)\b[^>]*(name|id)=["'][^"']*(desc|description|article|about|summary|content|meta.?desc)[^"']*["']/i.test(
      h
    ) ||
    /<(input)\b[^>]*(name|id)=["'][^"']*(short.?desc|meta.?desc|description)[^"']*["']/i.test(h);
  // Need at least two of title/url/desc, or title+url, or a textarea description + url
  const n = [hasTitle, hasUrl, hasDesc].filter(Boolean).length;
  if (n >= 2) return true;
  if (hasUrl && hasDesc) return true;
  if (hasTitle && hasDesc) return true;
  return false;
}

/** Visible next/continue control on the page. */
export function htmlHasNextControl(html: string): boolean {
  const h = String(html ?? '');
  if (!h.trim()) return false;
  if (
    /<(button|a)[^>]*>[^<]{0,80}(go\s+to\s+step|next\s+step|continue|proceed|next)\b[^<]{0,40}</i.test(h)
  ) {
    return true;
  }
  if (
    /<(input)\b[^>]*(type=["'](submit|button)["'][^>]*value|value=["'][^"']*["'][^>]*type=["'](submit|button)["'])[^>]*>/i.test(
      h
    ) &&
    NEXT_CONTROL_RE.test(h)
  ) {
    return true;
  }
  if (/value=["'][^"']*(go\s+to\s+step|next\s+step|continue|proceed|\bnext\b)[^"']*["']/i.test(h)) {
    return true;
  }
  return NEXT_CONTROL_RE.test(h) && /<(button|input|a)\b/i.test(h);
}

/**
 * Intermediate wizard step: has a next control and lacks core content fields
 * (category tree, link-type radios, or plain continue gate).
 */
export function isIntermediateWizardStep(html: string): boolean {
  if (!htmlHasNextControl(html)) return false;
  if (htmlHasCoreContentFields(html)) return false;
  return true;
}

export function looksLikeCategoryStep(html: string): boolean {
  const h = String(html ?? '');
  if (/choose\s+a\s+categor|select\s+(a\s+)?categor|pick\s+(a\s+)?categor/i.test(h)) return true;
  if (/<select\b[^>]*(name|id)=["'][^"']*(categor|cat_id|topic|niche|industry)[^"']*["']/i.test(h)) {
    return true;
  }
  if (/<select\b/i.test(h) && /categor|topic|niche|industry/i.test(h) && !htmlHasCoreContentFields(h)) {
    return true;
  }
  return false;
}

export function looksLikeLinkTypeStep(html: string): boolean {
  const h = String(html ?? '');
  if (/link\s*type|choose\s+(a\s+)?link|listing\s*type|select\s+(your\s+)?plan/i.test(h)) {
    return true;
  }
  if (/<(input)\b[^>]*type=["']radio["'][^>]*>/i.test(h) && (FREE_OPTION_RE.test(h) || PAID_OPTION_RE.test(h))) {
    return true;
  }
  if (/<(select)\b[^>]*(name|id)=["'][^"']*link.?type[^"']*["']/i.test(h)) return true;
  return false;
}

/**
 * Paid-only: pricing/link-type step with paid options and no free/regular path.
 */
export function isPaidOnlyWizardStep(html: string): boolean {
  if (!looksLikeLinkTypeStep(html) && !PRICE_RE.test(html)) return false;
  const hasFree = FREE_OPTION_RE.test(html);
  const hasPaid = PAID_OPTION_RE.test(html) || PRICE_RE.test(html);
  return hasPaid && !hasFree;
}

export function classifyWizardStep(html: string): WizardStepKind {
  if (htmlHasCoreContentFields(html)) return 'content_form';
  if (isPaidOnlyWizardStep(html)) return 'paid_only';
  if (looksLikeLinkTypeStep(html)) return 'link_type';
  if (looksLikeCategoryStep(html)) return 'category';
  if (htmlHasNextControl(html) && !htmlHasCoreContentFields(html)) return 'continue_gate';
  return 'unknown';
}

/** True when a radio/option/label text is the free/regular tier. */
export function isFreeTierLabel(text: string): boolean {
  const t = String(text ?? '').trim();
  if (!t) return false;
  if (PAID_OPTION_RE.test(t) && !FREE_OPTION_RE.test(t)) return false;
  return FREE_OPTION_RE.test(t);
}

/** True when label is clearly a paid tier (never auto-select). */
export function isPaidTierLabel(text: string): boolean {
  const t = String(text ?? '').trim();
  if (!t) return false;
  if (FREE_OPTION_RE.test(t) && !PRICE_RE.test(t)) return false;
  return PAID_OPTION_RE.test(t) || PRICE_RE.test(t);
}

/** Placeholder / empty category options to skip. */
export function isPlaceholderOptionLabel(text: string): boolean {
  const t = String(text ?? '').trim();
  if (!t) return true;
  return /^(select|choose|pick|--+|category|please\s+select)/i.test(t);
}

export function formatWizardStepSequence(steps: string[]): string {
  const cleaned = steps.map((s) => s.trim()).filter(Boolean);
  if (!cleaned.length) return '';
  return cleaned.join(' → ');
}

export type WizardWalkResultMeta = {
  status: WizardWalkStatus;
  stepsTaken: string[];
  stepsWalked: number;
  finalUrl: string | null;
  stepLog: string[];
  label: string | null;
};

export function wizardWalkFailureLabel(status: WizardWalkStatus): string | null {
  if (status === 'paid_only') return WIZARD_PAID_ONLY_LABEL;
  if (status === 'could_not_reach' || status === 'error') return WIZARD_COULD_NOT_REACH_LABEL;
  return null;
}
