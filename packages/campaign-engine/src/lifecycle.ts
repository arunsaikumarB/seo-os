import type { CampaignStatus } from './campaign-types.js';

const TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ['pending_approval', 'cancelled'],
  pending_approval: ['active', 'draft', 'cancelled'],
  active: ['paused', 'completed', 'cancelled'],
  paused: ['active', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function canTransitionCampaign(from: CampaignStatus, to: CampaignStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertCampaignTransition(from: CampaignStatus, to: CampaignStatus): void {
  if (!canTransitionCampaign(from, to)) {
    throw new Error(`Invalid campaign transition: ${from} → ${to}`);
  }
}

export function computeCampaignProgress(
  status: CampaignStatus,
  metrics: {
    opportunitiesTotal?: number;
    opportunitiesApproved?: number;
  }
): number {
  if (status === 'completed') return 100;
  if (status === 'draft' || status === 'pending_approval') return 0;
  if (status === 'cancelled') return 0;
  const total = metrics.opportunitiesTotal ?? 0;
  const approved = metrics.opportunitiesApproved ?? 0;
  if (total === 0) return status === 'active' ? 10 : 0;
  return Math.min(95, Math.round((approved / total) * 100));
}
