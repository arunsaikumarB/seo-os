import type { DetectedField } from '../types';

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function camelToWords(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

/** Find associated <label> text for an input/select/textarea. */
export function resolveLabelText(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
): string {
  if (el.id) {
    const byFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (byFor?.textContent) return byFor.textContent.trim();
  }
  const parentLabel = el.closest('label');
  if (parentLabel?.textContent) {
    const clone = parentLabel.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('input, textarea, select').forEach((n) => n.remove());
    return clone.textContent?.trim() ?? '';
  }
  const aria = el.getAttribute('aria-labelledby');
  if (aria) {
    const parts = aria
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .filter(Boolean);
    if (parts.length) return parts.join(' ');
  }
  return '';
}

function isVisible(el: HTMLElement): boolean {
  if (el.getAttribute('type') === 'hidden') return false;
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

function toDetected(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  tag: DetectedField['tag']
): DetectedField | null {
  if (!isVisible(el as HTMLElement)) return null;
  if (el.disabled) return null;
  if ('readOnly' in el && el.readOnly) return null;

  const type =
    tag === 'input'
      ? (el as HTMLInputElement).type || 'text'
      : tag === 'textarea'
        ? 'textarea'
        : 'select';

  // Skip non-data controls
  if (tag === 'input') {
    const t = type.toLowerCase();
    if (
      ['submit', 'button', 'image', 'reset', 'file', 'checkbox', 'radio', 'hidden', 'range', 'color'].includes(
        t
      )
    ) {
      return null;
    }
  }

  const name = el.getAttribute('name') ?? '';
  const id = el.id ?? '';
  const placeholder = el.getAttribute('placeholder') ?? '';
  const ariaLabel = el.getAttribute('aria-label') ?? '';
  const autocomplete = el.getAttribute('autocomplete') ?? '';
  const labelText = resolveLabelText(el);

  const signals = [labelText, placeholder, name, id, ariaLabel, camelToWords(name), camelToWords(id)]
    .map(normalize)
    .filter(Boolean);

  return {
    element: el,
    tag,
    type: type.toLowerCase(),
    name,
    id,
    placeholder,
    ariaLabel,
    labelText,
    autocomplete,
    signals: [...new Set(signals)],
  };
}

/**
 * Scan the document for fillable form controls.
 * Phase 2 may scope this to a specific form or shadow roots.
 */
export function detectFormFields(root: ParentNode = document): DetectedField[] {
  const fields: DetectedField[] = [];
  const seen = new WeakSet<Element>();

  root.querySelectorAll('input, textarea, select').forEach((node) => {
    if (seen.has(node)) return;
    seen.add(node);
    const tag = node.tagName.toLowerCase() as DetectedField['tag'];
    if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return;
    const detected = toDetected(
      node as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
      tag
    );
    if (detected) fields.push(detected);
  });

  return fields;
}
