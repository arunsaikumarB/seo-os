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
