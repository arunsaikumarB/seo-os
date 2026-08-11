import type { FieldClassification, MatchSource } from '../types';
import { FILLABLE_ROLES } from '../types';
import type { FillableRole } from '../types';
import { CONFIDENCE_FILL_THRESHOLD } from '../types';

const STYLE_ID = 'BacklinkAgent-companion-overlay-styles';
const TIP_ID = 'BacklinkAgent-companion-inspect-tip';

/** Phase 2.3 confidence colors */
const COLORS: Record<MatchSource | 'default', string> = {
  domain: 'rgba(34, 197, 94, 0.65)', // green — verified domain
  alias: 'rgba(59, 130, 246, 0.6)', // blue — global alias
  confidence: 'rgba(234, 179, 8, 0.6)', // yellow — confidence match
  skipped: 'rgba(100, 116, 139, 0.5)', // gray
  structural: 'rgba(100, 116, 139, 0.5)',
  unknown: 'rgba(239, 68, 68, 0.55)', // red
  default: 'rgba(100, 116, 139, 0.45)',
};

function sourceFor(c: FieldClassification): MatchSource {
  if (c.matchSource) return c.matchSource;
  if (['captcha', 'payment', 'submit', 'login', 'search', 'newsletter'].includes(c.role)) {
    return 'structural';
  }
  if (c.role === 'unknown') return 'unknown';
  if (FILLABLE_ROLES.includes(c.role as FillableRole)) {
    return c.confidence >= CONFIDENCE_FILL_THRESHOLD ? 'alias' : 'confidence';
  }
  return 'skipped';
}

function overlayColor(c: FieldClassification): string {
  return COLORS[sourceFor(c)] ?? COLORS.default;
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .soc-inspect-outline {
      outline: 2px solid var(--soc-outline, #22c55e) !important;
      outline-offset: 2px !important;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--soc-outline) 35%, transparent) !important;
    }
    #${TIP_ID} {
      position: fixed;
      z-index: 2147483645;
      max-width: 280px;
      padding: 8px 10px;
      border-radius: 10px;
      background: #0f172a;
      color: #f8fafc;
      font: 12px/1.35 "Segoe UI", system-ui, sans-serif;
      pointer-events: none;
      box-shadow: 0 10px 30px rgba(0,0,0,.35);
      white-space: pre-line;
    }
  `;
  document.documentElement.appendChild(style);
}

let active = false;
let classifications: FieldClassification[] = [];
const listeners = new WeakMap<HTMLElement, (e: Event) => void>();

function tipEl(): HTMLElement {
  let tip = document.getElementById(TIP_ID) as HTMLElement | null;
  if (!tip) {
    tip = document.createElement('div');
    tip.id = TIP_ID;
    tip.hidden = true;
    document.documentElement.appendChild(tip);
  }
  return tip;
}

function roleTitle(role: string): string {
  const map: Record<string, string> = {
    business_name: 'Business Name',
    title: 'Title',
    website: 'Website',
    email: 'Email',
    phone: 'Phone',
    description: 'Description',
    address: 'Address',
    city: 'City',
    state: 'State',
    country: 'Country',
    zip: 'ZIP',
    category: 'Category',
    facebook: 'Facebook',
    linkedin: 'LinkedIn',
    twitter: 'Twitter',
    captcha: 'CAPTCHA',
    payment: 'Payment',
    submit: 'Submit',
    login: 'Login',
    search: 'Search',
    unknown: 'Unknown',
  };
  return map[role] ?? role;
}

function sourceLabel(s: MatchSource): string {
  switch (s) {
    case 'domain':
      return 'Verified Domain Mapping';
    case 'alias':
      return 'Global Alias';
    case 'confidence':
      return 'Confidence Match';
    case 'skipped':
    case 'structural':
      return 'Skipped';
    default:
      return 'Unknown';
  }
}

function onEnter(c: FieldClassification, ev: Event): void {
  const tip = tipEl();
  const e = ev as MouseEvent;
  tip.hidden = false;
  const src = sourceFor(c);
  tip.textContent = [
    'Field',
    c.field.element.tagName,
    '',
    'Resolved Label',
    c.field.rawLabel || c.field.label || '(none)',
    '',
    'Resolver',
    c.field.labelResolver || 'NONE',
    '',
    `Confidence ${c.confidence}%`,
    '',
    'Mapped To',
    roleTitle(c.role),
    c.matchedAlias ? `Alias: ${c.matchedAlias}` : '',
    sourceLabel(src),
  ]
    .filter(Boolean)
    .join('\n');
  tip.style.left = `${Math.min(e.clientX + 12, window.innerWidth - 290)}px`;
  tip.style.top = `${Math.min(e.clientY + 12, window.innerHeight - 120)}px`;
}

function onLeave(): void {
  tipEl().hidden = true;
}

export function setInspectorClassifications(next: FieldClassification[]): void {
  classifications = next;
  if (!active) return;
  applyOutlines();
}

function clearOutlines(): void {
  for (const c of classifications) {
    const el = c.field.element;
    el.classList.remove('soc-inspect-outline');
    el.style.removeProperty('--soc-outline');
    const fn = listeners.get(el);
    if (fn) {
      el.removeEventListener('mouseenter', fn);
      el.removeEventListener('mouseleave', onLeave);
      listeners.delete(el);
    }
  }
  tipEl().hidden = true;
}

function applyOutlines(): void {
  ensureStyles();
  for (const c of classifications) {
    const el = c.field.element;
    const color = overlayColor(c);
    el.classList.add('soc-inspect-outline');
    el.style.setProperty('--soc-outline', color.replace(/[\d.]+\)$/, '1)'));
    const enter = (ev: Event) => onEnter(c, ev);
    listeners.set(el, enter);
    el.addEventListener('mouseenter', enter);
    el.addEventListener('mouseleave', onLeave);
  }
}

export function enableInspector(next?: FieldClassification[]): void {
  if (next) classifications = next;
  active = true;
  clearOutlines();
  applyOutlines();
}

export function disableInspector(): void {
  clearOutlines();
  active = false;
  tipEl().hidden = true;
}

export function isInspectorEnabled(): boolean {
  return active;
}
