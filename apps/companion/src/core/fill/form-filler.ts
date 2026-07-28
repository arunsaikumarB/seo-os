import { fieldDisplayLabel, scanDomFields } from '../detect/dom-scanner';
import { resolveScanRoot } from '../detect/submission-form';
import {
  classifyFields,
  debugLogClassifications,
  isEmptyValue,
  isFillConfident,
} from '../match/classifier';
import { ROLE_LABELS } from '../match/aliases';
import { packageValueForRole } from '../package/values';
import {
  applyFillHighlights,
  clearFillHighlights,
} from '../overlay/highlights';
import { setMissingTargets } from '../overlay/missing-nav';
import type {
  DomainLearningHook,
  FieldClassification,
  FillDetail,
  FillResult,
  FillSummary,
  FillableRole,
  OpportunityPackageFields,
} from '../types';
import { CONFIDENCE_FILL_THRESHOLD, FILLABLE_ROLES } from '../types';

function setNativeValue(el: HTMLElement, value: string): boolean {
  if (el instanceof HTMLSelectElement) {
    const needle = value.trim().toLowerCase();
    const options = Array.from(el.options);
    const hit =
      options.find(
        (o) => o.value.toLowerCase() === needle || o.text.toLowerCase() === needle
      ) ??
      options.find(
        (o) =>
          o.text.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle)
      );
    if (!hit) return false;
    const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    desc?.set?.call(el, hit.value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox' || el.type === 'radio') {
      const needle = value.trim().toLowerCase();
      const blob = `${el.value} ${el.getAttribute('aria-label') ?? ''}`.toLowerCase();
      if (!needle || !blob.includes(needle)) return false;
      el.checked = true;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    desc?.set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  if (el instanceof HTMLTextAreaElement) {
    const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    desc?.set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  if (el.isContentEditable) {
    el.focus();
    el.textContent = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  return false;
}

const SKIP_ROLES = new Set([
  'captcha',
  'payment',
  'submit',
  'login',
  'search',
  'newsletter',
]);

export interface FillFormOptions {
  package: OpportunityPackageFields;
  root?: ParentNode;
  domainLearning?: DomainLearningHook;
  threshold?: number;
  debug?: boolean;
  /** Only fill currently visible fields (wizard step) */
  visibleOnly?: boolean;
}

function isVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Fill current step of the submission form from the SEO OS opportunity package.
 * Never clicks Submit. Never solves CAPTCHA. Never uses a local business profile.
 */
export function fillMatchedFields(options: FillFormOptions): FillResult {
  const threshold = options.threshold ?? CONFIDENCE_FILL_THRESHOLD;
  const { root } = options.root
    ? { root: options.root }
    : resolveScanRoot(document);

  let fields = scanDomFields(root);
  if (options.visibleOnly !== false) {
    fields = fields.filter((f) => isVisible(f.element));
  }

  const classifications = classifyFields(fields, {
    domainLearning: options.domainLearning,
  });

  const details: FillDetail[] = [];
  const filledUids = new Set<string>();
  const highlightFilled: HTMLElement[] = [];
  const highlightSkipped: HTMLElement[] = [];
  const highlightMissing: HTMLElement[] = [];

  let filled = 0;
  let skipped = 0;
  let missing = 0;
  let captcha = 0;

  for (const c of classifications) {
    const label = fieldDisplayLabel(c.field);
    const base = {
      uid: c.field.uid,
      role: c.role,
      label,
      confidence: c.confidence,
      matchedAlias: c.matchedAlias,
      matchedBy: c.matchedBy,
      required: c.field.required,
    };

    if (c.role === 'captcha') {
      captcha += 1;
      skipped += 1;
      highlightSkipped.push(c.field.element);
      details.push({ ...base, action: 'captcha', reason: 'CAPTCHA — never filled' });
      continue;
    }

    if (SKIP_ROLES.has(c.role)) {
      skipped += 1;
      highlightSkipped.push(c.field.element);
      details.push({
        ...base,
        action: 'skipped',
        reason: `${c.role} — skipped`,
      });
      continue;
    }

    if (c.role === 'unknown' || !isFillConfident(c, threshold)) {
      skipped += 1;
      highlightSkipped.push(c.field.element);
      if (c.field.required && isEmptyValue(c.field.element)) {
        missing += 1;
        highlightMissing.push(c.field.element);
        details.push({
          ...base,
          action: 'missing',
          reason: c.confidence > 0 ? 'Low confidence / required empty' : 'Unknown required field',
        });
      } else {
        details.push({
          ...base,
          action: 'skipped',
          reason:
            c.confidence > 0 && c.confidence < threshold
              ? `Low confidence (${c.confidence}% < ${threshold}%)`
              : c.reason || 'Unknown field',
        });
      }
      continue;
    }

    const value = packageValueForRole(options.package, c.role as FillableRole);
    if (!value) {
      skipped += 1;
      if (c.field.required) {
        missing += 1;
        highlightMissing.push(c.field.element);
        details.push({ ...base, action: 'missing', reason: 'Empty in opportunity package' });
      } else {
        highlightSkipped.push(c.field.element);
        details.push({ ...base, action: 'empty_package', reason: 'Empty in opportunity package' });
      }
      continue;
    }

    // Skip already filled (wizard re-entry)
    if (!isEmptyValue(c.field.element)) {
      const current =
        c.field.element instanceof HTMLInputElement ||
        c.field.element instanceof HTMLTextAreaElement
          ? c.field.element.value.trim()
          : (c.field.element.textContent ?? '').trim();
      if (current && current.toLowerCase() === value.toLowerCase()) {
        filled += 1;
        filledUids.add(c.field.uid);
        highlightFilled.push(c.field.element);
        details.push({ ...base, action: 'filled', reason: 'Already filled' });
        continue;
      }
    }

    try {
      const ok = setNativeValue(c.field.element, value);
      if (!ok) {
        skipped += 1;
        highlightSkipped.push(c.field.element);
        details.push({ ...base, action: 'skipped', reason: 'Could not set value' });
        continue;
      }
      filled += 1;
      filledUids.add(c.field.uid);
      highlightFilled.push(c.field.element);
      details.push({ ...base, action: 'filled', reason: c.reason });
    } catch (err) {
      skipped += 1;
      highlightSkipped.push(c.field.element);
      details.push({
        ...base,
        action: 'skipped',
        reason: err instanceof Error ? err.message : 'fill_error',
      });
    }
  }

  clearFillHighlights();
  applyFillHighlights({
    filled: highlightFilled,
    skipped: highlightSkipped,
    missing: highlightMissing,
  });
  setMissingTargets(highlightMissing);

  const summary: FillSummary = {
    detected: fields.length,
    filled,
    skipped,
    missing,
    captcha,
    details,
    missingRequired: details.filter((d) => d.action === 'missing'),
  };

  if (options.debug) {
    debugLogClassifications(classifications, filledUids);
  }

  return { summary, classifications };
}

export function previewClassifications(options: {
  root?: ParentNode;
  domainLearning?: DomainLearningHook;
}): {
  fields: ReturnType<typeof scanDomFields>;
  classifications: FieldClassification[];
  formReason: string;
} {
  const scoped = options.root
    ? { root: options.root, reason: 'custom' }
    : resolveScanRoot(document);
  const fields = scanDomFields(scoped.root).filter((f) => isVisible(f.element));
  const classifications = classifyFields(fields, {
    domainLearning: options.domainLearning,
  });
  return { fields, classifications, formReason: scoped.reason };
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role;
}

export { FILLABLE_ROLES };
