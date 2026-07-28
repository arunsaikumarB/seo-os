import type { FillableRole, NormalizedField } from '../types';
import { resolveFieldLabel } from './label-resolver';

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_./-]+/g, ' ')
    .replace(/[^a-z0-9\s+@]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isIgnoredControl(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return true;
  if (el.hasAttribute('readonly') || el.getAttribute('aria-readonly') === 'true') return true;
  if ('readOnly' in el && (el as HTMLInputElement).readOnly) return true;
  if ('disabled' in el && (el as HTMLInputElement).disabled) return true;

  const type = (el.getAttribute('type') ?? '').toLowerCase();
  if (type === 'hidden') return true;
  if (el.hidden || el.getAttribute('aria-hidden') === 'true') return true;

  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return true;

  if (el.getAttribute('contenteditable') !== 'true') {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return true;
  }
  return false;
}

function isRequired(el: HTMLElement, rawLabel: string, nearby: string): boolean {
  if (el.hasAttribute('required') || el.getAttribute('aria-required') === 'true') return true;
  const blob = `${rawLabel} ${nearby}`;
  return /\*|required/i.test(blob);
}

let uidSeq = 0;
const uidByEl = new WeakMap<HTMLElement, string>();

function nextUid(el: HTMLElement): string {
  const existing = uidByEl.get(el);
  if (existing) return existing;
  uidSeq += 1;
  const base = el.id || el.getAttribute('name') || el.tagName.toLowerCase();
  const uid = `soc-${uidSeq}-${normalizeText(base).replace(/\s+/g, '-').slice(0, 40) || 'field'}`;
  uidByEl.set(el, uid);
  return uid;
}

function toNormalized(
  el: HTMLElement,
  kind: NormalizedField['kind'],
  inputType: string
): NormalizedField | null {
  if (isIgnoredControl(el)) return null;

  const resolved = resolveFieldLabel(el);

  return {
    uid: nextUid(el),
    element: el,
    kind,
    inputType,
    name: el.getAttribute('name') ?? '',
    id: el.id ?? '',
    placeholder: el.getAttribute('placeholder') ?? '',
    ariaLabel: el.getAttribute('aria-label') ?? '',
    label: resolved.label,
    rawLabel: resolved.rawLabel,
    labelResolver: resolved.resolver,
    labelResolverConfidence: resolved.confidence,
    nearbyText: resolved.nearbyText,
    sectionHeading: resolved.sectionHeading,
    required: isRequired(el, resolved.rawLabel, resolved.nearbyText),
    autocomplete: el.getAttribute('autocomplete') ?? '',
    valueAttr: el.getAttribute('value') ?? '',
  };
}

/**
 * DOM scanner — per-control. Labels come from Label Resolution Engine (Phase 2.3.1).
 */
export function scanDomFields(root: ParentNode = document): NormalizedField[] {
  const out: NormalizedField[] = [];
  const seen = new WeakSet<Element>();

  const push = (el: HTMLElement, kind: NormalizedField['kind'], inputType: string) => {
    if (seen.has(el)) return;
    seen.add(el);
    const n = toNormalized(el, kind, inputType);
    if (n) out.push(n);
  };

  root.querySelectorAll('input, textarea, select, [contenteditable="true"]').forEach((node) => {
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (el.getAttribute('contenteditable') === 'true') {
      push(el, 'contenteditable', 'contenteditable');
      return;
    }

    if (tag === 'textarea') {
      push(el, 'textarea', 'textarea');
      return;
    }

    if (tag === 'select') {
      push(el, 'select', 'select');
      return;
    }

    if (tag === 'input') {
      const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
      if (['submit', 'button', 'image', 'reset', 'file', 'hidden', 'range', 'color'].includes(type)) {
        if (['submit', 'button', 'image', 'reset'].includes(type)) {
          push(el, 'input', type);
        }
        return;
      }
      if (type === 'radio') {
        push(el, 'radio', 'radio');
        return;
      }
      if (type === 'checkbox') {
        push(el, 'checkbox', 'checkbox');
        return;
      }
      push(el, 'input', type);
    }
  });

  root.querySelectorAll('button').forEach((btn) => {
    const type = (btn.getAttribute('type') || 'submit').toLowerCase();
    if (
      type === 'submit' ||
      /submit|sign up|register|continue|pay|checkout/i.test(btn.textContent ?? '')
    ) {
      push(btn, 'input', type === 'button' ? 'button' : 'submit');
    }
  });

  return out;
}

export function fieldDisplayLabel(field: NormalizedField): string {
  return (
    field.rawLabel ||
    field.label ||
    field.placeholder ||
    field.ariaLabel ||
    field.name ||
    field.id ||
    field.inputType ||
    'field'
  );
}

/** Merge alias overrides for Phase 2 hooks */
export function mergeAliasLists(
  base: Record<FillableRole, string[]>,
  overlay?: Partial<Record<FillableRole, string[]>> | null
): Record<FillableRole, string[]> {
  if (!overlay) return base;
  const next = { ...base };
  for (const [role, extra] of Object.entries(overlay) as Array<[FillableRole, string[]]>) {
    if (!extra?.length) continue;
    next[role] = [...new Set([...(base[role] ?? []), ...extra.map((a) => a.toLowerCase())])];
  }
  return next;
}
