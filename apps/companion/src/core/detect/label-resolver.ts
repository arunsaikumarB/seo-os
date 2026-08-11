/**
 * Phase 2.3.1 — Robust DOM Label Resolution Engine.
 * Finds the human-visible label for legacy table-based forms (no <label for>).
 * Does not perform alias matching — only extracts + normalizes labels.
 */

export type LabelResolverKind =
  | 'STANDARD_LABEL'
  | 'ARIA'
  | 'PLACEHOLDER'
  | 'PREVIOUS_SIBLING'
  | 'TABLE_CELL'
  | 'NEARBY_TEXT'
  | 'SECTION_HEADING'
  | 'NAME_ATTR'
  | 'ID_ATTR'
  | 'NONE';

export const RESOLVER_CONFIDENCE: Record<LabelResolverKind, number> = {
  STANDARD_LABEL: 100,
  TABLE_CELL: 95,
  PREVIOUS_SIBLING: 90,
  ARIA: 85,
  PLACEHOLDER: 80,
  NEARBY_TEXT: 75,
  NAME_ATTR: 60,
  ID_ATTR: 55,
  SECTION_HEADING: 50,
  NONE: 0,
};

export type ResolvedLabel = {
  /** Normalized label for alias matching (lowercase, stripped) */
  label: string;
  /** Original visible text before normalization */
  rawLabel: string;
  resolver: LabelResolverKind;
  confidence: number;
  /** Nearby / section context (not primary label) */
  nearbyText: string;
  sectionHeading: string;
};

const CONTROL_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']);

function visibleText(el: Element | null | undefined, max = 200): string {
  if (!el) return '';
  const clone = el.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll('input, textarea, select, button, img, script, style, svg')
    .forEach((n) => n.remove());
  const t = (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
  return t.slice(0, max);
}

function isVisibleEl(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0 || (el.textContent ?? '').trim().length > 0;
}

/**
 * Normalize for alias matching:
 * "*Title (max 80 chars):" → "title"
 * "Your Email (Very Important)" → "your email"
 * "Business URL:" → "business url"
 */
export function normalizeLabelText(raw: string): string {
  let s = String(raw ?? '');
  // Drop parenthetical / bracket hints
  s = s.replace(/\([^)]*\)/g, ' ');
  s = s.replace(/\[[^\]]*\]/g, ' ');
  // Strip required markers and punctuation
  s = s.replace(/[*✦●•]+/g, ' ');
  s = s.replace(/[:：;,.!?]+/g, ' ');
  s = s.replace(/[_./\\-]+/g, ' ');
  s = s.toLowerCase();
  s = s.replace(/[^a-z0-9\s+@]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  // Drop trailing instruction noise while keeping short labels intact
  const noise = new Set([
    'max',
    'min',
    'chars',
    'char',
    'characters',
    'character',
    'required',
    'optional',
    'please',
    'enter',
    'only',
    'for',
    'not',
    'displayed',
    'deep',
    'links',
    'are',
    'accepted',
    'keyword',
    'stuffing',
    'short',
    'description',
    'will',
    'be',
    'rejected',
    'very',
    'important',
    'email',
    'confirmation',
    'featured',
    'fast',
    'submissions',
  ]);

  const words = s.split(/\s+/).filter(Boolean);
  if (words.length <= 4) {
    return words.join(' ');
  }

  // Long labels: keep leading phrase until instruction noise starts
  const kept: string[] = [];
  for (const w of words) {
    if (kept.length >= 1 && noise.has(w)) break;
    kept.push(w);
    if (kept.length >= 4) break;
  }
  return kept.join(' ') || words.slice(0, 3).join(' ');
}

function textLooksLikeLabel(raw: string): boolean {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (!t || t.length < 1) return false;
  if (t.length > 180) return false;
  // Avoid dumping whole form text
  if ((t.match(/\n/g) ?? []).length > 2) return false;
  if (/^(submit|continue|next|send|reset|cancel)$/i.test(t.trim())) return false;
  return true;
}

function fromStandardLabel(el: HTMLElement): ResolvedLabel | null {
  if (el.id) {
    try {
      const byFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (byFor && textLooksLikeLabel(visibleText(byFor))) {
        const raw = visibleText(byFor);
        return finish(raw, 'STANDARD_LABEL');
      }
    } catch {
      /* ignore */
    }
  }
  const parentLabel = el.closest('label');
  if (parentLabel) {
    const raw = visibleText(parentLabel);
    if (textLooksLikeLabel(raw)) return finish(raw, 'STANDARD_LABEL');
  }
  return null;
}

function fromAria(el: HTMLElement): ResolvedLabel | null {
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .map((n) => visibleText(n!, 100));
    const raw = parts.join(' ').trim();
    if (textLooksLikeLabel(raw)) return finish(raw, 'ARIA');
  }
  const aria = (el.getAttribute('aria-label') ?? '').trim();
  if (textLooksLikeLabel(aria)) return finish(aria, 'ARIA');
  const title = (el.getAttribute('title') ?? '').trim();
  if (textLooksLikeLabel(title)) return finish(title, 'ARIA');
  return null;
}

function fromPlaceholder(el: HTMLElement): ResolvedLabel | null {
  const ph = (el.getAttribute('placeholder') ?? '').trim();
  if (textLooksLikeLabel(ph)) return finish(ph, 'PLACEHOLDER');
  return null;
}

function fromPreviousSibling(el: HTMLElement): ResolvedLabel | null {
  let prev: Element | null = el.previousElementSibling;
  while (prev) {
    if (!CONTROL_TAGS.has(prev.tagName) && isVisibleEl(prev)) {
      const raw = visibleText(prev, 120);
      if (textLooksLikeLabel(raw)) return finish(raw, 'PREVIOUS_SIBLING');
    }
    // Text node immediately before
    break;
  }
  // Previous text node in parent
  const parent = el.parentElement;
  if (parent) {
    const children = Array.from(parent.childNodes);
    const idx = children.indexOf(el);
    for (let i = idx - 1; i >= 0; i--) {
      const node = children[i];
      if (node?.nodeType === Node.TEXT_NODE) {
        const raw = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (textLooksLikeLabel(raw)) return finish(raw, 'PREVIOUS_SIBLING');
      }
      if (node instanceof Element) {
        if (CONTROL_TAGS.has(node.tagName)) break;
        const raw = visibleText(node, 120);
        if (textLooksLikeLabel(raw)) return finish(raw, 'PREVIOUS_SIBLING');
        break;
      }
    }
  }
  return null;
}

/**
 * Table cell resolver — first-class for directory forms:
 * <tr><td>*Title</td><td><input></td></tr>
 */
function fromTableCell(el: HTMLElement): ResolvedLabel | null {
  const td = el.closest('td, th');
  if (!td) return null;
  const tr = td.parentElement;
  if (!tr || tr.tagName !== 'TR') return null;

  const cells = Array.from(tr.children).filter(
    (c) => c.tagName === 'TD' || c.tagName === 'TH'
  ) as HTMLElement[];
  if (cells.length < 2) return null;

  const cellIndex = cells.indexOf(td as HTMLElement);
  if (cellIndex <= 0) {
    // Control in first cell — look at previous row's first cell? skip
    return null;
  }

  // Prefer immediate previous cell (classic 2-col label | input)
  for (let i = cellIndex - 1; i >= 0; i--) {
    const labelCell = cells[i]!;
    // Skip if this cell also contains a control (nested forms)
    if (labelCell.querySelector('input, textarea, select')) continue;
    const raw = visibleText(labelCell, 160);
    if (textLooksLikeLabel(raw)) return finish(raw, 'TABLE_CELL');
  }

  return null;
}

function dist2(a: DOMRect, b: DOMRect): number {
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  const bx = b.left + b.width / 2;
  const by = b.top + b.height / 2;
  return Math.hypot(ax - bx, ay - by);
}

function fromNearbyVisibleText(el: HTMLElement): ResolvedLabel | null {
  const rect = el.getBoundingClientRect();
  const parent = el.parentElement;
  if (!parent) return null;

  let best: { raw: string; d: number } | null = null;
  const candidates: Element[] = [];

  // Left / previous siblings chain
  let cursor: Element | null = el.previousElementSibling;
  let steps = 0;
  while (cursor && steps < 4) {
    candidates.push(cursor);
    cursor = cursor.previousElementSibling;
    steps++;
  }

  // Parent text children
  for (const child of Array.from(parent.children)) {
    if (child === el) continue;
    if (CONTROL_TAGS.has(child.tagName)) continue;
    candidates.push(child);
  }

  // Walk up one level for left cell-like divs
  const grand = parent.parentElement;
  if (grand) {
    for (const child of Array.from(grand.children).slice(0, 8)) {
      if (child.contains(el)) continue;
      if (CONTROL_TAGS.has(child.tagName)) continue;
      candidates.push(child);
    }
  }

  for (const cand of candidates) {
    if (!isVisibleEl(cand)) continue;
    if (cand.querySelector?.('input, textarea, select')) continue;
    const raw = visibleText(cand, 120);
    if (!textLooksLikeLabel(raw)) continue;
    const d = dist2(rect, cand.getBoundingClientRect());
    if (d > 150) continue;
    // Prefer left / above
    const cr = cand.getBoundingClientRect();
    const leftOrAbove = cr.right <= rect.left + 8 || cr.bottom <= rect.top + 8;
    const score = leftOrAbove ? d : d + 40;
    if (!best || score < best.d) best = { raw, d: score };
  }

  if (best) return finish(best.raw, 'NEARBY_TEXT');
  return null;
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
    node = node.parentElement;
  }
  return '';
}

function fromNameOrId(el: HTMLElement): ResolvedLabel | null {
  const name = (el.getAttribute('name') ?? '').trim();
  if (name && /[a-zA-Z]/.test(name)) return finish(name.replace(/[_-]+/g, ' '), 'NAME_ATTR');
  const id = (el.id ?? '').trim();
  if (id && /[a-zA-Z]/.test(id)) return finish(id.replace(/[_-]+/g, ' '), 'ID_ATTR');
  return null;
}

function finish(raw: string, resolver: LabelResolverKind): ResolvedLabel {
  return {
    rawLabel: raw.replace(/\s+/g, ' ').trim(),
    label: normalizeLabelText(raw),
    resolver,
    confidence: RESOLVER_CONFIDENCE[resolver],
    nearbyText: '',
    sectionHeading: '',
  };
}

function collectNearbyBits(el: HTMLElement): string {
  const bits: string[] = [];
  const prev = el.previousElementSibling;
  if (prev && !CONTROL_TAGS.has(prev.tagName)) bits.push(visibleText(prev, 80));
  const parent = el.parentElement;
  if (parent) {
    for (const child of Array.from(parent.children).slice(0, 6)) {
      if (child === el) break;
      if (['LABEL', 'SPAN', 'DIV', 'P', 'LEGEND', 'STRONG', 'B', 'TD', 'TH'].includes(child.tagName)) {
        bits.push(visibleText(child, 60));
      }
    }
  }
  return bits.filter(Boolean).join(' ').slice(0, 200);
}

/**
 * Resolve the human-visible label for a control using the priority stack.
 */
export function resolveFieldLabel(el: HTMLElement): ResolvedLabel {
  const heading = sectionHeading(el);
  const nearby = collectNearbyBits(el);

  const chain: Array<() => ResolvedLabel | null> = [
    () => fromStandardLabel(el),
    () => fromAria(el),
    () => fromPlaceholder(el),
    () => fromPreviousSibling(el),
    () => fromTableCell(el),
    () => fromNearbyVisibleText(el),
    () => (heading && textLooksLikeLabel(heading) ? finish(heading, 'SECTION_HEADING') : null),
    () => fromNameOrId(el),
  ];

  for (const step of chain) {
    const hit = step();
    if (hit && hit.label) {
      return {
        ...hit,
        nearbyText: nearby,
        sectionHeading: heading,
      };
    }
  }

  return {
    label: '',
    rawLabel: '',
    resolver: 'NONE',
    confidence: 0,
    nearbyText: nearby,
    sectionHeading: heading,
  };
}

export function logResolvedFields(
  fields: Array<{
    element: HTMLElement;
    kind: string;
    label: string;
    rawLabel?: string;
    labelResolver?: string;
    labelResolverConfidence?: number;
  }>,
  matches: Array<{
    matchedAlias: string | null;
    confidence: number;
    role: string;
  }>
): void {
  const lines: string[] = ['[Backlink Agent Companion] Label Resolution', '================'];
  fields.forEach((f, i) => {
    const m = matches[i];
    lines.push(`FIELD #${i + 1}`);
    lines.push(`Tag\n${f.element.tagName.toLowerCase()}`);
    lines.push(`Resolver\n${f.labelResolver ?? 'NONE'}`);
    lines.push(`Raw Label\n${f.rawLabel || '(none)'}`);
    lines.push(`Normalized\n${f.label || '(none)'}`);
    lines.push(`Matched\n${m?.matchedAlias || m?.role || '(none)'}`);
    lines.push(`Confidence\n${m?.confidence ?? f.labelResolverConfidence ?? 0}`);
    lines.push('----------------');
  });
  console.info(lines.join('\n'));
}
