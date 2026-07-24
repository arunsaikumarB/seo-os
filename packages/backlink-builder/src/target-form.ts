/**
 * Phase 10 — pick ONE submission <form> on a page.
 * Never merge fields across forms; never fall back to login/search/newsletter.
 */

export type EnumeratedForm = {
  index: number;
  openTag: string;
  /** Inner HTML between <form> and </form> */
  innerHtml: string;
  /** Full <form>...</form> block */
  fullHtml: string;
  action: string | null;
  method: string | null;
  id: string | null;
  name: string | null;
  /** Stable CSS-ish selector for re-lock */
  selector: string;
};

export type FormDisqualifyReason =
  | 'password_login'
  | 'search_only'
  | 'newsletter_only'
  | 'empty';

export type TargetFormScore = {
  score: number;
  reason: string;
  hasTitle: boolean;
  hasDesc: boolean;
  hasUrl: boolean;
  hasEmail: boolean;
  hasCategory: boolean;
  hasTextarea: boolean;
  fieldCount: number;
};

export type TargetFormPick = {
  formFound: boolean;
  form: EnumeratedForm | null;
  score: TargetFormScore | null;
  /** Why other forms were skipped */
  disqualified: Array<{ index: number; selector: string; reason: FormDisqualifyReason }>;
  failureReason: string | null;
};

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`${name}=["']([^"']*)["']`, 'i').exec(tag);
  return m?.[1] ?? null;
}

function cssEscapeIdent(value: string): string {
  return value.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
}

function formSelector(openTag: string, index: number): string {
  const id = attr(openTag, 'id');
  if (id) return `form#${cssEscapeIdent(id)}`;
  const name = attr(openTag, 'name');
  if (name) return `form[name="${name}"]`;
  const action = attr(openTag, 'action');
  if (action) return `form[action="${action}"]`;
  return `form:nth-of-type(${index + 1})`;
}

/** Split page HTML into discrete <form> elements (never merges). */
export function enumerateHtmlForms(html: string): EnumeratedForm[] {
  const forms: EnumeratedForm[] = [];
  const re = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let m: RegExpExecArray | null;
  let index = 0;
  while ((m = re.exec(html)) !== null) {
    const openTag = m[1] ?? '';
    const innerHtml = m[2] ?? '';
    const fullHtml = m[0];
    const id = attr(openTag, 'id');
    const name = attr(openTag, 'name');
    const action = attr(openTag, 'action');
    const method = attr(openTag, 'method');
    forms.push({
      index,
      openTag,
      innerHtml,
      fullHtml,
      action,
      method,
      id,
      name,
      selector: formSelector(openTag, index),
    });
    index += 1;
  }
  return forms;
}

type FieldSignal = {
  type: string;
  name: string | null;
  id: string | null;
  label: string | null;
};

/** Lightweight field scan for scoring (does not run full Form Reader). */
export function scanFormControls(formHtml: string): FieldSignal[] {
  const out: FieldSignal[] = [];
  const inputRe = /<input\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = inputRe.exec(formHtml)) !== null) {
    const a = m[1];
    const type = (attr(a, 'type') ?? 'text').toLowerCase();
    if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset') continue;
    out.push({
      type,
      name: attr(a, 'name'),
      id: attr(a, 'id'),
      label: null,
    });
  }
  const taRe = /<textarea\b([^>]*)>/gi;
  while ((m = taRe.exec(formHtml)) !== null) {
    const a = m[1];
    out.push({
      type: 'textarea',
      name: attr(a, 'name'),
      id: attr(a, 'id'),
      label: null,
    });
  }
  const selRe = /<select\b([^>]*)>/gi;
  while ((m = selRe.exec(formHtml)) !== null) {
    const a = m[1];
    out.push({
      type: 'select',
      name: attr(a, 'name'),
      id: attr(a, 'id'),
      label: null,
    });
  }
  return out;
}

function controlBlob(c: FieldSignal): string {
  return [c.name, c.id, c.label, c.type].filter(Boolean).join(' ').toLowerCase();
}

/**
 * Disqualify login / search / newsletter chrome.
 * Returns a reason string, or null if the form may be a submission candidate.
 */
export function disqualifyForm(
  formHtml: string,
  controls: FieldSignal[],
  meta?: { action?: string | null; id?: string | null; name?: string | null }
): FormDisqualifyReason | null {
  if (controls.length === 0) return 'empty';

  // Password present: disqualify login chrome, keep registration/listing forms
  // that also carry business/title/url/description signals.
  if (
    controls.some((c) => c.type === 'password') ||
    /type=["']password["']/i.test(formHtml)
  ) {
    const hasListingSignal = controls.some((c) => {
      const b = controlBlob(c);
      return (
        c.type === 'textarea' ||
        c.type === 'url' ||
        /title|business|company|listing|store|website|url|description|article|category/i.test(
          b
        )
      );
    });
    const action = `${meta?.action ?? ''} ${meta?.id ?? ''} ${meta?.name ?? ''}`.toLowerCase();
    const openTag = /^<form\b([^>]*)>/i.exec(formHtml)?.[1] ?? '';
    const actionAttr = attr(openTag, 'action') ?? '';
    const blob = `${action} ${actionAttr}`.toLowerCase();
    const loginAction = /login|signin|sign-in|log-in|auth\/login|session/i.test(blob);
    const registerAction = /register|signup|sign-up|create.?account|join/i.test(blob);
    if (loginAction && !registerAction) return 'password_login';
    if (!hasListingSignal) return 'password_login';
  }

  const visible = controls.filter((c) => c.type !== 'checkbox' && c.type !== 'radio');
  if (visible.length === 1 && (visible[0]!.type === 'search' || /^(q|query|search)$/i.test(visible[0]!.name ?? ''))) {
    return 'search_only';
  }
  if (
    visible.length <= 2 &&
    visible.every(
      (c) =>
        c.type === 'search' ||
        /^(q|query|search|keywords?)$/i.test(c.name ?? '') ||
        /search/i.test(controlBlob(c))
    )
  ) {
    return 'search_only';
  }

  // Newsletter: email (+ maybe name) + subscribe copy, no title/desc/url/textarea
  const hasTextarea = controls.some((c) => c.type === 'textarea');
  const hasTitleish = controls.some((c) =>
    /title|business|company|listing|article|description|website|url|category/i.test(controlBlob(c))
  );
  const emailish = controls.filter(
    (c) => c.type === 'email' || /e-?mail|newsletter|subscribe/i.test(controlBlob(c))
  );
  const subscribeCopy = /newsletter|subscribe|sign\s*up\s*for\s*(our\s*)?(news|updates)/i.test(
    formHtml
  );
  if (
    !hasTextarea &&
    !hasTitleish &&
    emailish.length >= 1 &&
    controls.length <= 3 &&
    (subscribeCopy || emailish.some((c) => /newsletter|subscribe/i.test(controlBlob(c))))
  ) {
    return 'newsletter_only';
  }

  return null;
}

/** Score a candidate submission form (higher = more likely the real listing form). */
export function scoreTargetForm(form: EnumeratedForm, controls: FieldSignal[]): TargetFormScore {
  let hasTitle = false;
  let hasDesc = false;
  let hasUrl = false;
  let hasEmail = false;
  let hasCategory = false;
  let hasTextarea = false;
  let hasName = false;

  for (const c of controls) {
    const b = controlBlob(c);
    if (c.type === 'textarea') hasTextarea = true;
    if (c.type === 'url' || (/^(website|url|homepage)$/i.test(c.name ?? '') && c.type !== 'select')) {
      hasUrl = true;
    } else if (/\b(website|url|homepage)\b/i.test(b) && (c.type === 'text' || c.type === 'url')) {
      hasUrl = true;
    }
    if (/title|headline|business.?name|company.?name|listing.?name|article|^topic$/i.test(b)) {
      hasTitle = true;
    }
    if (
      c.type === 'textarea' ||
      /desc|about|message|content|bio|summary|article|body/i.test(b)
    ) {
      hasDesc = true;
    }
    if (c.type === 'email' || /e-?mail/i.test(b)) hasEmail = true;
    if (c.type === 'select' || /categor|industry|niche|^type$/i.test(b)) hasCategory = true;
    if (/^(your.?name|contact.?name|owner.?name|full.?name|author)$/i.test(c.name ?? '') || /your.?name|contact.?name/i.test(b)) {
      hasName = true;
    }
  }

  let score = Math.min(controls.length, 10);
  if (hasTitle) score += 4;
  if (hasDesc) score += 4;
  if (hasUrl) score += 3;
  if (hasEmail) score += 2;
  if (hasCategory) score += 2;
  if (hasTextarea) score += 3;
  if (hasName) score += 1;

  const action = `${form.action ?? ''} ${form.id ?? ''} ${form.name ?? ''}`.toLowerCase();
  if (/submit|add|post|listing|directory|suggest|contribute|publish|new/i.test(action)) {
    score += 5;
  }
  if (/login|signin|sign-in|auth|newsletter|search|subscribe/i.test(action)) {
    score -= 8;
  }

  return {
    score,
    hasTitle,
    hasDesc,
    hasUrl,
    hasEmail,
    hasCategory,
    hasTextarea,
    fieldCount: controls.length,
    reason: [
      `${controls.length} fields`,
      hasTitle ? 'title' : null,
      hasDesc ? 'desc' : null,
      hasUrl ? 'url' : null,
      hasEmail ? 'email' : null,
      hasCategory ? 'category' : null,
      hasTextarea ? 'textarea' : null,
      /submit|add|post/i.test(action) ? 'action' : null,
    ]
      .filter(Boolean)
      .join('+'),
  };
}

const MIN_SUBMISSION_SCORE = 6;

export type SelectTargetFormOptions = {
  /** Prefer this form on re-read when still present and not disqualified */
  lockedSelector?: string | null;
  lockedIndex?: number | null;
  minScore?: number;
};

/**
 * Pick the single best submission form on the page.
 * Never returns a password/login form as a fallback.
 */
export function selectTargetForm(
  pageHtml: string,
  opts: SelectTargetFormOptions = {}
): TargetFormPick {
  const forms = enumerateHtmlForms(pageHtml);
  const disqualified: TargetFormPick['disqualified'] = [];
  const scored: Array<{
    form: EnumeratedForm;
    controls: FieldSignal[];
    scored: TargetFormScore;
  }> = [];

  for (const form of forms) {
    const controls = scanFormControls(form.fullHtml);
    const bad = disqualifyForm(form.fullHtml, controls, {
      action: form.action,
      id: form.id,
      name: form.name,
    });
    if (bad) {
      disqualified.push({ index: form.index, selector: form.selector, reason: bad });
      continue;
    }
    scored.push({ form, controls, scored: scoreTargetForm(form, controls) });
  }

  const minScore = opts.minScore ?? MIN_SUBMISSION_SCORE;

  // Honor lock if still a qualifying candidate
  if (opts.lockedSelector || opts.lockedIndex != null) {
    const locked = scored.find(
      (s) =>
        (opts.lockedSelector && s.form.selector === opts.lockedSelector) ||
        (opts.lockedIndex != null && s.form.index === opts.lockedIndex)
    );
    if (locked && locked.scored.score >= Math.min(minScore, 3)) {
      return {
        formFound: true,
        form: locked.form,
        score: locked.scored,
        disqualified,
        failureReason: null,
      };
    }
  }

  scored.sort((a, b) => b.scored.score - a.scored.score || b.scored.fieldCount - a.scored.fieldCount);
  const best = scored[0];

  // Sole remaining form on the page: lower bar (still never a disqualified login)
  const soleCandidateFloor = scored.length === 1 ? 3 : minScore;

  if (!best || best.scored.score < soleCandidateFloor) {
    // No <form> tags but page has controls — do not invent a merge; honest failure
    // (unless a single orphan block somehow scored — we require real <form> elements)
    return {
      formFound: false,
      form: null,
      score: best?.scored ?? null,
      disqualified,
      failureReason:
        forms.length === 0
          ? 'No submission form found — page has no <form> elements'
          : disqualified.length === forms.length
            ? 'No submission form found — only login/search/newsletter widgets on this page'
            : 'No submission form found — no form scored as a directory/listing submit form',
    };
  }

  return {
    formFound: true,
    form: best.form,
    score: best.scored,
    disqualified,
    failureReason: null,
  };
}

/** Captcha / agreement copy for "you must:" human steps. */
export function detectFormHumanSteps(formHtml: string): string[] {
  const steps: string[] = [];
  const h = formHtml.toLowerCase();

  if (
    /recaptcha|hcaptcha|g-recaptcha|captcha|security.?code|enter the code|type the characters/i.test(
      h
    ) ||
    /name=["'][^"']*(captcha|security_code|seccode|verify)[^"']*["']/i.test(formHtml)
  ) {
    steps.push('enter the code shown');
  }

  if (
    /type=["']checkbox["'][^>]*(terms|agree|rules|policy|accept)/i.test(formHtml) ||
    /(terms|agree|submission.?rules|I agree|accept the)/i.test(h)
  ) {
    if (/agreement|rules|terms|agree|policy/i.test(h)) {
      steps.push('tick the submission-rules agreement');
    }
  }

  return [...new Set(steps)];
}

export function formatYouMustSteps(steps: string[]): string | null {
  if (!steps.length) return null;
  return `you must: ${steps.join(' · ')}`;
}
