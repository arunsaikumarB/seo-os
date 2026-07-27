/**
 * Phase 11 — description length caps and uniqueness helpers.
 */

export const META_DESCRIPTION_MAX = 160;
export const DESCRIPTION_MAX = 200;
/** Target band so generated copy rarely hits the hard ceiling. */
export const DESCRIPTION_TARGET_MIN = 180;
export const DESCRIPTION_TARGET_MAX = 195;
export const CONTENT_SIMILARITY_THRESHOLD = 0.85;
export const CONTENT_SIMILARITY_MAX_ATTEMPTS = 3;

/** Cap at ≤200 (or smaller form maxlength). Prefer sentence/word boundary. */
export function fitDescriptionToCap(
  raw: string,
  formMaxlength?: number | null
): { value: string; overLimit: boolean; truncatedAtSentence: boolean } {
  const ceiling = Math.min(
    DESCRIPTION_MAX,
    formMaxlength != null && formMaxlength > 0 ? formMaxlength : DESCRIPTION_MAX
  );
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { value: '', overLimit: false, truncatedAtSentence: false };
  if (text.length <= ceiling) {
    return { value: text, overLimit: false, truncatedAtSentence: false };
  }

  const slice = text.slice(0, ceiling);
  const sentenceEnd = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
  if (sentenceEnd >= Math.floor(ceiling * 0.55)) {
    return {
      value: slice.slice(0, sentenceEnd + 1).trim(),
      overLimit: true,
      truncatedAtSentence: true,
    };
  }
  const wordEnd = slice.lastIndexOf(' ');
  if (wordEnd >= Math.floor(ceiling * 0.55)) {
    return {
      value: slice.slice(0, wordEnd).trim(),
      overLimit: true,
      truncatedAtSentence: false,
    };
  }
  return { value: slice.trim(), overLimit: true, truncatedAtSentence: false };
}

export function fitMetaDescription(raw: string): string {
  return fitDescriptionToCap(raw, META_DESCRIPTION_MAX).value;
}

/** True when two strings are near-duplicates (same text or one is a long prefix of the other). */
export function textsAreRepetitive(a: string, b: string, minLen = 40): boolean {
  const x = String(a ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const y = String(b ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length >= minLen && y.length >= minLen) {
    if (x.startsWith(y) || y.startsWith(x)) return true;
  }
  return false;
}

/** Ensure short ≠ title ≠ long — prefer distinct copy; empty if cannot differentiate. */
export function dedupeContentFields(input: {
  title: string;
  shortDescription: string;
  longDescription: string;
  metaDescription?: string;
}): {
  title: string;
  shortDescription: string;
  longDescription: string;
  metaDescription: string;
  flagged: string[];
} {
  const flagged: string[] = [];
  let title = String(input.title ?? '').trim();
  let shortDescription = fitDescriptionToCap(input.shortDescription).value;
  let longDescription = fitDescriptionToCap(input.longDescription).value;
  let metaDescription = fitMetaDescription(input.metaDescription ?? shortDescription);

  if (textsAreRepetitive(shortDescription, longDescription)) {
    // Prefer keeping long; shorten short to first sentence under 160 if possible
    const first = shortDescription.split(/(?<=[.!?])\s+/)[0] ?? shortDescription;
    if (first.length >= 40 && first.length <= META_DESCRIPTION_MAX && first !== longDescription) {
      shortDescription = first;
      metaDescription = fitMetaDescription(first);
    } else {
      shortDescription = '';
      flagged.push('short_desc_duplicated_long');
    }
  }
  if (textsAreRepetitive(title, shortDescription) || textsAreRepetitive(title, longDescription)) {
    flagged.push('title_overlaps_description');
  }
  if (textsAreRepetitive(metaDescription, longDescription)) {
    metaDescription = fitMetaDescription(shortDescription || title);
  }

  return { title, shortDescription, longDescription, metaDescription, flagged };
}
