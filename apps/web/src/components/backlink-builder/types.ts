export type BacklinkSummary = {
  discovered: number;
  qualified: number;
  approved: number;
  outreach_ready: number;
  won: number;
  lost: number;
  verified: number;
  pending: number;
  totalOpportunities: number;
  activeCampaigns: number;
};

export type BacklinkOpportunity = {
  id: string;
  title: string;
  score: number;
  opportunity_type: string;
  backlink_category?: string;
  domain?: string;
  queue_status?: string;
  verification_status?: string;
  ai_recommendation?: string;
  ai_suggestion?: string;
  status?: string;
};

export type BacklinkRecord = {
  id: string;
  backlink_type: string;
  source_url: string;
  target_url?: string;
  anchor_text?: string;
  domain: string;
  verification_status: string;
  won_at?: string;
  verified_at?: string;
};

export const BACKLINK_CATEGORIES = [
  { id: 'content_based', label: 'Content-Based' },
  { id: 'community_based', label: 'Community-Based' },
  { id: 'business_based', label: 'Business-Based' },
  { id: 'outreach_based', label: 'Outreach-Based' },
  { id: 'authority_based', label: 'Authority-Based' },
] as const;

export const PIPELINE_STAGES = [
  { id: 'discovered', label: 'Discovered', color: 'text-blue-600' },
  { id: 'qualified', label: 'Qualified', color: 'text-violet-600' },
  { id: 'approved', label: 'Approved', color: 'text-emerald-600' },
  { id: 'outreach_ready', label: 'Outreach Ready', color: 'text-amber-600' },
  { id: 'won', label: 'Won', color: 'text-primary' },
  { id: 'lost', label: 'Lost', color: 'text-muted-foreground' },
] as const;

export function scoreBadgeClass(score: number): string {
  if (score >= 75) return 'border-primary/30 text-primary bg-primary/5';
  if (score >= 55) return 'border-amber-500/30 text-amber-600 bg-amber-500/5';
  return 'border-muted-foreground/30 text-muted-foreground';
}

export function verificationBadgeClass(status: string): string {
  if (status === 'verified') return 'border-primary/30 text-primary';
  if (status === 'pending') return 'border-amber-500/30 text-amber-600';
  if (status === 'lost') return 'border-destructive/30 text-destructive';
  return 'border-muted-foreground/30 text-muted-foreground';
}

export function formatType(type: string): string {
  return type.replace(/_/g, ' ');
}
