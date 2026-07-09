export const EPIC_PIPELINE_STAGES = [
  { id: 'discovered', label: 'Discovered', color: 'border-blue-500/30 bg-blue-500/5' },
  { id: 'qualified', label: 'Qualified', color: 'border-violet-500/30 bg-violet-500/5' },
  { id: 'approved', label: 'Approved', color: 'border-emerald-500/30 bg-emerald-500/5' },
  { id: 'campaign_ready', label: 'Campaign Ready', color: 'border-cyan-500/30 bg-cyan-500/5' },
  { id: 'outreach', label: 'Outreach', color: 'border-amber-500/30 bg-amber-500/5' },
  { id: 'negotiation', label: 'Negotiation', color: 'border-orange-500/30 bg-orange-500/5' },
  { id: 'won', label: 'Won', color: 'border-primary/30 bg-primary/5' },
  { id: 'lost', label: 'Lost', color: 'border-muted-foreground/30 bg-muted/30' },
  { id: 'verified', label: 'Verified', color: 'border-green-600/30 bg-green-600/5' },
] as const;

export type BacklinkSummary = {
  totalOpportunities: number;
  discovered: number;
  qualified: number;
  approved: number;
  campaign_ready: number;
  outreach_running: number;
  won: number;
  lost: number;
  verified: number;
  pending: number;
  avgDomainRating: number;
  successRate: number;
  activeCampaigns: number;
  aiActivity?: Array<{ agent: string; agentType: string; task: string; progress: number }>;
  outreach_ready?: number;
};

export type AutomationSummary = {
  importedWebsites: number;
  totalImports: number;
  analyzedWebsites: number;
  qualifiedOpportunities: number;
  contentGenerated: number;
  pendingApproval: number;
  submitted: number;
  published: number;
  verified: number;
  rejected: number;
  waiting: number;
  accepted: number;
  disclaimer?: string;
  recentRuns?: Array<{
    id: string;
    status: string;
    current_step?: string;
    progress: number;
    steps_completed?: string[];
    created_at: string;
  }>;
  pipelineSteps?: Array<{ id: string; label: string; order: number }>;
};

export type BacklinkOpportunity = {
  id: string;
  title: string;
  website_name?: string;
  score: number;
  opportunity_type: string;
  backlink_category?: string;
  domain?: string;
  logo_url?: string;
  domain_rating?: number;
  monthly_traffic?: number;
  country?: string;
  language?: string;
  spam_score?: number;
  success_probability?: number;
  reply_rate_prediction?: number;
  pipeline_stage?: string;
  queue_status?: string;
  verification_status?: string;
  ai_recommendation?: string;
  ai_suggestion?: string;
  campaign_id?: string;
  campaigns?: { id: string; name: string } | null;
  owner_id?: string;
  status?: string;
  suggested_anchor?: string;
  suggested_target_page?: string;
  outreach_strategy?: string;
  url?: string;
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

export function formatNumber(n?: number | null): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
