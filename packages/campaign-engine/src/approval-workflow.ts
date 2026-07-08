import type { ApprovalType } from './campaign-types.js';

export interface ApprovalRequest {
  approvalType: ApprovalType;
  subjectId: string;
  subjectType: string;
  title: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}

export function approvalTitle(type: ApprovalType, subject: string): string {
  const labels: Record<ApprovalType, string> = {
    opportunity: 'Opportunity review',
    email_draft: 'Email draft review',
    content_draft: 'Content draft review',
    campaign_launch: 'Campaign launch approval',
  };
  return `${labels[type]}: ${subject}`;
}
