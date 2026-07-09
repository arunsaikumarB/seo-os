/** Relationship Intelligence Agent — Epic 4 */

export const RELATIONSHIP_INTELLIGENCE_AGENT = {
  id: 'relationship_intelligence_agent',
  displayName: 'Relationship Intelligence Agent',
  role: 'Discover, enrich, score, and maintain publisher relationships',
  responsibilities: [
    'Discover public contact information',
    'Build company and contact profiles',
    'Detect roles (Editor, Marketing Manager, Founder, etc.)',
    'Score relationship quality',
    'Recommend outreach targets',
    'Maintain relationship history',
    'Suggest next actions',
  ],
} as const;

export const TIMELINE_EVENT_TYPES = [
  'contact_discovered',
  'campaign_created',
  'content_generated',
  'submission_sent',
  'reply_received',
  'guest_post_accepted',
  'backlink_verified',
  'future_collaboration',
  'organization_enriched',
  'outreach_recommended',
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export const CONTACT_ROLES = [
  'Editor',
  'Marketing Manager',
  'SEO Manager',
  'Content Manager',
  'Founder',
  'Partnerships',
  'Contributing Author',
  'Webmaster',
  'Unknown',
] as const;

export type ContactRole = (typeof CONTACT_ROLES)[number];

export const WARMTH_LEVELS = ['cold', 'warm', 'hot', 'partner'] as const;
export type WarmthLevel = (typeof WARMTH_LEVELS)[number];
