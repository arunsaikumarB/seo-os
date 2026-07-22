/**
 * Phase 5.6 — Detect silent template / mock content in generated packages.
 * Any hit means the asset must be Failed, never "generated".
 */

export const PLACEHOLDER_MARKERS = [
  'Our Brand',
  'Insight 1',
  'example.com',
  'A Practical Guide from',
  'Key Takeaways',
  'Data-backed perspective on industry trends',
  'Actionable recommendations',
  'tailored to the target audience',
  '{{',
  '}}',
  '[Company boilerplate]',
  '[relevant insight',
  'v1.1_provider_required',
] as const;

export function findPlaceholderMarkers(text: string): string[] {
  if (!text) return [];
  const hits: string[] = [];
  for (const marker of PLACEHOLDER_MARKERS) {
    if (text.includes(marker)) hits.push(marker);
  }
  return hits;
}

/** Flatten pack fields into searchable text. */
export function packTextBlob(pack: Record<string, unknown>): string {
  const parts: string[] = [];
  const walk = (v: unknown) => {
    if (v == null) return;
    if (typeof v === 'string') {
      parts.push(v);
      return;
    }
    if (typeof v === 'number' || typeof v === 'boolean') return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    if (typeof v === 'object') {
      for (const val of Object.values(v as Record<string, unknown>)) walk(val);
    }
  };
  walk(pack);
  return parts.join('\n');
}

export function scanPackForPlaceholders(pack: Record<string, unknown>): {
  ok: boolean;
  markers: string[];
} {
  const markers = findPlaceholderMarkers(packTextBlob(pack));
  return { ok: markers.length === 0, markers };
}

export function isGenerationMockEnabled(): boolean {
  return String(process.env.GENERATION_MOCK ?? '').toLowerCase() === 'true';
}
