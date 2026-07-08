/** Backlink type categories — Sprint 5.5 flagship module */
export const BACKLINK_CATEGORIES = [
  'content_based',
  'community_based',
  'business_based',
  'outreach_based',
  'authority_based',
] as const;

export type BacklinkCategory = (typeof BACKLINK_CATEGORIES)[number];

export const BACKLINK_TYPES = [
  // Content-Based
  { id: 'guest_post', category: 'content_based', displayName: 'Guest Posts' },
  { id: 'press_release', category: 'content_based', displayName: 'Press Releases' },
  { id: 'pdf', category: 'content_based', displayName: 'PDFs' },
  { id: 'infographic', category: 'content_based', displayName: 'Infographics' },
  { id: 'video', category: 'content_based', displayName: 'Videos' },
  { id: 'web2', category: 'content_based', displayName: 'Web 2.0' },
  // Community-Based
  { id: 'qa_site', category: 'community_based', displayName: 'Q&A' },
  { id: 'forum', category: 'community_based', displayName: 'Forums' },
  { id: 'blog_comment', category: 'community_based', displayName: 'Blog Comments' },
  { id: 'social_bookmark', category: 'community_based', displayName: 'Social Bookmarking' },
  // Business-Based
  { id: 'directory', category: 'business_based', displayName: 'Directories' },
  { id: 'citation', category: 'business_based', displayName: 'Citations' },
  { id: 'profile', category: 'business_based', displayName: 'Profiles' },
  { id: 'testimonial', category: 'business_based', displayName: 'Testimonials' },
  { id: 'partnership', category: 'business_based', displayName: 'Partnerships' },
  // Outreach-Based
  { id: 'broken_link', category: 'outreach_based', displayName: 'Broken Links' },
  { id: 'resource_page', category: 'outreach_based', displayName: 'Resource Pages' },
  { id: 'niche_edit', category: 'outreach_based', displayName: 'Niche Edits' },
  { id: 'brand_mention', category: 'outreach_based', displayName: 'Brand Mentions' },
  { id: 'digital_pr', category: 'outreach_based', displayName: 'HARO / Digital PR' },
  // Authority-Based
  { id: 'edu', category: 'authority_based', displayName: 'EDU' },
  { id: 'gov', category: 'authority_based', displayName: 'GOV' },
  { id: 'news', category: 'authority_based', displayName: 'News' },
  { id: 'podcast', category: 'authority_based', displayName: 'Podcasts' },
  { id: 'event', category: 'authority_based', displayName: 'Events' },
  { id: 'sponsorship', category: 'authority_based', displayName: 'Sponsorships' },
] as const;

export type BacklinkTypeId = (typeof BACKLINK_TYPES)[number]['id'];

export const VERIFICATION_STATUSES = ['pending', 'verified', 'lost', 'unreachable'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const PIPELINE_STAGES = [
  'discovered',
  'qualified',
  'approved',
  'outreach_ready',
  'won',
  'lost',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export function getCategoryLabel(cat: BacklinkCategory): string {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getTypesByCategory(category?: BacklinkCategory) {
  if (!category) return [...BACKLINK_TYPES];
  return BACKLINK_TYPES.filter((t) => t.category === category);
}

export function getTypeLabel(typeId: string): string {
  return BACKLINK_TYPES.find((t) => t.id === typeId)?.displayName ?? typeId.replace(/_/g, ' ');
}
