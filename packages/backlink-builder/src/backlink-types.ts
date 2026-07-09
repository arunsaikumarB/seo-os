/** Backlink type categories — Epic 1 Backlink Builder v1.0 */
export const BACKLINK_CATEGORIES = [
  'content_based',
  'community_based',
  'business_based',
  'outreach_based',
  'authority_based',
] as const;

export type BacklinkCategory = (typeof BACKLINK_CATEGORIES)[number];

export const BACKLINK_TYPES = [
  // Content-Based (9)
  { id: 'guest_post', category: 'content_based', displayName: 'Guest Posts' },
  { id: 'press_release', category: 'content_based', displayName: 'Press Releases' },
  { id: 'pdf', category: 'content_based', displayName: 'PDFs' },
  { id: 'video', category: 'content_based', displayName: 'Videos' },
  { id: 'infographic', category: 'content_based', displayName: 'Infographics' },
  { id: 'web2', category: 'content_based', displayName: 'Web 2.0' },
  { id: 'case_study', category: 'content_based', displayName: 'Case Studies' },
  { id: 'whitepaper', category: 'content_based', displayName: 'Whitepapers' },
  { id: 'statistics_page', category: 'content_based', displayName: 'Statistics Pages' },
  // Community-Based (6)
  { id: 'qa_site', category: 'community_based', displayName: 'Q&A' },
  { id: 'forum', category: 'community_based', displayName: 'Forums' },
  { id: 'blog_comment', category: 'community_based', displayName: 'Blog Comments' },
  { id: 'reddit', category: 'community_based', displayName: 'Reddit' },
  { id: 'quora', category: 'community_based', displayName: 'Quora' },
  { id: 'social_bookmark', category: 'community_based', displayName: 'Social Bookmarking' },
  // Business-Based (6)
  { id: 'directory', category: 'business_based', displayName: 'Directories' },
  { id: 'citation', category: 'business_based', displayName: 'Citations' },
  { id: 'profile', category: 'business_based', displayName: 'Profiles' },
  { id: 'testimonial', category: 'business_based', displayName: 'Testimonials' },
  { id: 'partnership', category: 'business_based', displayName: 'Partnerships' },
  { id: 'supplier_link', category: 'business_based', displayName: 'Supplier Links' },
  // Outreach-Based (7)
  { id: 'broken_link', category: 'outreach_based', displayName: 'Broken Links' },
  { id: 'resource_page', category: 'outreach_based', displayName: 'Resource Pages' },
  { id: 'niche_edit', category: 'outreach_based', displayName: 'Niche Edits' },
  { id: 'brand_mention', category: 'outreach_based', displayName: 'Brand Mentions' },
  { id: 'unlinked_mention', category: 'outreach_based', displayName: 'Unlinked Mentions' },
  { id: 'digital_pr', category: 'outreach_based', displayName: 'Digital PR' },
  { id: 'haro', category: 'outreach_based', displayName: 'HARO' },
  // Authority-Based (6)
  { id: 'edu', category: 'authority_based', displayName: 'EDU' },
  { id: 'gov', category: 'authority_based', displayName: 'GOV' },
  { id: 'news', category: 'authority_based', displayName: 'News' },
  { id: 'podcast', category: 'authority_based', displayName: 'Podcasts' },
  { id: 'sponsorship', category: 'authority_based', displayName: 'Sponsorships' },
  { id: 'event', category: 'authority_based', displayName: 'Events' },
] as const;

export type BacklinkTypeId = (typeof BACKLINK_TYPES)[number]['id'];

export const VERIFICATION_STATUSES = ['pending', 'verified', 'lost', 'unreachable'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** Epic 1 full acquisition lifecycle */
export const PIPELINE_STAGES = [
  'discovered',
  'qualified',
  'approved',
  'campaign_ready',
  'outreach',
  'negotiation',
  'won',
  'lost',
  'verified',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** Legacy alias — maps old outreach_ready to campaign_ready */
export const LEGACY_STAGE_MAP: Record<string, PipelineStage> = {
  outreach_ready: 'campaign_ready',
};

export const PIPELINE_TRANSITIONS: Record<PipelineStage, PipelineStage[]> = {
  discovered: ['qualified', 'lost'],
  qualified: ['approved', 'lost', 'discovered'],
  approved: ['campaign_ready', 'lost'],
  campaign_ready: ['outreach', 'lost'],
  outreach: ['negotiation', 'won', 'lost'],
  negotiation: ['won', 'lost', 'outreach'],
  won: ['verified', 'lost'],
  lost: ['discovered'],
  verified: [],
};

export const AI_WORKFORCE_AGENTS = [
  { id: 'seo_strategist', displayName: 'SEO Strategist', role: 'Strategy & prioritization' },
  { id: 'research_manager', displayName: 'Research Manager', role: 'Discovery & qualification' },
  { id: 'opportunity_scorer', displayName: 'Opportunity Scorer', role: 'Scoring & probability' },
  { id: 'guest_post_writer', displayName: 'Guest Post Writer', role: 'Content generation' },
  { id: 'pr_agent', displayName: 'PR Agent', role: 'Press & digital PR' },
  { id: 'qa_agent', displayName: 'QA Agent', role: 'Output review' },
  { id: 'campaign_planner', displayName: 'Campaign Planner', role: 'Campaign association' },
  { id: 'verification_agent', displayName: 'Verification Agent', role: 'Link verification' },
] as const;

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

export function normalizePipelineStage(stage: string): PipelineStage {
  const mapped = LEGACY_STAGE_MAP[stage] ?? stage;
  if ((PIPELINE_STAGES as readonly string[]).includes(mapped)) return mapped as PipelineStage;
  return 'discovered';
}

export function canTransition(from: PipelineStage, to: PipelineStage): boolean {
  return PIPELINE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function faviconUrl(domain?: string | null): string | null {
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}
