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
  buildContentGenerationPrompt,
  isWeb2ArticleStorageType,
  type BrandContext,
  type OpportunityAiContext,
} from '@seo-os/backlink-builder';
import { completeLlmWithFailover } from '../providers/llm-failover.service.js';
import { logger } from '../../lib/logger.js';

export {
  buildContentGenerationPrompt as buildPrompt,
  buildWeb2ArticlePrompt,
  isWeb2ArticleStorageType,
} from '@seo-os/backlink-builder';

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

function normalizeTags(
  llmTags: unknown,
  brand: BrandContext,
  storageType: string,
  _articleMode: boolean
): string[] {
  if (Array.isArray(llmTags) && llmTags.length > 0) {
    const cleaned = llmTags
      .map((t) => String(t).trim().toLowerCase())
      .filter((t) => t.length >= 2 && t.length <= 40)
      .slice(0, 12);
    if (cleaned.length) return [...new Set(cleaned)];
  }
  return [brand.industry ?? 'business', storageType].filter(Boolean) as string[];
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
  featureEmphasis?: string | null;
  openingAngle?: string | null;
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

  const articleMode = isWeb2ArticleStorageType(params.storageType, params.classificationId);
  const prompt = buildContentGenerationPrompt({
    brand: params.brand,
    opp: params.opp,
    storageType: params.storageType,
    classificationId: params.classificationId,
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
      content: articleMode
        ? 'You write original long-form Web 2.0 / article SEO content. Respond with JSON only. Never use template placeholders.'
        : 'You write original SEO submission copy. Respond with JSON only. Never use template placeholders.',
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
        options: { temperature: 0.7, maxTokens: articleMode ? 8192 : 4096 },
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
        shortDescription: shortFromLlm || String(llm.excerpt ?? '').trim(),
        longDescription:
          longFromLlm || fitDescriptionToCap(body).value || shortFromLlm,
        metaDescription: String(llm.metaDescription ?? ''),
      });

      const imagePrompt = String(llm.imagePrompt ?? '').trim();
      const altText = String(llm.altText ?? deduped.title).trim();
      const tags = normalizeTags(llm.tags, params.brand, params.storageType, articleMode);

      const pack: Record<string, unknown> = {
        seoTitle: deduped.title,
        metaTitle: String(llm.metaTitle ?? deduped.title).slice(0, 70),
        metaDescription: deduped.metaDescription || fitMetaDescription(deduped.shortDescription),
        h1: String(llm.h1 ?? llm.seoTitle ?? ''),
        h2: Array.isArray(llm.h2) ? llm.h2.map(String) : [],
        slug,
        tags,
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
        suggestedImages: imagePrompt
          ? [{ brief: imagePrompt, role: 'featured', altText }]
          : [],
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
        imagePrompt: imagePrompt || null,
        altText,
        imageMetadata: imagePrompt
          ? [{ prompt: imagePrompt, role: 'featured', altText }]
          : [],
        videoMetadata: [],
        backlinkType: articleMode ? 'web2' : params.storageType,
        studioMode: articleMode ? 'article' : undefined,
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

      if (articleMode) {
        pack.web2PublishNote =
          'Web 2.0 publish requires platform login — this pack is for paste/publish after you sign in.';
      }

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
