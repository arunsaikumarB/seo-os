import type { FieldClassification, FieldRole } from '../types';
import { FILLABLE_ROLES } from '../types';
import type { FillableRole } from '../types';

const STYLE_ID = 'seo-os-companion-overlay-styles';
const TIP_ID = 'seo-os-companion-inspect-tip';

const COLORS: Record<string, string> = {
  business: 'rgba(34, 197, 94, 0.55)', // green
  category: 'rgba(234, 179, 8, 0.55)', // yellow
  description: 'rgba(59, 130, 246, 0.55)', // blue
  captcha: 'rgba(239, 68, 68, 0.55)', // red
  skipped: 'rgba(71, 85, 105, 0.45)', // gray
};

function overlayColor(role: FieldRole): string {
  if (role === 'category') return COLORS.category;
  if (role === 'description') return COLORS.description;
  if (role === 'captcha') return COLORS.captcha;
  if (FILLABLE_ROLES.includes(role as FillableRole)) return COLORS.business;
  return COLORS.skipped;
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
      max-width: 260px;
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

function roleTitle(role: FieldRole): string {
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

function onEnter(c: FieldClassification, ev: Event): void {
  const tip = tipEl();
  const e = ev as MouseEvent;
  tip.hidden = false;
  tip.textContent = [
    'Field',
    roleTitle(c.role),
    '',
    'Confidence',
    `${c.confidence}%`,
    '',
    'Matched Alias',
    c.matchedAlias || '—',
  ].join('\n');
  tip.style.left = `${Math.min(e.clientX + 12, window.innerWidth - 280)}px`;
  tip.style.top = `${Math.min(e.clientY + 12, window.innerHeight - 120)}px`;
}

function onLeave(): void {
  tipEl().hidden = true;
}

function onMove(ev: Event): void {
  const tip = tipEl();
  if (tip.hidden) return;
  const e = ev as MouseEvent;
  tip.style.left = `${Math.min(e.clientX + 12, window.innerWidth - 280)}px`;
  tip.style.top = `${Math.min(e.clientY + 12, window.innerHeight - 120)}px`;
}

export function setInspectorClassifications(next: FieldClassification[]): void {
  classifications = next;
  if (active) {
    clearInspectorOverlays();
    paintInspector();
  }
}

function paintInspector(): void {
  ensureStyles();
  for (const c of classifications) {
    const el = c.field.element;
    el.classList.add('soc-inspect-outline');
    el.style.setProperty('--soc-outline', overlayColor(c.role));
    const enter = (ev: Event) => onEnter(c, ev);
    const leave = () => onLeave();
    const move = (ev: Event) => onMove(ev);
    el.addEventListener('mouseenter', enter);
    el.addEventListener('mouseleave', leave);
    el.addEventListener('mousemove', move);
    listeners.set(el, enter);
    (el as HTMLElement & { __socLeave?: () => void; __socMove?: (e: Event) => void }).__socLeave =
      leave;
    (el as HTMLElement & { __socMove?: (e: Event) => void }).__socMove = move;
  }
}

export function clearInspectorOverlays(): void {
  document.querySelectorAll('.soc-inspect-outline').forEach((node) => {
    const el = node as HTMLElement & {
      __socLeave?: () => void;
      __socMove?: (e: Event) => void;
    };
    el.classList.remove('soc-inspect-outline');
    el.style.removeProperty('--soc-outline');
    const enter = listeners.get(el);
    if (enter) el.removeEventListener('mouseenter', enter);
    if (el.__socLeave) el.removeEventListener('mouseleave', el.__socLeave);
    if (el.__socMove) el.removeEventListener('mousemove', el.__socMove);
    listeners.delete(el);
  });
  tipEl().hidden = true;
}

export function enableInspector(next: FieldClassification[]): void {
  classifications = next;
  active = true;
  clearInspectorOverlays();
  paintInspector();
}

export function disableInspector(): void {
  active = false;
  clearInspectorOverlays();
}

export function isInspectorEnabled(): boolean {
  return active;
}
