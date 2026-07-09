/** Extensible campaign types — registry in DB, constants for app logic */
export const CAMPAIGN_TYPES = [
  'guest_post',
  'resource_page',
  'broken_link',
  'directory',
  'citation',
  'qa_site',
  'forum',
  'podcast',
  'partnership',
  'press_release',
  'digital_pr',
] as const;

export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

export const CAMPAIGN_STATUSES = [
  'draft',
  'pending_approval',
  'active',
  'paused',
  'completed',
  'cancelled',
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const APPROVAL_TYPES = [
  'opportunity',
  'email_draft',
  'content_draft',
  'campaign_launch',
  'outreach_send',
] as const;

export type ApprovalType = (typeof APPROVAL_TYPES)[number];

export const QUEUE_STATUSES = ['pending_review', 'approved', 'rejected', 'archived'] as const;

export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export interface CampaignGoal {
  id: string;
  label: string;
  target?: number;
  unit?: string;
}

export interface CampaignPlan {
  summary: string;
  phases: Array<{ name: string; durationWeeks: number; actions: string[] }>;
  targetOpportunities: number;
  recommendedTypes: CampaignType[];
  aiGenerated: boolean;
}

export function getCampaignTypeLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
