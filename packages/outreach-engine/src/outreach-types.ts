/** Outreach & Execution Engine types — Epic 5 */

export const EMAIL_PROVIDER_TYPES = ['mock', 'smtp', 'gmail', 'outlook'] as const;
export type EmailProviderType = (typeof EMAIL_PROVIDER_TYPES)[number];

export const MESSAGE_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'scheduled',
  'sent',
  'failed',
  'cancelled',
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const SEQUENCE_STEP_TYPES = [
  'initial_email',
  'wait',
  'follow_up',
  'reminder',
  'final_follow_up',
  'close',
] as const;
export type SequenceStepType = (typeof SEQUENCE_STEP_TYPES)[number];

export const DELIVERABILITY_EVENTS = [
  'sent',
  'delivered',
  'opened',
  'clicked',
  'replied',
  'bounced',
  'spam',
] as const;
export type DeliverabilityEventType = (typeof DELIVERABILITY_EVENTS)[number];

export const EMAIL_TONES = ['professional', 'friendly', 'formal', 'casual', 'persuasive'] as const;
export type EmailTone = (typeof EMAIL_TONES)[number];

export const AI_EMAIL_TYPES = [
  'initial',
  'reply',
  'follow_up',
  'negotiation',
  'meeting_request',
  'guest_post',
  'thank_you',
  'subject_line',
] as const;
export type AiEmailType = (typeof AI_EMAIL_TYPES)[number];

export const PERSONALIZATION_TOKENS = [
  '{{contact_name}}',
  '{{contact_role}}',
  '{{company_name}}',
  '{{domain}}',
  '{{sender_name}}',
  '{{campaign_name}}',
  '{{opportunity_title}}',
] as const;

export interface PersonalizationContext {
  contactName?: string;
  contactRole?: string;
  companyName?: string;
  domain?: string;
  senderName?: string;
  campaignName?: string;
  opportunityTitle?: string;
}

export interface SequenceStepInput {
  stepType: SequenceStepType;
  delayDays?: number;
  subject?: string;
  bodyHtml?: string;
  templateId?: string;
}

export const DEFAULT_SEQUENCE_STEPS: SequenceStepInput[] = [
  { stepType: 'initial_email', delayDays: 0 },
  { stepType: 'wait', delayDays: 5 },
  { stepType: 'follow_up', delayDays: 0 },
  { stepType: 'wait', delayDays: 5 },
  { stepType: 'reminder', delayDays: 0 },
  { stepType: 'wait', delayDays: 7 },
  { stepType: 'final_follow_up', delayDays: 0 },
  { stepType: 'close', delayDays: 0 },
];
