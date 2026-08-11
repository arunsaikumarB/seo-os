/**
 * Phase 5.6/5.8 — Real LLM content pack generation with provider selection + failover.
 * Templates when GENERATION_MOCK=true, or as a local/mvp fallback when no LLM works.
 */
import {
  generateContentPack,
  isGenerationMockEnabled,
  scanPackForPlaceholders,
  scoreContentPackQuality,
  dedupeContentFields,
  fitDescriptionToCap,
  fitMetaDescription,
  fitFurtherCompanyInfo,
  FURTHER_COMPANY_INFO_MAX,
  pickKeywordsForOpportunity,
  pickTitleDescriptionBlock,
  listBankKeywordSamples,
  type BrandContext,
  type OpportunityAiContext,
} from '@seo-os/backlink-builder';
import { completeLlmWithFailover } from '../providers/llm-failover.service.js';
import { logger } from '../../lib/logger.js';

const MAX_PARSE_ATTEMPTS = 2;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1].trim() : trimmed;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('LLM response did not contain a JSON object');
  }
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}

function buildPrompt(params: {
  brand: BrandContext & { projectUrl?: string | null };
  opp: OpportunityAiContext;
  storageType: string;
  classificationLabel?: string | null;
  reason?: string | null;
  /** Prior package texts to avoid repeating (cross-site uniqueness). */
  avoidTexts?: string[];
  uniquenessAttempt?: number;
  /** Concrete feature/fact this site's copy must lead with (rotated per opportunity). */
  featureEmphasis?: string | null;
  openingAngle?: string | null;
}): string {
  const site = params.opp.website_name || params.opp.domain || 'the target site';
  const brandUrl =
    params.brand.projectUrl ||
    (params.brand.projectDomain ? `https://${params.brand.projectDomain}` : '');
  const seed = `${params.opp.domain ?? ''}:${params.opp.title ?? ''}:${params.storageType}`;
  const bankBlock = pickTitleDescriptionBlock(seed);
  const bankKeywords = pickKeywordsForOpportunity(seed, { maxKeywords: 8, maxChars: 220 });
  const keywordSamples = listBankKeywordSamples(24).join('; ');
  const bankSeedBlock = `
SEO EXPERT BANK (must use — from approved KW1/KW2 + title-description sheet):
- Preferred title seed: ${bankBlock?.title || '(pick a unique ChefGaa restaurant POS title)'}
- Preferred H1 seed: ${bankBlock?.h1 || '(match title)'}
- Preferred short description seed: ${bankBlock?.description || '(write a unique ≤200 char blurb)'}
- Keywords for THIS listing (use exactly, comma-separated): ${bankKeywords || keywordSamples}
- Other approved keyword ideas (do not dump all — stay on-theme): ${keywordSamples}
`;
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

PROJECT / BRAND (use these exact names — never invent "Our Brand"):
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
- Knowledge snippets: ${(params.brand.knowledgeSnippets ?? []).join('; ') || '(none)'}

TARGET SITE:
- Name: ${site}
- Domain: ${params.opp.domain ?? 'unknown'}
- Opportunity title: ${params.opp.title}
- Backlink / storage type: ${params.storageType}
- Classification: ${params.classificationLabel ?? params.storageType}
- Analysis reason: ${params.reason ?? 'n/a'}
${bankSeedBlock}${angleBlock}${avoidBlock}
Write ORIGINAL content tailored to this site type (directory blurb, forum reply, guest post, profile, Q&A, etc.).
This package is for THIS site only — never reuse copy from another listing.

Return ONLY a JSON object with:
{
  "seoTitle": string (45-60 chars, must include brand or product naturally — prefer the bank title seed, lightly adapted),
  "metaDescription": string (120-155 chars, HARD MAX 160),
  "h1": string,
  "h2": string[3-5],
  "body": string (markdown ARTICLE for article/guest_post forms: 350-900 words; for directory/forum/profile write a shorter useful article 120-250 words),
  "shortDescription": string (ONE sentence, 180-195 chars, HARD MAX 200 — never longer; prefer bank description seed, rewritten uniquely),
  "longDescription": string (distinct from shortDescription, 180-195 chars, HARD MAX 200 — never longer),
  "furtherCompanyInfo": string (Further Company / Product / Service Information — ${Math.floor(FURTHER_COMPANY_INFO_MAX * 0.75)}-${FURTHER_COMPANY_INFO_MAX} characters, HARD MAX ${FURTHER_COMPANY_INFO_MAX}. Detailed product/service overview for directory forms. Must be longer and richer than longDescription.),
  "keywords": string (comma-separated; use the Keywords for THIS listing from the bank — do not invent unrelated terms),
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
- furtherCompanyInfo MUST be a distinct, longer block (up to ${FURTHER_COMPANY_INFO_MAX} chars) covering product/service details — not a copy of shortDescription.
- body is the Article content — useful, original, on-brand.
- keywords must come from the SEO expert bank list above.
- Never use placeholders: "Our Brand", "Insight 1", "example.com", "{{", "Key Takeaways" scaffold lists.
- Links must use https://${params.brand.projectDomain ?? 'the brand domain'} — never example.com.
- Tone matches the site type (${params.storageType}).`;
}

function scoreLivePack(pack: Record<string, unknown>, brandName: string): Record<string, unknown> {
  const base = scoreContentPackQuality(pack);
  const blob = JSON.stringify(pack);
  const brandHits = blob.split(brandName).length - 1;
  const words = String(pack.body ?? '')
    .split(/\s+/)
    .filter(Boolean).length;
  const variance = (words % 17) + brandHits * 3 + (String(pack.seoTitle ?? '').length % 7);
  let overall = Math.min(
    96,
    Math.max(55, base.overall + Math.min(12, brandHits * 2) + (variance % 9) - 4)
  );
  if (brandHits < 1) overall = Math.min(overall, 68);
  return {
    ...base,
    overall,
    brandMentions: brandHits,
    wordCount: words,
    scoredBy: 'live_heuristic_v56',
    recommendations: [
      ...base.recommendations,
      ...(brandHits < 1 ? ['Brand name missing from generated content'] : []),
    ],
  };
}

type LiveGenParams = {
  workspaceId: string;
  storageType: string;
  opp: OpportunityAiContext;
  brand: BrandContext & { projectUrl?: string | null };
  classificationId?: string | null;
  classificationLabel?: string | null;
  reason?: string | null;
  avoidTexts?: string[];
  uniquenessAttempt?: number;
  featureEmphasis?: string | null;
  openingAngle?: string | null;
};

function buildMockContentPack(params: LiveGenParams): Record<string, unknown> {
  const pack = generateContentPack(
    params.storageType,
    params.opp,
    params.brand,
    {
      classificationId: params.classificationId,
      classificationLabel: params.classificationLabel,
      reason: params.reason,
      allowMockFallback: true,
    }
  ) as unknown as Record<string, unknown>;
  const seed = `${params.opp.domain ?? ''}:${params.opp.title ?? ''}:${params.storageType}`;
  const bankBlock = pickTitleDescriptionBlock(seed);
  const bankKeywords = pickKeywordsForOpportunity(seed);
  if (bankBlock?.title) pack.seoTitle = bankBlock.title;
  if (bankBlock?.description) {
    pack.shortDescription = fitDescriptionToCap(bankBlock.description).value;
    pack.metaDescription = fitMetaDescription(bankBlock.description);
  }
  pack.keywords = bankKeywords;
  pack.furtherCompanyInfo = fitFurtherCompanyInfo(
    String(pack.body ?? pack.longDescription ?? bankBlock?.description ?? '')
  ).value;
  pack.articleBody = String(pack.body ?? '');
  pack.generatedBy = 'mock_template';
  pack.seoBankSeed = {
    title: bankBlock?.title ?? null,
    keywords: bankKeywords,
    section: bankBlock?.section ?? null,
  };
  return pack;
}

function allowMockFallback(): boolean {
  if (isGenerationMockEnabled()) return true;
  if (String(process.env.PROVIDER_MODE ?? '').toLowerCase() === 'mvp') return true;
  return String(process.env.NODE_ENV ?? '').toLowerCase() === 'development';
}

/**
 * Generate a content pack via selected/failover LLM providers.
 */
export async function generateLiveContentPack(
  params: LiveGenParams
): Promise<Record<string, unknown>> {
  if (isGenerationMockEnabled()) {
    logger.warn(
      { workspaceId: params.workspaceId },
      'GENERATION_MOCK=true — using template path (NOT for production)'
    );
    return buildMockContentPack(params);
  }

  const prompt = buildPrompt({
    brand: params.brand,
    opp: params.opp,
    storageType: params.storageType,
    classificationLabel: params.classificationLabel,
    reason: params.reason,
    avoidTexts: params.avoidTexts,
    uniquenessAttempt: params.uniquenessAttempt,
    featureEmphasis: params.featureEmphasis,
    openingAngle: params.openingAngle,
  });

  const messages = [
    {
      role: 'system',
      content:
        'You write original SEO submission copy. Respond with JSON only. Never use template placeholders.',
    },
    { role: 'user', content: prompt },
  ];

  let lastErr: Error | null = null;
  let lastChain = '';

  for (let attempt = 1; attempt <= MAX_PARSE_ATTEMPTS; attempt++) {
    try {
      const result = await completeLlmWithFailover({
        workspaceId: params.workspaceId,
        messages,
        options: { temperature: 0.7, maxTokens: 4096 },
      });
      lastChain = result.chainSummary;

      const llm = parseJsonObject(result.text);
      const domain = params.brand.projectDomain || 'unknown';
      const brandName = params.brand.brandName;
      const slug = `${brandName}-${params.opp.title || params.storageType}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);

      const body = String(llm.body ?? '');
      const longFromLlm = String(llm.longDescription ?? '').trim();
      const shortFromLlm = String(llm.shortDescription ?? '').trim();
      const seed = `${params.opp.domain ?? ''}:${params.opp.title ?? ''}:${params.storageType}`;
      const bankBlock = pickTitleDescriptionBlock(seed);
      const bankKeywords = pickKeywordsForOpportunity(seed);
      const furtherRaw = String(
        llm.furtherCompanyInfo ?? llm.businessDescription ?? body ?? ''
      ).trim();
      const keywordsRaw = String(llm.keywords ?? '').trim() || bankKeywords;
      const deduped = dedupeContentFields({
        title: String(llm.seoTitle ?? bankBlock?.title ?? ''),
        shortDescription: shortFromLlm || String(bankBlock?.description ?? ''),
        longDescription:
          longFromLlm || fitDescriptionToCap(body).value || shortFromLlm,
        metaDescription: String(llm.metaDescription ?? ''),
      });
      const furtherCompanyInfo = fitFurtherCompanyInfo(furtherRaw).value;
      const pack: Record<string, unknown> = {
        seoTitle: deduped.title || bankBlock?.title || brandName,
        metaDescription: deduped.metaDescription || fitMetaDescription(deduped.shortDescription),
        h1: String(llm.h1 ?? bankBlock?.h1 ?? llm.seoTitle ?? ''),
        h2: Array.isArray(llm.h2) ? llm.h2.map(String) : [],
        slug,
        tags: [params.brand.industry ?? 'business', params.storageType].filter(Boolean),
        keywords: keywordsRaw,
        faq: Array.isArray(llm.faq) ? llm.faq : [],
        schemaJsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: deduped.title,
          author: { '@type': 'Organization', name: brandName },
          description: deduped.metaDescription,
        },
        suggestedLinks: Array.isArray(llm.suggestedLinks)
          ? llm.suggestedLinks
          : [{ anchor: brandName, url: `https://${domain}` }],
        suggestedImages: [],
        bodyOutline: body,
        body,
        articleBody: body,
        shortDescription: deduped.shortDescription,
        longDescription: deduped.longDescription,
        furtherCompanyInfo,
        businessDescription: fitDescriptionToCap(
          String(llm.businessDescription ?? deduped.longDescription)
        ).value,
        businessName: String(llm.businessName ?? brandName),
        authorBio: String(llm.authorBio ?? ''),
        excerpt: fitDescriptionToCap(String(llm.excerpt ?? deduped.shortDescription)).value,
        internalLinks: Array.isArray(llm.internalLinks)
          ? llm.internalLinks
          : [{ anchor: brandName, url: `https://${domain}` }],
        externalLinks: Array.isArray(llm.suggestedLinks) ? llm.suggestedLinks : [],
        imageMetadata: [],
        videoMetadata: [],
        backlinkType: params.storageType,
        seoBankSeed: {
          title: bankBlock?.title ?? null,
          keywords: bankKeywords,
          section: bankBlock?.section ?? null,
        },
        generationStatus: {
          images: 'pending_provider',
          video: 'n/a',
        },
        generatedBy: 'llm',
        provider: result.provider,
        providerChain: result.chainSummary,
        failoverUsed: result.failoverUsed,
        contentFlags: deduped.flagged,
      };

      const scan = scanPackForPlaceholders(pack);
      if (!scan.ok) {
        throw new Error(
          `placeholder content detected: ${scan.markers.slice(0, 5).join(', ')}`
        );
      }

      pack.quality = scoreLivePack(pack, brandName);
      return pack;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      const chain =
        (err as { chainSummary?: string })?.chainSummary ||
        lastChain ||
        '';
      if (chain) lastChain = chain;
      logger.warn(
        {
          attempt,
          err: lastErr.message,
          chain: lastChain || undefined,
          opportunity: params.opp.domain,
        },
        'LLM content generation attempt failed'
      );
      // Provider failover already exhausted inside completeLlmWithFailover —
      // only re-try for parse/placeholder issues on a successful provider hop.
      const isProviderExhausted =
        lastErr.message.includes('LLM failover exhausted') ||
        (lastErr as { code?: string }).code === 'LLM_FAILOVER_EXHAUSTED';
      if (isProviderExhausted || attempt >= MAX_PARSE_ATTEMPTS) break;
      await sleep(800);
    }
  }

  const chainSuffix = lastChain ? ` [${lastChain}]` : '';
  if (allowMockFallback()) {
    logger.warn(
      {
        workspaceId: params.workspaceId,
        err: lastErr?.message,
        chain: lastChain || undefined,
      },
      'LLM unavailable — falling back to template content pack (local/mvp)'
    );
    return buildMockContentPack(params);
  }

  throw Object.assign(
    new Error(
      lastErr?.message
        ? `LLM content generation failed: ${lastErr.message}${chainSuffix}`
        : `LLM content generation failed${chainSuffix}`
    ),
    { code: 'LLM_GENERATION_FAILED', chainSummary: lastChain }
  );
}
