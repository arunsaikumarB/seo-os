import type { FillableRole, NormalizedField } from '../types';

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_./-]+/g, ' ')
    .replace(/[^a-z0-9\s+@]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function visibleText(el: Element | null | undefined, max = 120): string {
  if (!el) return '';
  const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return t.slice(0, max);
}

function resolveLabelFor(el: HTMLElement): string {
  if (el.id) {
    try {
      const byFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (byFor) {
        const clone = byFor.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('input, textarea, select, button').forEach((n) => n.remove());
        const t = visibleText(clone, 200);
        if (t) return t;
      }
    } catch {
      /* ignore invalid id */
    }
  }
  const parentLabel = el.closest('label');
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('input, textarea, select, button').forEach((n) => n.remove());
    const t = visibleText(clone, 200);
    if (t) return t;
  }
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .map((n) => visibleText(n!, 80));
    if (parts.length) return parts.join(' ');
  }
  return '';
}

function nearbyText(el: HTMLElement): string {
  const bits: string[] = [];
  const prev = el.previousElementSibling;
  if (prev && !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(prev.tagName)) {
    bits.push(visibleText(prev, 80));
  }
  const parent = el.parentElement;
  if (parent) {
    for (const child of Array.from(parent.children).slice(0, 6)) {
      if (child === el) break;
      if (['LABEL', 'SPAN', 'DIV', 'P', 'LEGEND', 'STRONG', 'B'].includes(child.tagName)) {
        bits.push(visibleText(child, 60));
      }
    }
    const legend = parent.closest('fieldset')?.querySelector('legend');
    if (legend) bits.push(visibleText(legend, 80));
  }
  return bits.filter(Boolean).join(' ').slice(0, 200);
}

function sectionHeading(el: HTMLElement): string {
  let node: HTMLElement | null = el.parentElement;
  for (let depth = 0; depth < 8 && node; depth++) {
    let cursor: Element | null = node;
    while (cursor) {
      const sibling: Element | null = cursor.previousElementSibling;
      if (!sibling) break;
      if (/^H[1-6]$/.test(sibling.tagName) || sibling.getAttribute('role') === 'heading') {
        return visibleText(sibling, 100);
      }
      const inner = sibling.querySelector('h1,h2,h3,h4,h5,h6,[role="heading"]');
      if (inner) return visibleText(inner, 100);
      cursor = sibling;
    }

    const headings = node.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]');
    for (let i = headings.length - 1; i >= 0; i--) {
      const h = headings[i] as HTMLElement;
      const pos = h.compareDocumentPosition(el);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
        return visibleText(h, 100);
      }
    }
    node = node.parentElement;
  }
  return '';
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

  // Zero-size non-contenteditable
  if (el.getAttribute('contenteditable') !== 'true') {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return true;
  }
  return false;
}

function isRequired(el: HTMLElement): boolean {
  if (el.hasAttribute('required') || el.getAttribute('aria-required') === 'true') return true;
  const label = resolveLabelFor(el) + ' ' + nearbyText(el);
  return /\*\s*$|\(required\)|\brequired\b/i.test(label);
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

  return {
    uid: nextUid(el),
    element: el,
    kind,
    inputType,
    name: el.getAttribute('name') ?? '',
    id: el.id ?? '',
    placeholder: el.getAttribute('placeholder') ?? '',
    ariaLabel: el.getAttribute('aria-label') ?? '',
    label: resolveLabelFor(el),
    nearbyText: nearbyText(el),
    sectionHeading: sectionHeading(el),
    required: isRequired(el),
    autocomplete: el.getAttribute('autocomplete') ?? '',
    valueAttr: el.getAttribute('value') ?? '',
  };
}

/**
 * Phase 1.1 DOM scanner — per-control, never page-classifies.
 * Scans: input, textarea, select, radio, checkbox, contenteditable.
 * Ignores: hidden, disabled, readonly.
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
        // submit/button still tracked as submit-classifiable via name? Spec wants submit classification
        // for submit/button inputs we include them so classifier can mark as submit
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

  // Explicit submit buttons outside input[type=submit]
  root.querySelectorAll('button').forEach((btn) => {
    const type = (btn.getAttribute('type') || 'submit').toLowerCase();
    if (type === 'submit' || /submit|sign up|register|continue|pay|checkout/i.test(btn.textContent ?? '')) {
      push(btn, 'input', type === 'button' ? 'button' : 'submit');
    }
  });

  return out;
}

export function fieldDisplayLabel(field: NormalizedField): string {
  return (
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
