/** URL import, validation, deduplication — Epic 2 */

export type ImportSourceType = 'csv' | 'excel' | 'txt' | 'manual' | 'url_list';

export interface ParsedImportRow {
  rowNumber: number;
  rawUrl: string;
  normalizedUrl?: string;
  normalizedDomain?: string;
  status: 'valid' | 'duplicate' | 'invalid';
  errorMessage?: string;
}

export interface ImportStats {
  total: number;
  valid: number;
  duplicates: number;
  invalid: number;
}

const DOMAIN_PATTERN = /^([\w-]+\.)+[\w-]+$/i;

export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/^["']|["']$/g, '');
  if (!trimmed) return null;
  let url = trimmed;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  try {
    const parsed = new URL(url);
    if (!parsed.hostname || parsed.hostname.includes(' ')) return null;
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '') || parsed.toString();
  } catch {
    return null;
  }
}

export function extractDomain(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.replace(/^www\./, '');
  } catch {
    const match = url.match(DOMAIN_PATTERN);
    return match ? match[0].toLowerCase().replace(/^www\./, '') : null;
  }
}

export function validateUrl(raw: string): { valid: boolean; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { valid: false, error: 'Empty URL' };
  if (trimmed.length > 2048) return { valid: false, error: 'URL too long' };
  const normalized = normalizeUrl(trimmed);
  if (!normalized) return { valid: false, error: 'Invalid URL format' };
  const domain = extractDomain(normalized);
  if (!domain) return { valid: false, error: 'Could not extract domain' };
  if (domain === 'localhost' || domain.endsWith('.local')) {
    return { valid: false, error: 'Local domains not supported' };
  }
  return { valid: true };
}

export function extractUrlsFromText(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const urls: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // CSV: prefer a column named url/website/domain when header present
    const firstCol = trimmed
      .split(/[,;\t]/)[0]
      ?.trim()
      .replace(/^["']|["']$/g, '');
    if (firstCol) urls.push(firstCol);
  }
  return urls;
}

const URL_HEADER = /^(url|website|domain|site|link|homepage)$/i;

/** Parse CSV/TSV rows, preferring a URL-like header column when present */
export function extractUrlsFromCsv(text: string): string[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const delim = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const headerCells = lines[0].split(delim).map((c) => c.trim().replace(/^["']|["']$/g, ''));
  const urlIdx = headerCells.findIndex((h) => URL_HEADER.test(h));
  if (urlIdx >= 0) {
    return lines.slice(1).map((line) => {
      const cells = line.split(delim).map((c) => c.trim().replace(/^["']|["']$/g, ''));
      return cells[urlIdx] ?? '';
    }).filter(Boolean);
  }
  return extractUrlsFromText(text);
}

/** Flatten worksheet cell values into candidate URL strings (ExcelJS / SheetJS compatible) */
export function extractUrlsFromSheetRows(rows: unknown[][]): string[] {
  if (!rows.length) return [];
  const header = rows[0].map((c) => String(c ?? '').trim());
  const urlIdx = header.findIndex((h) => URL_HEADER.test(h));
  const start = urlIdx >= 0 ? 1 : 0;
  const col = urlIdx >= 0 ? urlIdx : 0;
  const urls: string[] = [];
  for (let i = start; i < rows.length; i++) {
    const cell = rows[i]?.[col];
    if (cell == null || cell === '') continue;
    urls.push(String(cell).trim());
  }
  return urls;
}

export function deduplicateAndValidate(urls: string[]): {
  rows: ParsedImportRow[];
  stats: ImportStats;
} {
  const seen = new Set<string>();
  const rows: ParsedImportRow[] = [];
  let valid = 0;
  let duplicates = 0;
  let invalid = 0;

  urls.forEach((raw, i) => {
    const rowNumber = i + 1;
    const validation = validateUrl(raw);
    if (!validation.valid) {
      invalid++;
      rows.push({ rowNumber, rawUrl: raw, status: 'invalid', errorMessage: validation.error });
      return;
    }
    const normalizedUrl = normalizeUrl(raw)!;
    const normalizedDomain = extractDomain(normalizedUrl)!;
    if (seen.has(normalizedDomain)) {
      duplicates++;
      rows.push({
        rowNumber,
        rawUrl: raw,
        normalizedUrl,
        normalizedDomain,
        status: 'duplicate',
        errorMessage: 'Duplicate domain',
      });
      return;
    }
    seen.add(normalizedDomain);
    valid++;
    rows.push({ rowNumber, rawUrl: raw, normalizedUrl, normalizedDomain, status: 'valid' });
  });

  return {
    rows,
    stats: { total: urls.length, valid, duplicates, invalid },
  };
}

export function categorizeDomain(domain: string): string {
  const d = domain.toLowerCase();
  if (d.includes('forum') || d.includes('community') || d.includes('discuss')) return 'forum';
  if (d.includes('reddit') || d.includes('quora') || d.includes('stackoverflow')) return 'qa_site';
  if (d.endsWith('.edu')) return 'edu';
  if (d.endsWith('.gov')) return 'gov';
  if (d.includes('directory') || d.includes('listings') || d.includes('yellowpages'))
    return 'directory';
  if (d.includes('news') || d.includes('press') || d.includes('media')) return 'news';
  if (d.includes('blog') || d.includes('magazine') || d.includes('journal')) return 'guest_post';
  return 'resource_page';
}
