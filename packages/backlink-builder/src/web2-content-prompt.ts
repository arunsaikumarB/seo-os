/**
 * Pure Web 2.0 / article content prompt builders (no I/O).
 */
import type { BrandContext } from './content-generator.js';
import type { OpportunityAiContext } from './ai-features.js';

export type Web2PromptParams = {
  brand: BrandContext & { projectUrl?: string | null };
  opp: OpportunityAiContext;
  storageType: string;
  classificationId?: string | null;
  classificationLabel?: string | null;
  reason?: string | null;
  avoidTexts?: string[];
  uniquenessAttempt?: number;
  featureEmphasis?: string | null;
  openingAngle?: string | null;
};

/** Web 2.0 / article / blog long-form packs. */
export function isWeb2ArticleStorageType(
  storageType: string,
  classificationId?: string | null
): boolean {
  const s = String(storageType ?? '').toLowerCase();
  const c = String(classificationId ?? '').toLowerCase();
  if (s === 'web2' || s === 'article_submission' || s === 'blog_submission') return true;
  if (c === 'article_submission' || c === 'blog_submission' || c === 'web2') return true;
  return false;
}

function brandUrlOf(params: Web2PromptParams): string {
  return (
    params.brand.projectUrl ||
    (params.brand.projectDomain ? `https://${params.brand.projectDomain}` : '')
  );
}

function sharedBrandBlock(params: Web2PromptParams): string {
  const brandUrl = brandUrlOf(params);
  return `PROJECT / BRAND (use these exact names — never invent "Our Brand"):
- Brand name: ${params.brand.brandName}
- Company name: ${params.brand.companyName ?? params.brand.brandName}
- Domain: ${params.brand.projectDomain ?? 'unknown'}
- URL: ${brandUrl || 'unknown'}
- Industry: ${params.brand.industry ?? 'business'}
- Contact name: ${params.brand.contactName ?? '(not provided — do not invent)'}
- Contact email: ${params.brand.contactEmail ?? '(not provided — do not invent)'}

GROUNDED FACTS FROM THE REAL WEBSITE (must drive titles/descriptions — do not invent products/integrations not listed):
- Tagline: ${params.brand.tagline ?? '(none crawled)'}
- Topics: ${(params.brand.primaryTopics ?? []).join('; ') || '(none)'}
- Key features / facts: ${(params.brand.keyFeatures ?? []).join('; ') || '(none)'}
- Knowledge snippets: ${(params.brand.knowledgeSnippets ?? []).join('; ') || '(none)'}`;
}

export function buildWeb2ArticlePrompt(params: Web2PromptParams): string {
  const site = params.opp.website_name || params.opp.domain || 'the target platform';
  const brandUrl = brandUrlOf(params);
  const avoidBlock =
    params.avoidTexts && params.avoidTexts.length > 0
      ? `
UNIQUENESS (attempt ${params.uniquenessAttempt ?? 1}): Do not reuse these openings:
${params.avoidTexts
  .slice(0, 5)
  .map((t, i) => `${i + 1}. ${t.slice(0, 280)}`)
  .join('\n')}
`
      : '';

  return `You are writing a Web 2.0 / article submission pack for publishing on platforms like Medium, Blogger, WordPress.com, Hashnode, or free blog networks.

${sharedBrandBlock(params)}

TARGET PLATFORM:
- Name: ${site}
- Domain: ${params.opp.domain ?? 'unknown'}
- Opportunity title: ${params.opp.title}
- Type: ${params.classificationLabel ?? params.storageType}
- Analysis reason: ${params.reason ?? 'n/a'}
- Lead with this real website fact/feature: ${params.featureEmphasis || '(grounded brand topic)'}
- Opening approach: ${params.openingAngle || 'problem → insight → capability'}
${avoidBlock}
Write an ORIGINAL long-form article the human will paste/publish after logging into the platform.
Include one natural contextual backlink to ${brandUrl || params.brand.projectDomain || 'the brand URL'} (not a spammy CTA dump).

Return ONLY a JSON object with:
{
  "seoTitle": string (45-70 chars, compelling article title),
  "metaTitle": string (≤60 chars),
  "metaDescription": string (120-155 chars, HARD MAX 160),
  "h1": string (can match seoTitle),
  "h2": string[4-7] (section headings used in the body),
  "excerpt": string (1-2 sentences, ≤220 chars),
  "body": string (markdown article, 800-1500 words, use ## headings matching h2, include the brand link naturally once or twice),
  "tags": string[5-10] (lowercase topical tags, no brand spam),
  "imagePrompt": string (detailed featured-image scene for AI image gen — photoreal or clean illustration, NO text/logos/watermarks in the image),
  "altText": string (accessible alt for featured image),
  "suggestedLinks": [{"anchor": string, "url": string}],
  "internalLinks": [{"anchor": string, "url": string}],
  "authorBio": string (2-3 sentences about the brand/author),
  "faq": [{"question": string, "answer": string}]
}

Rules:
- Mention ${params.brand.brandName} naturally; base claims ONLY on grounded website facts.
- Never use placeholders: "Our Brand", "Insight 1", "example.com", "{{".
- Links must use https://${params.brand.projectDomain ?? 'the brand domain'}.
- tags must be real topical keywords (not just industry + type).
- Tone: helpful expert article for Web 2.0 / blog readers.`;
}

export function buildDirectoryStyleContentPrompt(params: Web2PromptParams): string {
  const site = params.opp.website_name || params.opp.domain || 'the target site';
  const brandUrl = brandUrlOf(params);
  const avoidBlock =
    params.avoidTexts && params.avoidTexts.length > 0
      ? `
UNIQUENESS (attempt ${params.uniquenessAttempt ?? 1}): These descriptions were already used for OTHER sites in this campaign — write a MATERIALLY DIFFERENT opening, feature emphasis, and phrasing. Do not paraphrase them:
${params.avoidTexts
  .slice(0, 5)
  .map((t, i) => `${i + 1}. ${t.slice(0, 280)}`)
  .join('\n')}
`
      : '';
  const angleBlock = `
PER-SITE ANGLE (mandatory — this package must not read like any other listing):
- Target site type: ${params.classificationLabel ?? params.storageType}
- Lead with this real website fact/feature: ${params.featureEmphasis || '(use a different grounded topic than other listings)'}
- Opening approach: ${params.openingAngle || 'different problem → capability framing'}
- Different opening sentence, different feature emphasis, different phrasing from every other site.
`;
  return `You are writing backlink submission content for a real marketing campaign.

${sharedBrandBlock(params)}

TARGET SITE:
- Name: ${site}
- Domain: ${params.opp.domain ?? 'unknown'}
- Opportunity title: ${params.opp.title}
- Backlink / storage type: ${params.storageType}
- Classification: ${params.classificationLabel ?? params.storageType}
- Analysis reason: ${params.reason ?? 'n/a'}
${angleBlock}${avoidBlock}
Write ORIGINAL content tailored to this site type (directory blurb, forum reply, guest post, profile, Q&A, etc.).
This package is for THIS site only — never reuse copy from another listing.

Return ONLY a JSON object with:
{
  "seoTitle": string (45-60 chars, must include brand or product naturally),
  "metaDescription": string (120-155 chars, HARD MAX 160),
  "h1": string,
  "h2": string[3-5],
  "body": string (markdown; guest_post 350-900 words; directory/forum/profile shorter),
  "shortDescription": string (ONE sentence, 180-195 chars, HARD MAX 200 — never longer),
  "longDescription": string (distinct from shortDescription, 180-195 chars, HARD MAX 200 — never longer),
  "businessDescription": string (≤200 chars, same rules),
  "businessName": string (exact brand name),
  "faq": [{"question": string, "answer": string}],
  "suggestedLinks": [{"anchor": string, "url": string}],
  "internalLinks": [{"anchor": string, "url": string}],
  "authorBio": string,
  "excerpt": string (≤200 chars)
}

Rules:
- Mention ${params.brand.brandName} and ${params.brand.projectDomain ?? brandUrl} naturally.
- Base claims ONLY on the grounded website facts above. If features are empty, write a cautious, general description — NEVER invent third-party integrations (QuickBooks, Shopify, etc.) that are not listed.
- shortDescription, longDescription, metaDescription, and excerpt must each be UNIQUE — title ≠ short ≠ long ≠ meta. Do not paste the same paragraph into multiple fields.
- Never use placeholders: "Our Brand", "Insight 1", "example.com", "{{", "Key Takeaways" scaffold lists.
- Links must use https://${params.brand.projectDomain ?? 'the brand domain'} — never example.com.
- Tone matches the site type (${params.storageType}).`;
}

export function buildContentGenerationPrompt(params: Web2PromptParams): string {
  if (isWeb2ArticleStorageType(params.storageType, params.classificationId)) {
    return buildWeb2ArticlePrompt(params);
  }
  return buildDirectoryStyleContentPrompt(params);
}
