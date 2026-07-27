/**
 * Phase 5.6/5.8 — Real LLM content pack generation with provider selection + failover.
 * Templates are ONLY used when GENERATION_MOCK=true.
 */
import {
  generateContentPack,
  isGenerationMockEnabled,
  scanPackForPlaceholders,
  scoreContentPackQuality,
  dedupeContentFields,
  fitDescriptionToCap,
  fitMetaDescription,
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
}): string {
  const site = params.opp.website_name || params.opp.domain || 'the target site';
  const brandUrl =
    params.brand.projectUrl ||
    (params.brand.projectDomain ? `https://${params.brand.projectDomain}` : '');
  const avoidBlock =
    params.avoidTexts && params.avoidTexts.length > 0
      ? `
UNIQUENESS (attempt ${params.uniquenessAttempt ?? 1}): These descriptions were already used for OTHER sites in this campaign — write a DIFFERENT angle/opening/emphasis. Do not paraphrase them closely:
${params.avoidTexts
  .slice(0, 5)
  .map((t, i) => `${i + 1}. ${t.slice(0, 280)}`)
  .join('\n')}
`
      : '';
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
${avoidBlock}
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

/**
 * Generate a content pack via selected/failover LLM providers.
 */
export async function generateLiveContentPack(params: {
  workspaceId: string;
  storageType: string;
  opp: OpportunityAiContext;
  brand: BrandContext & { projectUrl?: string | null };
  classificationId?: string | null;
  classificationLabel?: string | null;
  reason?: string | null;
  avoidTexts?: string[];
  uniquenessAttempt?: number;
}): Promise<Record<string, unknown>> {
  if (isGenerationMockEnabled()) {
    logger.warn(
      { workspaceId: params.workspaceId },
      'GENERATION_MOCK=true — using template path (NOT for production)'
    );
    const pack = generateContentPack(
      params.storageType,
      params.opp,
      params.brand,
      {
        classificationId: params.classificationId,
        classificationLabel: params.classificationLabel,
        reason: params.reason,
      }
    ) as unknown as Record<string, unknown>;
    pack.generatedBy = 'mock_template';
    return pack;
  }

  const prompt = buildPrompt({
    brand: params.brand,
    opp: params.opp,
    storageType: params.storageType,
    classificationLabel: params.classificationLabel,
    reason: params.reason,
    avoidTexts: params.avoidTexts,
    uniquenessAttempt: params.uniquenessAttempt,
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
      const deduped = dedupeContentFields({
        title: String(llm.seoTitle ?? ''),
        shortDescription: shortFromLlm,
        longDescription:
          longFromLlm || fitDescriptionToCap(body).value || shortFromLlm,
        metaDescription: String(llm.metaDescription ?? ''),
      });
      const pack: Record<string, unknown> = {
        seoTitle: deduped.title,
        metaDescription: deduped.metaDescription || fitMetaDescription(deduped.shortDescription),
        h1: String(llm.h1 ?? llm.seoTitle ?? ''),
        h2: Array.isArray(llm.h2) ? llm.h2.map(String) : [],
        slug,
        tags: [params.brand.industry ?? 'business', params.storageType].filter(Boolean),
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
        shortDescription: deduped.shortDescription,
        longDescription: deduped.longDescription,
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
  throw Object.assign(
    new Error(
      lastErr?.message
        ? `LLM content generation failed: ${lastErr.message}${chainSuffix}`
        : `LLM content generation failed${chainSuffix}`
    ),
    { code: 'LLM_GENERATION_FAILED', chainSummary: lastChain }
  );
}
