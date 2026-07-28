import { detectFormFields } from '../detect/form-detector';
import { isConfidentMatch, matchFields } from '../match/field-matcher';
import { profileValueForRole } from '../profile/defaults';
import { SAFETY_POLICY, shouldSkipField } from '../safety/form-guards';
import type {
  BusinessProfile,
  DomainLearningHook,
  FillResult,
  FillSummary,
  FieldMatch,
} from '../types';

function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string
): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  descriptor?.set?.call(el, value);

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function fillSelect(el: HTMLSelectElement, value: string): boolean {
  const needle = value.trim().toLowerCase();
  if (!needle) return false;
  const options = Array.from(el.options);
  const exact = options.find(
    (o) => o.value.toLowerCase() === needle || o.text.toLowerCase() === needle
  );
  const partial =
    exact ??
    options.find(
      (o) =>
        o.text.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle)
    );
  if (!partial) return false;
  setNativeValue(el, partial.value);
  return true;
}

function fieldLabel(m: FieldMatch): string {
  return (
    m.field.labelText ||
    m.field.placeholder ||
    m.field.name ||
    m.field.id ||
    m.field.type ||
    'field'
  );
}

export interface FillFormOptions {
  profile: BusinessProfile;
  root?: ParentNode;
  domainLearning?: DomainLearningHook;
  /** Confidence floor for fill — Phase 1 defaults to medium+ */
  minConfidence?: 'high' | 'medium';
}

/**
 * Detect → match → fill confidently matched fields.
 * Never clicks Submit. Never solves CAPTCHA. Skips login/payment.
 */
export function fillMatchedFields(options: FillFormOptions): FillResult {
  void SAFETY_POLICY; // documented invariant

  const fields = detectFormFields(options.root ?? document);
  const matches = matchFields(fields, {
    domainLearning: options.domainLearning,
    minConfidence: options.minConfidence ?? 'medium',
  });

  const summary: FillSummary = {
    matched: 0,
    filled: 0,
    skipped: 0,
    details: [],
  };

  for (const m of matches) {
    const label = fieldLabel(m);
    const safety = shouldSkipField(m.field);
    if (safety.skip) {
      summary.skipped += 1;
      summary.details.push({
        role: m.role,
        action: 'skipped',
        reason: safety.reason ?? 'safety',
        label,
      });
      continue;
    }

    if (!isConfidentMatch(m, options.minConfidence ?? 'medium')) {
      summary.skipped += 1;
      summary.details.push({
        role: 'unknown',
        action: 'skipped',
        reason: 'unknown_or_low_confidence',
        label,
      });
      continue;
    }

    summary.matched += 1;
    const value = profileValueForRole(options.profile, m.role);
    if (!value) {
      summary.skipped += 1;
      summary.details.push({
        role: m.role,
        action: 'matched_empty',
        reason: 'empty_profile_value',
        label,
      });
      continue;
    }

    try {
      const el = m.field.element;
      if (el instanceof HTMLSelectElement) {
        if (!fillSelect(el, value)) {
          summary.skipped += 1;
          summary.details.push({
            role: m.role,
            action: 'skipped',
            reason: 'no_select_option_match',
            label,
          });
          continue;
        }
      } else {
        setNativeValue(el, value);
      }
      summary.filled += 1;
      summary.details.push({
        role: m.role,
        action: 'filled',
        reason: m.reason,
        label,
      });
    } catch (err) {
      summary.skipped += 1;
      summary.details.push({
        role: m.role,
        action: 'skipped',
        reason: err instanceof Error ? err.message : 'fill_error',
        label,
      });
    }
  }

  // Hard guarantee: do not click any submit buttons
  // (no submit interaction exists in this module)

  return { summary, matches };
}

/** Scan-only preview for the widget (no writes). */
export function previewMatches(options: Omit<FillFormOptions, 'profile'> & { profile?: BusinessProfile }) {
  const fields = detectFormFields(options.root ?? document);
  const matches = matchFields(fields, {
    domainLearning: options.domainLearning,
    minConfidence: options.minConfidence ?? 'medium',
  });
  const confident = matches.filter((m) => isConfidentMatch(m, options.minConfidence ?? 'medium'));
  return { fields, matches, confident };
}
