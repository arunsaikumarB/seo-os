import { fieldDisplayLabel, scanDomFields } from '../detect/dom-scanner';
import {
  classifyFields,
  debugLogClassifications,
  isEmptyValue,
  isFillConfident,
} from '../match/classifier';
import { ROLE_LABELS } from '../match/aliases';
import { profileValueForRole } from '../profile/defaults';
import {
  applyFillHighlights,
  clearFillHighlights,
} from '../overlay/highlights';
import { setMissingTargets } from '../overlay/missing-nav';
import type {
  BusinessProfile,
  DomainLearningHook,
  FieldClassification,
  FillDetail,
  FillResult,
  FillSummary,
} from '../types';
import { CONFIDENCE_FILL_THRESHOLD, FILLABLE_ROLES } from '../types';
import type { FillableRole } from '../types';

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
    const proto = HTMLSelectElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    desc?.set?.call(el, hit.value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox' || el.type === 'radio') {
      // Never auto-check payment; for category checkboxes try match value/label
      const needle = value.trim().toLowerCase();
      const label = fieldDisplayLabel({
        uid: '',
        element: el,
        kind: el.type === 'radio' ? 'radio' : 'checkbox',
        inputType: el.type,
        name: el.name,
        id: el.id,
        placeholder: '',
        ariaLabel: el.getAttribute('aria-label') ?? '',
        label: '',
        nearbyText: '',
        sectionHeading: '',
        required: false,
        autocomplete: '',
        valueAttr: el.value,
      });
      const blob = `${el.value} ${label}`.toLowerCase();
      if (!needle || !blob.includes(needle)) return false;
      el.checked = true;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    const proto = HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    desc?.set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  if (el instanceof HTMLTextAreaElement) {
    const proto = HTMLTextAreaElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
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

export interface FillFormOptions {
  profile: BusinessProfile;
  root?: ParentNode;
  domainLearning?: DomainLearningHook;
  threshold?: number;
  debug?: boolean;
}

/**
 * Detect → classify per-field → fill confident business fields.
 * Never clicks Submit. Never solves CAPTCHA. Never fills payment/login/search.
 * Pricing on the page does NOT block filling other fields.
 */
export function fillMatchedFields(options: FillFormOptions): FillResult {
  const threshold = options.threshold ?? CONFIDENCE_FILL_THRESHOLD;
  const fields = scanDomFields(options.root ?? document);
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

    if (c.role === 'payment' || c.role === 'submit' || c.role === 'login' || c.role === 'search') {
      skipped += 1;
      highlightSkipped.push(c.field.element);
      details.push({
        ...base,
        action: 'skipped',
        reason: `${c.role} — skipped (field-level)`,
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

    // Confident fillable role
    const value = profileValueForRole(options.profile, c.role as FillableRole);
    if (!value) {
      skipped += 1;
      if (c.field.required) {
        missing += 1;
        highlightMissing.push(c.field.element);
        details.push({ ...base, action: 'missing', reason: 'Empty profile value' });
      } else {
        highlightSkipped.push(c.field.element);
        details.push({ ...base, action: 'empty_profile', reason: 'Empty profile value' });
      }
      continue;
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

  // Required fillable roles that were confident but somehow still empty
  for (const c of classifications) {
    if (!FILLABLE_ROLES.includes(c.role as FillableRole)) continue;
    if (!isFillConfident(c, threshold)) continue;
    if (filledUids.has(c.field.uid)) continue;
    if (c.field.required && isEmptyValue(c.field.element)) {
      if (!details.some((d) => d.uid === c.field.uid && d.action === 'missing')) {
        missing += 1;
        highlightMissing.push(c.field.element);
      }
    }
  }

  clearFillHighlights();
  applyFillHighlights({
    filled: highlightFilled,
    skipped: highlightSkipped,
    missing: highlightMissing,
  });
  setMissingTargets(highlightMissing);

  const missingRequired = details.filter((d) => d.action === 'missing');

  const summary: FillSummary = {
    detected: fields.length,
    filled,
    skipped,
    missing,
    captcha,
    details,
    missingRequired,
  };

  if (options.debug) {
    debugLogClassifications(classifications, filledUids);
  }

  // Hard guarantee: this module never clicks submit
  return { summary, classifications };
}

export function previewClassifications(options: {
  root?: ParentNode;
  domainLearning?: DomainLearningHook;
}): { fields: ReturnType<typeof scanDomFields>; classifications: FieldClassification[] } {
  const fields = scanDomFields(options.root ?? document);
  const classifications = classifyFields(fields, {
    domainLearning: options.domainLearning,
  });
  return { fields, classifications };
}

export function listMissingRequired(summary: FillSummary | null): FillDetail[] {
  return summary?.missingRequired ?? [];
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role;
}
