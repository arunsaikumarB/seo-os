/** AI content generation with brand context — Epic 2 */

import type { OpportunityAiContext } from './ai-features.js';
import {
  generateEmailDraft,
  generateGuestPostDraft,
  generatePressReleaseDraft,
  suggestAnchorText,
  suggestTargetPage,
} from './ai-features.js';
import { getTypeLabel } from './backlink-types.js';

export interface BrandContext {
  brandName: string;
  projectDomain?: string;
  industry?: string;
  brandVoice?: string;
  knowledgeSnippets?: string[];
  memoryNotes?: string[];
}

export type ContentDraftType =
  | 'email'
  | 'guest_post'
  | 'press_release'
  | 'directory_description'
  | 'profile_description'
  | 'forum_response'
  | 'qa_answer'
  | 'resource_suggestion'
  | 'broken_link_replacement';

function voicePrefix(ctx: BrandContext): string {
  const voice = ctx.brandVoice ?? 'professional and helpful';
  return `[Brand voice: ${voice}]`;
}

function knowledgeBlock(ctx: BrandContext): string {
  const snippets = [...(ctx.knowledgeSnippets ?? []), ...(ctx.memoryNotes ?? [])].slice(0, 3);
  if (!snippets.length) return '';
  return `\n\nContext from Knowledge Base:\n${snippets.map((s) => `• ${s}`).join('\n')}`;
}

export function generateDirectoryDescription(
  ctx: OpportunityAiContext,
  brand: BrandContext
): string {
  const site = ctx.website_name ?? ctx.domain ?? 'this directory';
  return `${voicePrefix(brand)}

${brand.brandName} — ${brand.industry ?? 'Industry leader'} offering trusted solutions.

Short description (150 chars):
${brand.brandName} provides expert ${brand.industry ?? 'services'} for ${site} readers.

Long description:
${brand.brandName} is a recognized name in ${brand.industry ?? 'the industry'}, serving customers through ${brand.projectDomain ?? 'our website'}. We welcome directory listings that help users discover quality resources.${knowledgeBlock(brand)}`;
}

export function generateProfileDescription(ctx: OpportunityAiContext, brand: BrandContext): string {
  return `${voicePrefix(brand)}

Company: ${brand.brandName}
Website: ${brand.projectDomain ?? 'N/A'}
Industry: ${brand.industry ?? 'General'}

About Us:
${brand.brandName} delivers value to audiences of ${ctx.website_name ?? ctx.domain ?? 'partner sites'}. Our team brings deep expertise and a commitment to quality.${knowledgeBlock(brand)}`;
}

export function generateForumResponse(ctx: OpportunityAiContext, brand: BrandContext): string {
  return `${voicePrefix(brand)}

[Forum response draft — requires human review before posting]

Great question! From our experience at ${brand.brandName}, we've found that [relevant insight related to ${ctx.title}].

For more details, you can explore ${brand.projectDomain ?? 'our site'} — we cover this topic in depth.

Note: This is a draft assist only. Respect forum rules, disclose affiliations, and never spam.`;
}

export function generateQaAnswer(ctx: OpportunityAiContext, brand: BrandContext): string {
  return `${voicePrefix(brand)}

[Q&A answer draft — requires human review and moderation approval]

${brand.brandName} perspective on ${ctx.title}:

1. [Key point backed by expertise]
2. [Supporting detail from knowledge base]
3. [Actionable recommendation]

Learn more: ${brand.projectDomain ?? 'our website'}

Disclaimer: Editorial platforms control publication. This draft assists preparation only.`;
}

export function generateResourceSuggestion(ctx: OpportunityAiContext, brand: BrandContext): string {
  const anchor = suggestAnchorText(ctx, brand.brandName);
  const target = suggestTargetPage(brand.projectDomain ?? ctx.domain);
  return `${voicePrefix(brand)}

Resource Page Pitch for ${ctx.website_name ?? ctx.domain}:

Suggested resource title: "${brand.brandName} — ${brand.industry ?? 'Expert'} Guide"
Target URL: ${target}
Suggested anchor: "${anchor}"

Why include us:
• Complements existing resources on ${getTypeLabel(ctx.opportunity_type).toLowerCase()}
• Original, non-promotional content
• Regularly updated${knowledgeBlock(brand)}`;
}

export function generateBrokenLinkReplacement(
  ctx: OpportunityAiContext,
  brand: BrandContext
): string {
  return `${voicePrefix(brand)}

Broken Link Replacement Outreach:

Hi,

I noticed a broken link on ${ctx.website_name ?? ctx.domain} that readers may find frustrating.

Suggested replacement: ${brand.projectDomain ?? brand.brandName}
Anchor text: "${suggestAnchorText(ctx, brand.brandName)}"

Our page covers the same topic with updated, accurate information.${knowledgeBlock(brand)}

Best regards,
${brand.brandName} Team`;
}

export function generateContent(
  type: ContentDraftType,
  oppCtx: OpportunityAiContext,
  brand: BrandContext
): string {
  switch (type) {
    case 'email':
      return generateEmailDraft(oppCtx, brand.brandName) + knowledgeBlock(brand);
    case 'guest_post':
      return generateGuestPostDraft(oppCtx, brand.brandName) + knowledgeBlock(brand);
    case 'press_release':
      return generatePressReleaseDraft(oppCtx, brand.brandName) + knowledgeBlock(brand);
    case 'directory_description':
      return generateDirectoryDescription(oppCtx, brand);
    case 'profile_description':
      return generateProfileDescription(oppCtx, brand);
    case 'forum_response':
      return generateForumResponse(oppCtx, brand);
    case 'qa_answer':
      return generateQaAnswer(oppCtx, brand);
    case 'resource_suggestion':
      return generateResourceSuggestion(oppCtx, brand);
    case 'broken_link_replacement':
      return generateBrokenLinkReplacement(oppCtx, brand);
    default:
      return generateEmailDraft(oppCtx, brand.brandName);
  }
}

export function contentTypesForOpportunity(opportunityType: string): ContentDraftType[] {
  const map: Record<string, ContentDraftType[]> = {
    guest_post: ['guest_post', 'email'],
    directory: ['directory_description', 'profile_description'],
    profile: ['profile_description'],
    citation: ['profile_description', 'directory_description'],
    forum: ['forum_response'],
    qa_site: ['qa_answer'],
    resource_page: ['resource_suggestion', 'email'],
    broken_link: ['broken_link_replacement', 'email'],
    press_release: ['press_release', 'email'],
    digital_pr: ['press_release', 'email'],
  };
  return map[opportunityType] ?? ['email', 'guest_post'];
}

export interface GuestPostPack {
  seoTitle: string;
  metaDescription: string;
  h1: string;
  h2: string[];
  slug: string;
  tags: string[];
  faq: Array<{ question: string; answer: string }>;
  schemaJsonLd: Record<string, unknown>;
  suggestedLinks: Array<{ anchor: string; url: string }>;
  suggestedImages: Array<{ brief: string; alt: string }>;
  bodyOutline: string;
  generationStatus: {
    images: 'v1.1_provider_required';
    video: 'v1.1_provider_required';
  };
}

/** Blog / guest-post pack — text + suggestions only in V1 */
export function generateGuestPostPack(
  oppCtx: OpportunityAiContext,
  brand: BrandContext
): GuestPostPack {
  const topic = oppCtx.title || oppCtx.website_name || 'Industry Insights';
  const slug = `${brand.brandName}-${topic}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const target = suggestTargetPage(brand.projectDomain ?? oppCtx.domain);
  const anchor = suggestAnchorText(oppCtx, brand.brandName);
  return {
    seoTitle: `${topic}: A Practical Guide from ${brand.brandName}`,
    metaDescription: `${brand.brandName} shares actionable insights on ${topic} for ${brand.industry ?? 'professionals'}.`,
    h1: `${topic}: What Matters in ${new Date().getFullYear()}`,
    h2: [
      `Why ${topic} matters`,
      `How ${brand.brandName} approaches it`,
      'Common mistakes to avoid',
      'Next steps for readers',
    ],
    slug,
    tags: [brand.industry ?? 'business', 'guide', topic.split(' ')[0]?.toLowerCase() ?? 'insights'].filter(Boolean),
    faq: [
      {
        question: `What is ${topic}?`,
        answer: `${topic} is a key theme for ${brand.industry ?? 'modern'} teams. ${brand.brandName} covers practical approaches.`,
      },
      {
        question: `How can ${brand.brandName} help?`,
        answer: `Visit ${target} for resources, tools, and expert guidance.`,
      },
    ],
    schemaJsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: `${topic}: A Practical Guide from ${brand.brandName}`,
      author: { '@type': 'Organization', name: brand.brandName },
      description: `${brand.brandName} insights on ${topic}`,
    },
    suggestedLinks: [{ anchor, url: target }],
    suggestedImages: [
      {
        brief: `Hero illustration of ${topic} for ${brand.brandName} guest post`,
        alt: `${topic} illustration`,
      },
      {
        brief: `Simple diagram showing ${brand.brandName} workflow related to ${topic}`,
        alt: `${brand.brandName} workflow diagram`,
      },
    ],
    bodyOutline: generateGuestPostDraft(oppCtx, brand.brandName) + knowledgeBlock(brand),
    generationStatus: {
      images: 'v1.1_provider_required',
      video: 'v1.1_provider_required',
    },
  };
}
