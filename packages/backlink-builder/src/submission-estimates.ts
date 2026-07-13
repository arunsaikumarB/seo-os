/** Estimated review/approval time heuristics for Submission Center */

import type { BacklinkTypeId } from './backlink-types.js';

const REVIEW_HOURS: Record<string, number> = {
  directory: 24,
  profile: 12,
  citation: 48,
  forum: 72,
  qa_site: 48,
  guest_post: 168,
  resource_page: 120,
  broken_link: 96,
  press_release: 72,
  digital_pr: 144,
  edu: 336,
  gov: 336,
  partnership: 240,
};

export function estimateReviewHours(opportunityType: string): number {
  return REVIEW_HOURS[opportunityType] ?? 72;
}

export function estimateApprovalHours(opportunityType: string): number {
  return Math.round(estimateReviewHours(opportunityType) * 1.4);
}

export function buildPrefillPayload(input: {
  brandName: string;
  projectDomain?: string;
  industry?: string;
  opportunityTitle: string;
  opportunityDomain: string;
  opportunityType: string;
  contactEmail?: string;
  draftBody?: string;
  targetUrl?: string;
  anchorText?: string;
}): Record<string, unknown> {
  return {
    brandName: input.brandName,
    website: input.projectDomain ?? '',
    industry: input.industry ?? '',
    opportunityTitle: input.opportunityTitle,
    opportunityDomain: input.opportunityDomain,
    opportunityType: input.opportunityType as BacklinkTypeId,
    contactEmail: input.contactEmail ?? '',
    draftBody: input.draftBody ?? '',
    targetUrl: input.targetUrl ?? (input.projectDomain ? `https://${input.projectDomain}` : ''),
    anchorText: input.anchorText ?? input.brandName,
    notes: 'Assisted submission — user must complete third-party auth/CAPTCHA manually.',
    metricsSource: 'estimated',
  };
}

export const SUBMISSION_CENTER_STATUSES = [
  'ready',
  'awaiting_approval',
  'submitted',
  'pending_review',
  'accepted',
  'rejected',
  'failed',
  'verified',
] as const;

export type SubmissionCenterStatus = (typeof SUBMISSION_CENTER_STATUSES)[number];
