/**
 * SEO expert keyword / title-description bank (from seo-os-keywords-list.xlsx).
 * Used to seed unique titles, short descriptions, and keyword strings per opportunity.
 */
import { SEO_KEYWORD_BANK_DATA } from './data/seo-keyword-bank.js';

export type SeoTitleBlock = {
  section: string;
  h1: string;
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
};

export type SeoKeywordBank = {
  brand: string;
  source: string;
  kw1: readonly string[];
  kw2: readonly string[];
  titleKeywords: readonly string[];
  titleDescriptionBlocks: readonly SeoTitleBlock[];
};

export const SEO_KEYWORD_BANK = SEO_KEYWORD_BANK_DATA as unknown as SeoKeywordBank;

/** Directory / listing field hard cap used by many phpLD forms. */
export const FURTHER_COMPANY_INFO_MAX = 1500;

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Stable index into an array from opportunity id / domain. */
export function pickBankIndex(seed: string, length: number): number {
  if (length <= 0) return 0;
  return hashSeed(seed || 'default') % length;
}

export function pickTitleDescriptionBlock(seed: string): SeoTitleBlock | null {
  const blocks = SEO_KEYWORD_BANK.titleDescriptionBlocks ?? [];
  if (!blocks.length) return null;
  return blocks[pickBankIndex(seed, blocks.length)] ?? null;
}

/**
 * Build a comma-separated keyword string for form "Keywords" fields.
 * Mixes KW1 (long-tail) + KW2 (head terms) uniquely per seed.
 */
export function pickKeywordsForOpportunity(
  seed: string,
  opts?: { maxKeywords?: number; maxChars?: number }
): string {
  const maxKeywords = opts?.maxKeywords ?? 8;
  const maxChars = opts?.maxChars ?? 255;
  const kw1 = SEO_KEYWORD_BANK.kw1 ?? [];
  const kw2 = SEO_KEYWORD_BANK.kw2 ?? [];
  if (!kw1.length && !kw2.length) return '';

  const i1 = pickBankIndex(`${seed}:kw1`, Math.max(kw1.length, 1));
  const i2 = pickBankIndex(`${seed}:kw2`, Math.max(kw2.length, 1));
  const picked: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const k = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (!k) return;
    const key = k.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    picked.push(k);
  };

  // Prefer 2–3 KW2 head terms + rest long-tail KW1
  for (let n = 0; n < 3 && kw2.length; n++) {
    push(kw2[(i2 + n) % kw2.length]!);
  }
  for (let n = 0; n < maxKeywords && kw1.length && picked.length < maxKeywords; n++) {
    push(kw1[(i1 + n) % kw1.length]!);
  }

  let out = picked.join(', ');
  if (out.length > maxChars) {
    while (picked.length > 1 && picked.join(', ').length > maxChars) picked.pop();
    out = picked.join(', ');
    if (out.length > maxChars) out = out.slice(0, maxChars).replace(/,\s*[^,]*$/, '').trim();
  }
  return out;
}

/** All bank keywords (for LLM prompt context). */
export function listBankKeywordSamples(limit = 40): string[] {
  const merged = [...(SEO_KEYWORD_BANK.kw2 ?? []), ...(SEO_KEYWORD_BANK.kw1 ?? [])];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of merged) {
    const t = String(k ?? '').trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

export function fitFurtherCompanyInfo(
  raw: string,
  formMaxlength?: number | null
): { value: string; overLimit: boolean } {
  const ceiling = Math.min(
    FURTHER_COMPANY_INFO_MAX,
    formMaxlength != null && formMaxlength > 0 ? formMaxlength : FURTHER_COMPANY_INFO_MAX
  );
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { value: '', overLimit: false };
  if (text.length <= ceiling) return { value: text, overLimit: false };
  const slice = text.slice(0, ceiling);
  const sentenceEnd = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? ')
  );
  if (sentenceEnd >= Math.floor(ceiling * 0.55)) {
    return { value: slice.slice(0, sentenceEnd + 1).trim(), overLimit: true };
  }
  const wordEnd = slice.lastIndexOf(' ');
  if (wordEnd >= Math.floor(ceiling * 0.55)) {
    return { value: slice.slice(0, wordEnd).trim(), overLimit: true };
  }
  return { value: slice.trim(), overLimit: true };
}
