/**
 * Directory / citation form matching.
 * Controls are matched by name, id, autocomplete, aria-label, placeholder, and
 * associated label text — not only input[name].
 */

export type FormControlTag = 'input' | 'textarea' | 'select' | 'button';

export interface ParsedFormControl {
  tag: FormControlTag;
  type: string;
  name: string;
  id: string;
  placeholder: string;
  ariaLabel: string;
  autocomplete: string;
  label: string;
  text: string;
  required: boolean;
  options: string[];
}

export interface FormFillAction {
  selector: string;
  kind: 'fill' | 'select' | 'check';
  value: string;
  intent: string;
  via: string;
}

type FieldIntent =
  | 'email'
  | 'phone'
  | 'url'
  | 'title'
  | 'description'
  | 'business_name'
  | 'name'
  | 'address'
  | 'category'
  | 'keywords'
  | 'terms';

const INTENT_PATTERNS: Record<FieldIntent, RegExp> = {
  email: /e-?mail/i,
  phone: /phone|mobile|\btel\b|telephone/i,
  url: /website|web\s*address|homepage|\burl\b|site\s*url|http/i,
  title: /\btitle\b|listing name|site name|link title/i,
  description: /description|\babout\b|summary|\bdetails\b|comments?/i,
  business_name: /business\s*name|company|organi[sz]ation|listing name/i,
  name: /full name|contact name|your name|^name$|\bname\b/i,
  address: /address|street|city|postal|zip/i,
  category: /categor/i,
  keywords: /keyword|\btags?\b/i,
  terms: /terms|privacy|agree|i have read|\baccept\b|\btos\b|consent/i,
};

const INTENT_VALUE_KEYS: Record<FieldIntent, string[]> = {
  email: ['email'],
  phone: ['phone', 'telephone'],
  url: ['landingPage', 'url', 'website', 'websiteUrl'],
  title: ['title', 'anchorText'],
  description: ['description', 'longDescription', 'shortDescription'],
  business_name: ['businessName', 'company', 'organization'],
  name: ['contactName', 'name', 'fullName'],
  address: ['address'],
  category: ['categories', 'category'],
  keywords: ['keywords', 'tags'],
  terms: [],
};

const HAY_FIELDS = ['label', 'placeholder', 'ariaLabel', 'autocomplete', 'name', 'id'] as const;

function cssEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function readAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([:@\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? '';
  }
  return attrs;
}

function labelMap(html: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /<label\b([^>]*)>([\s\S]*?)<\/label>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = readAttrs(m[1] ?? '');
    const text = (m[2] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (attrs.for && text) map.set(attrs.for, text);
  }
  return map;
}

function enclosingLabel(html: string, index: number): string {
  const before = html.slice(0, index);
  const open = before.lastIndexOf('<label');
  if (open < 0) return '';
  const closeBefore = before.lastIndexOf('</label>');
  if (closeBefore > open) return '';
  const closeAfter = html.slice(index).indexOf('</label>');
  if (closeAfter < 0) return '';
  return html
    .slice(open, index + closeAfter)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function optionTexts(inner: string): string[] {
  const out: string[] = [];
  const re = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    const text = (m[2] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const value = readAttrs(m[1] ?? '').value ?? '';
    if (text) out.push(text);
    else if (value) out.push(value);
  }
  return out;
}

export function parseFormControls(html: string): ParsedFormControl[] {
  const labels = labelMap(html);
  const controls: ParsedFormControl[] = [];
  const re = /<(input|textarea|select|button)\b([^>]*)(?:\/>|>([\s\S]*?)<\/\1>)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1].toLowerCase() as FormControlTag;
    const attrs = readAttrs(m[2] ?? '');
    const inner = m[3] ?? '';
    if ((attrs.type ?? '').toLowerCase() === 'hidden') continue;
    const id = attrs.id ?? '';
    const text =
      tag === 'button' || tag === 'textarea'
        ? inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        : '';
    controls.push({
      tag,
      type: (
        attrs.type ??
        (tag === 'textarea' ? 'textarea' : tag === 'select' ? 'select' : tag === 'input' ? 'text' : '')
      ).toLowerCase(),
      name: attrs.name ?? '',
      id,
      placeholder: attrs.placeholder ?? '',
      ariaLabel: attrs['aria-label'] ?? '',
      autocomplete: attrs.autocomplete ?? '',
      label: (id && labels.get(id)) || enclosingLabel(html, m.index) || '',
      text,
      required: /\brequired\b/i.test(m[2] ?? ''),
      options: tag === 'select' ? optionTexts(inner) : [],
    });
  }
  return controls;
}

export function controlSelector(control: ParsedFormControl): string {
  if (control.id) return `[id="${cssEscape(control.id)}"]`;
  if (control.name) return `${control.tag}[name="${cssEscape(control.name)}"]`;
  if (control.ariaLabel) return `${control.tag}[aria-label="${cssEscape(control.ariaLabel)}"]`;
  if (control.placeholder) return `${control.tag}[placeholder="${cssEscape(control.placeholder)}"]`;
  if (control.tag === 'button' && control.text) return `button:has-text("${cssEscape(control.text)}")`;
  if (control.tag === 'input' && control.type === 'submit') return 'input[type="submit"]';
  return control.tag;
}

function scoreControl(control: ParsedFormControl, intent: FieldIntent): { score: number; via: string } {
  let best = 0;
  let via = '';
  const pattern = INTENT_PATTERNS[intent];
  const weights: Record<(typeof HAY_FIELDS)[number], number> = {
    label: 5,
    ariaLabel: 4,
    placeholder: 4,
    autocomplete: 4,
    name: 3,
    id: 3,
  };
  for (const field of HAY_FIELDS) {
    const value = control[field];
    if (!value || !pattern.test(value)) continue;
    const weight = weights[field];
    if (weight > best) {
      best = weight;
      via = field === 'ariaLabel' ? 'aria-label' : field;
    }
  }
  if (intent === 'email' && control.type === 'email') {
    best += 3;
    via = via || 'type';
  }
  if (intent === 'phone' && control.type === 'tel') {
    best += 3;
    via = via || 'type';
  }
  if (intent === 'url' && (control.type === 'url' || control.autocomplete === 'url')) {
    best += 3;
    via = via || 'autocomplete';
  }
  if (intent === 'terms' && control.type === 'checkbox') best += 2;
  if (intent === 'category' && control.tag === 'select') best += 2;
  return { score: best, via };
}

function scalar(values: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = values[key];
    if (Array.isArray(value)) {
      const joined = value.map((v) => String(v)).filter(Boolean).join(', ');
      if (joined) return joined;
    } else if (value != null && typeof value !== 'object' && String(value).trim()) {
      return String(value);
    }
  }
  return '';
}

function flattenValues(mapping: Record<string, unknown>): Record<string, unknown> {
  const canonical =
    mapping.__canonical && typeof mapping.__canonical === 'object'
      ? (mapping.__canonical as Record<string, unknown>)
      : {};
  const flat: Record<string, unknown> = { ...canonical };
  for (const [key, value] of Object.entries(mapping)) {
    if (key.startsWith('__') || value == null || typeof value === 'object') continue;
    flat[key] = value;
  }
  return flat;
}

function isTermsBox(control: ParsedFormControl): boolean {
  if (control.type !== 'checkbox') return false;
  return scoreControl(control, 'terms').score > 0;
}

function isHumanSubmit(control: ParsedFormControl): boolean {
  if (control.tag !== 'button' && !(control.tag === 'input' && (control.type === 'submit' || control.type === 'button' || control.type === 'image'))) {
    return false;
  }
  if (control.type === 'reset') return false;
  const text = `${control.text} ${control.ariaLabel} ${control.label}`.trim();
  if (/sign\s*in|log\s*in|\blogin\b|search|subscribe|cancel/i.test(text)) return false;
  if (control.type === 'submit' || control.type === 'image') return true;
  if (control.tag === 'button' && /submit|add|continue|send|post|save|finish|publish|list your|get listed/i.test(text)) {
    return true;
  }
  return false;
}

/** Submit control, including buttons that are not type=submit. */
export function findSubmitControl(html: string): ParsedFormControl | null {
  const controls = parseFormControls(html);
  return controls.find((c) => isHumanSubmit(c)) ?? null;
}

export function findSubmitSelector(html: string): string | null {
  const control = findSubmitControl(html);
  return control ? controlSelector(control) : null;
}

function pickOption(control: ParsedFormControl, wanted: string): string {
  const needle = wanted.toLowerCase();
  const parts = needle.split(/[,/|]/).map((p) => p.trim()).filter(Boolean);
  for (const option of control.options) {
    const o = option.toLowerCase();
    if (!o || /select|choose|pick/i.test(o)) continue;
    if (parts.some((p) => o.includes(p) || p.includes(o))) return option;
  }
  return '';
}

/**
 * Plan fills for a directory/citation form. Does not click submit.
 * Terms checkboxes are checked. Category selects are set only when an option matches.
 */
export function planFormFill(html: string, mapping: Record<string, unknown>): FormFillAction[] {
  const values = flattenValues(mapping);
  const controls = parseFormControls(html).filter(
    (c) => c.type !== 'submit' && c.type !== 'button' && c.type !== 'reset' && c.type !== 'password' && c.tag !== 'button'
  );
  const used = new Set<ParsedFormControl>();
  const actions: FormFillAction[] = [];

  for (const control of controls) {
    if (!control.name) continue;
    const direct = values[control.name];
    if (direct == null || typeof direct === 'object') continue;
    const value = String(direct);
    if (!value.trim()) continue;
    used.add(control);
    actions.push({
      selector: controlSelector(control),
      kind: control.tag === 'select' ? 'select' : control.type === 'checkbox' ? 'check' : 'fill',
      value,
      intent: control.name,
      via: 'name',
    });
  }

  const intents: FieldIntent[] = [
    'email',
    'phone',
    'url',
    'title',
    'description',
    'business_name',
    'name',
    'address',
    'category',
    'keywords',
  ];

  for (const intent of intents) {
    const ranked = controls
      .filter((c) => !used.has(c))
      .map((control) => ({ control, ...scoreControl(control, intent) }))
      .filter((row) => row.score >= 3)
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best) continue;
    if (intent === 'category' && best.control.tag === 'select') {
      const wanted = scalar(values, INTENT_VALUE_KEYS.category);
      const option = wanted ? pickOption(best.control, wanted) : '';
      if (!option) continue;
      used.add(best.control);
      actions.push({
        selector: controlSelector(best.control),
        kind: 'select',
        value: option,
        intent,
        via: best.via,
      });
      continue;
    }
    const value = scalar(values, INTENT_VALUE_KEYS[intent]);
    if (!value) continue;
    used.add(best.control);
    actions.push({
      selector: controlSelector(best.control),
      kind: best.control.tag === 'select' ? 'select' : 'fill',
      value,
      intent,
      via: best.via,
    });
  }

  for (const control of controls) {
    if (used.has(control) || !isTermsBox(control)) continue;
    used.add(control);
    actions.push({
      selector: controlSelector(control),
      kind: 'check',
      value: 'on',
      intent: 'terms',
      via: 'label',
    });
  }

  return actions;
}
