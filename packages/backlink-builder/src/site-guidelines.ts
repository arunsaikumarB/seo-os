/**
 * Guidelines extraction — Phase 5 §8.
 * Heuristic/structured extract from Guest Post Guidelines pages.
 * Does NOT change content generation — only stores + flags mismatch.
 */

export type SiteGuidelines = {
  sourceUrl: string;
  writingRules: string[];
  wordCount: { min: number | null; max: number | null };
  allowedTopics: string[];
  submissionMethod: string | null;
  requiredAssets: string[];
  notes: string[];
  emailAddress: string | null;
  excerpt: string;
};

export function extractGuidelines(params: {
  html: string;
  url: string;
  emailAddress?: string | null;
}): SiteGuidelines {
  const text = params.html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const excerpt = text.slice(0, 2_000);

  const wordMin = text.match(/(?:minimum|at least|min(?:imum)?)\s*(?:of\s*)?(\d{2,5})\s*words/i);
  const wordMax = text.match(/(?:maximum|up to|max(?:imum)?|no more than)\s*(?:of\s*)?(\d{2,5})\s*words/i);
  const range = text.match(/(\d{2,5})\s*[–-]\s*(\d{2,5})\s*words/i);

  let min: number | null = wordMin ? Number(wordMin[1]) : null;
  let max: number | null = wordMax ? Number(wordMax[1]) : null;
  if (range) {
    min = Number(range[1]);
    max = Number(range[2]);
  }

  const writingRules: string[] = [];
  for (const m of text.matchAll(
    /(?:do not|don't|must|should|required|avoid)[^.?!]{10,120}[.?!]/gi
  )) {
    writingRules.push(m[0]!.trim());
    if (writingRules.length >= 8) break;
  }

  const topics: string[] = [];
  const topicBlock = text.match(/topics?[^.?!]{0,40}:\s*([^.?!]{10,200})/i);
  if (topicBlock) {
    topics.push(
      ...topicBlock[1]!.split(/,|•|·|;/).map((t) => t.trim()).filter(Boolean).slice(0, 12)
    );
  }

  let submissionMethod: string | null = null;
  if (/email\s+us|send\s+(us\s+)?(an?\s+)?email|mailto:/i.test(params.html)) {
    submissionMethod = 'email';
  } else if (/submit\s+(via|through|using)\s+(the\s+)?form/i.test(text)) {
    submissionMethod = 'form';
  } else if (/google\s+form|typeform/i.test(text)) {
    submissionMethod = 'platform_form';
  }

  const requiredAssets: string[] = [];
  if (/author\s+bio/i.test(text)) requiredAssets.push('author_bio');
  if (/headshot|author\s+photo|profile\s+image/i.test(text)) requiredAssets.push('author_image');
  if (/featured\s+image|hero\s+image/i.test(text)) requiredAssets.push('featured_image');

  const email =
    params.emailAddress ??
    (params.html.match(/mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i)?.[1] ??
      text.match(/\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/i)?.[1] ??
      null);

  return {
    sourceUrl: params.url,
    writingRules,
    wordCount: { min, max },
    allowedTopics: topics,
    submissionMethod,
    requiredAssets,
    notes: [],
    emailAddress: email,
    excerpt,
  };
}

export type PackageSnapshot = {
  wordCount?: number | null;
  topics?: string[];
  assets?: string[];
};

/** Flag mismatch only — never rewrite generation (Phase 5 scope). */
export function detectGuidelinesMismatch(
  guidelines: SiteGuidelines,
  pack: PackageSnapshot
): { mismatch: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (
    guidelines.wordCount.min != null &&
    pack.wordCount != null &&
    pack.wordCount < guidelines.wordCount.min
  ) {
    reasons.push(`word count ${pack.wordCount} < min ${guidelines.wordCount.min}`);
  }
  if (
    guidelines.wordCount.max != null &&
    pack.wordCount != null &&
    pack.wordCount > guidelines.wordCount.max
  ) {
    reasons.push(`word count ${pack.wordCount} > max ${guidelines.wordCount.max}`);
  }
  for (const asset of guidelines.requiredAssets) {
    if (pack.assets && !pack.assets.includes(asset)) {
      reasons.push(`missing required asset: ${asset}`);
    }
  }
  return { mismatch: reasons.length > 0, reasons };
}
