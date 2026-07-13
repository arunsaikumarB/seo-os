/** V1.1 Content Studio 2.0 — editable packs for every backlink type */

import type { OpportunityAiContext } from './ai-features.js';
import { suggestAnchorText, suggestTargetPage } from './ai-features.js';
import { generateGuestPostPack, type BrandContext, type GuestPostPack } from './content-generator.js';
import { generateContent, type ContentDraftType } from './content-generator.js';

export type ContentPackPayload = GuestPostPack & {
  backlinkType: string;
  shortDescription?: string;
  longDescription?: string;
  businessDescription?: string;
  categorySuggestions?: string[];
  internalLinks?: Array<{ anchor: string; url: string }>;
  externalLinks?: Array<{ anchor: string; url: string }>;
  imageMetadata?: Array<Record<string, string>>;
  videoMetadata?: Array<Record<string, string>>;
  body?: string;
};

export function generateContentPack(
  backlinkType: string,
  oppCtx: OpportunityAiContext,
  brand: BrandContext
): ContentPackPayload {
  const guest = generateGuestPostPack(oppCtx, brand);
  const target = suggestTargetPage(brand.projectDomain ?? oppCtx.domain);
  const anchor = suggestAnchorText(oppCtx, brand.brandName);
  const draftType = ((): ContentDraftType => {
    const map: Record<string, ContentDraftType> = {
      guest_post: 'guest_post',
      directory: 'directory_description',
      profile: 'profile_description',
      forum: 'forum_response',
      qa_site: 'qa_answer',
      press_release: 'press_release',
      resource_page: 'resource_suggestion',
      broken_link: 'broken_link_replacement',
      citation: 'profile_description',
      digital_pr: 'press_release',
    };
    return map[backlinkType] ?? 'email';
  })();

  const body = generateContent(draftType, oppCtx, brand);

  return {
    ...guest,
    backlinkType,
    body,
    shortDescription: `${brand.brandName} — ${brand.industry ?? 'services'} for ${oppCtx.website_name ?? 'partners'}.`,
    longDescription: body.slice(0, 800),
    businessDescription: `${brand.brandName} delivers ${brand.industry ?? 'professional'} solutions via ${brand.projectDomain ?? 'our website'}.`,
    categorySuggestions: [brand.industry ?? 'general', backlinkType.replace(/_/g, ' '), 'business'],
    internalLinks: [{ anchor, url: target }],
    externalLinks: guest.suggestedLinks,
    imageMetadata: guest.suggestedImages.map((img, i) => ({
      title: `${brand.brandName} image ${i + 1}`,
      alt: img.alt,
      caption: img.brief,
      prompt: img.brief,
      fileName: `${guest.slug}-${i + 1}.png`,
      dimensions: '1200x630',
    })),
    videoMetadata: [
      {
        title: `${topicSafe(oppCtx)} with ${brand.brandName}`,
        description: guest.metaDescription,
        keywords: guest.tags.join(', '),
        tags: guest.tags.join(','),
        hashtags: guest.tags.map((t) => `#${t.replace(/\s+/g, '')}`).join(' '),
        transcript: `[Transcript draft] Introduction to ${topicSafe(oppCtx)} by ${brand.brandName}.`,
        thumbnailSuggestion: `Thumbnail: ${brand.brandName} + ${topicSafe(oppCtx)}`,
      },
    ],
  };
}

function topicSafe(oppCtx: OpportunityAiContext): string {
  return oppCtx.title || oppCtx.website_name || 'Topic';
}

export function generateImageBrief(
  oppCtx: OpportunityAiContext,
  brand: BrandContext
): Record<string, unknown> {
  const pack = generateContentPack(oppCtx.opportunity_type || 'guest_post', oppCtx, brand);
  return {
    suggestions: pack.imageMetadata,
    generationStatus: 'v1.1_provider_required',
    metricsSource: 'estimated',
    note: 'Metadata and prompts only — pixel generation requires a provider in a later release.',
  };
}

export function generateVideoBrief(
  oppCtx: OpportunityAiContext,
  brand: BrandContext
): Record<string, unknown> {
  const pack = generateContentPack(oppCtx.opportunity_type || 'guest_post', oppCtx, brand);
  return {
    suggestions: pack.videoMetadata,
    generationStatus: 'v1.1_provider_required',
    metricsSource: 'estimated',
    note: 'Titles, descriptions, tags, and transcript drafts only — video render requires a provider later.',
  };
}
