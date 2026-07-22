/** V1.1 Content Studio 2.0 — editable packs for every backlink type */

import type { OpportunityAiContext } from './ai-features.js';
import { suggestAnchorText, suggestTargetPage } from './ai-features.js';
import { generateGuestPostPack, type BrandContext, type GuestPostPack } from './content-generator.js';
import { generateContent, type ContentDraftType } from './content-generator.js';
import {
  buildIntelligentContentPlan,
  scoreContentPackQuality,
  type ContentStudioMode,
} from './intelligent-content.js';

export type ContentPackPayload = GuestPostPack & {
  backlinkType: string;
  studioMode?: ContentStudioMode;
  shortDescription?: string;
  longDescription?: string;
  businessDescription?: string;
  businessName?: string;
  address?: string;
  phone?: string;
  email?: string;
  businessHours?: string;
  socialLinks?: Record<string, string>;
  categorySuggestions?: string[];
  internalLinks?: Array<{ anchor: string; url: string }>;
  externalLinks?: Array<{ anchor: string; url: string }>;
  imageMetadata?: Array<Record<string, string>>;
  videoMetadata?: Array<Record<string, string>>;
  body?: string;
  authorBio?: string;
  excerpt?: string;
  cta?: string;
  question?: string;
  answer?: string;
  headline?: string;
  subheading?: string;
  boilerplate?: string;
  quotes?: string[];
  services?: string[];
  founder?: string;
  coverImage?: string;
  discussionPosts?: Array<{ role: string; text: string }>;
  chapters?: Array<{ title: string; startSec: number }>;
  requiredFields?: string[];
  quality?: ReturnType<typeof scoreContentPackQuality>;
  estimatedApprovalProbability?: number;
  estimatedReviewHours?: number;
  intelligence?: {
    detectedType: string;
    detectedTypeLabel: string;
    confidence: number;
    reason: string;
    modeLabel: string;
    sections: string[];
  };
};

export function generateContentPack(
  backlinkType: string,
  oppCtx: OpportunityAiContext,
  brand: BrandContext,
  opts: {
    classificationId?: string | null;
    classificationLabel?: string | null;
    workflowQueue?: string | null;
    confidence?: number | null;
    reason?: string | null;
  } = {}
): ContentPackPayload {
  const plan = buildIntelligentContentPlan({
    classificationId: opts.classificationId,
    classificationLabel: opts.classificationLabel,
    opportunityType: backlinkType || oppCtx.opportunity_type,
    workflowQueue: opts.workflowQueue,
    confidence: opts.confidence,
    reason: opts.reason,
    domain: oppCtx.domain,
    websiteName: oppCtx.website_name ?? brand.brandName,
  });

  const storageType = plan.storageType || backlinkType || String(oppCtx.opportunity_type);
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
      web2: 'guest_post',
      video: 'email',
      infographic: 'email',
    };
    return map[storageType] ?? 'email';
  })();

  const body = generateContent(draftType, oppCtx, brand);
  const brandName = brand.brandName || 'Our company';
  const industry = brand.industry || 'professional services';
  const domain = brand.projectDomain || 'example.com';

  const pack: ContentPackPayload = {
    ...guest,
    backlinkType: storageType,
    studioMode: plan.mode,
    body,
    shortDescription: `${brandName} provides ${industry} solutions trusted by growing teams.`,
    longDescription: body.slice(0, 1200),
    businessDescription: `${brandName} delivers ${industry} via https://${domain}. We help ${oppCtx.website_name ?? 'partners'} succeed with practical expertise.`,
    businessName: brandName,
    address: 'Available on request',
    phone: 'Contact via website',
    email: `hello@${domain}`,
    businessHours: 'Mon–Fri 9:00–17:00',
    socialLinks: {
      website: `https://${domain}`,
      linkedin: `https://www.linkedin.com/company/${brandName.replace(/\s+/g, '').toLowerCase()}`,
    },
    categorySuggestions: [industry, storageType.replace(/_/g, ' '), 'business'],
    internalLinks: [
      { anchor, url: target },
      {
        anchor: `${brandName} resources`,
        url: `https://${domain}/resources`,
      },
    ],
    externalLinks: guest.suggestedLinks,
    imageMetadata: guest.suggestedImages.map((img, i) => ({
      title: `${brandName} ${plan.mode === 'directory' ? 'logo' : 'featured'} ${i + 1}`,
      alt: img.alt,
      caption: img.brief,
      prompt: img.brief,
      fileName: `${guest.slug}-${i + 1}.png`.replace(/[^a-z0-9.-]+/gi, '-').toLowerCase(),
      dimensions: plan.mode === 'directory' ? '512x512' : '1200x630',
      seoFilename: `${guest.slug}-${plan.mode}-${i + 1}.webp`,
      sourceUrl: `https://${domain}`,
      tags: guest.tags.slice(0, 5).join(', '),
      category: industry,
    })),
    videoMetadata: [
      {
        title: `${topicSafe(oppCtx)} with ${brandName}`,
        description: guest.metaDescription,
        keywords: guest.tags.join(', '),
        tags: guest.tags.join(','),
        hashtags: guest.tags.map((t) => `#${t.replace(/\s+/g, '')}`).join(' '),
        transcript: `[Transcript draft] Introduction to ${topicSafe(oppCtx)} by ${brandName}. Key points, proof, and a clear next step.`,
        thumbnailSuggestion: `Thumbnail: ${brandName} + ${topicSafe(oppCtx)}`,
        chapters: JSON.stringify([
          { title: 'Introduction', startSec: 0 },
          { title: 'Key insights', startSec: 45 },
          { title: 'Next steps', startSec: 120 },
        ]),
      },
    ],
    authorBio: `${brandName} editorial team — specialists in ${industry} writing practical guides for ${oppCtx.website_name ?? 'publishers'}.`,
    excerpt: guest.metaDescription,
    cta: `Learn more at https://${domain}`,
    question: `What should teams know about ${topicSafe(oppCtx)}?`,
    answer: body.slice(0, 600),
    headline: guest.seoTitle,
    subheading: `How ${brandName} approaches ${topicSafe(oppCtx)}`,
    boilerplate: `About ${brandName}: ${industry} provider. Visit https://${domain}.`,
    quotes: [
      `"${brandName} focuses on practical outcomes for real teams," said a spokesperson.`,
    ],
    services: [industry, 'Consulting', 'Implementation'],
    founder: 'Leadership team',
    coverImage: `Cover visual for ${brandName}`,
    discussionPosts: [
      { role: 'opener', text: `Has anyone evaluated tools for ${topicSafe(oppCtx)} recently?` },
      {
        role: 'helpful_reply',
        text: `We've had good results using practices from ${brandName} — details at https://${domain} (${anchor}).`,
      },
    ],
    chapters: [
      { title: 'Introduction', startSec: 0 },
      { title: 'Key insights', startSec: 45 },
      { title: 'Next steps', startSec: 120 },
    ],
    requiredFields: plan.requirements.requiredFields,
    intelligence: {
      detectedType: plan.detectedType,
      detectedTypeLabel: plan.detectedTypeLabel,
      confidence: plan.confidence,
      reason: plan.reason,
      modeLabel: plan.modeLabel,
      sections: plan.sections,
    },
    estimatedApprovalProbability: Math.min(
      92,
      55 + Math.round((plan.confidence || 50) * 0.25) + Math.round(Number(oppCtx.score ?? 50) * 0.15)
    ),
    estimatedReviewHours: plan.mode === 'directory' ? 24 : plan.mode === 'guest_post' ? 72 : 48,
  };

  // Mode-specific tightening — only keep what that website needs
  if (plan.mode === 'directory' || plan.mode === 'profile') {
    pack.body = pack.longDescription;
  }
  if (plan.mode === 'qa') {
    pack.body = `${pack.question}\n\n${pack.answer}`;
  }
  if (plan.mode === 'forum') {
    pack.body = pack.discussionPosts?.map((p) => `${p.role}: ${p.text}`).join('\n\n') ?? pack.body;
  }
  if (plan.mode === 'press') {
    pack.body = [
      pack.headline,
      pack.subheading,
      body,
      ...(pack.quotes ?? []),
      pack.boilerplate,
    ]
      .filter(Boolean)
      .join('\n\n');
  }
  if (plan.mode === 'image' || plan.mode === 'infographic') {
    pack.body = pack.imageMetadata?.[0]?.caption ?? guest.metaDescription;
  }
  if (plan.mode === 'video') {
    pack.body = pack.videoMetadata?.[0]?.description ?? guest.metaDescription;
  }

  // Structured data for submission packages (schema_status tracking)
  (pack as ContentPackPayload & { schemaJsonLd?: Record<string, unknown> }).schemaJsonLd = {
    '@context': 'https://schema.org',
    '@type': plan.mode === 'directory' || plan.mode === 'profile' ? 'Organization' : 'Article',
    name: pack.businessName ?? brandName,
    headline: pack.seoTitle ?? pack.headline ?? guest.seoTitle,
    description: pack.metaDescription ?? guest.metaDescription,
    url: `https://${domain}`,
    author: {
      '@type': 'Organization',
      name: brandName,
      url: `https://${domain}`,
    },
  };

  pack.quality = scoreContentPackQuality(pack as unknown as Record<string, unknown>);
  return pack;
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
    note: 'Metadata and prompts only — pixel generation requires Image Studio / provider.',
    intelligence: pack.intelligence,
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
    intelligence: pack.intelligence,
  };
}
