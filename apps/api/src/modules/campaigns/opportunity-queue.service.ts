import { recommendOpportunities } from '@seo-os/campaign-engine';
import type { CampaignType } from '@seo-os/campaign-engine';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function listOpportunityQueue(workspaceId: string, filters?: {
  queueStatus?: string;
  campaignType?: string;
}) {
  let query = getSupabaseAdmin()
    .from('opportunities')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('priority', { ascending: false })
    .order('score', { ascending: false });

  if (filters?.queueStatus) query = query.eq('queue_status', filters.queueStatus);
  if (filters?.campaignType) query = query.eq('opportunity_type', filters.campaignType);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getOpportunityRecommendations(
  workspaceId: string,
  campaignType?: CampaignType
) {
  const opportunities = await listOpportunityQueue(workspaceId, {
    queueStatus: 'pending_review',
  });
  const typed = opportunities.map((o) => ({
    ...o,
    score: Number(o.score),
    opportunity_type: o.opportunity_type as string,
  }));
  return recommendOpportunities(
    typed,
    campaignType ?? 'guest_post',
    10
  );
}

export async function reviewOpportunity(
  opportunityId: string,
  workspaceId: string,
  _userId: string,
  action: 'approve' | 'reject',
  notes?: string
) {
  const queueStatus = action === 'approve' ? 'approved' : 'rejected';
  const status = action === 'approve' ? 'approved' : 'dismissed';

  const { data, error } = await getSupabaseAdmin()
    .from('opportunities')
    .update({
      queue_status: queueStatus,
      status,
      metadata: notes ? { reviewNotes: notes } : {},
    })
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function bulkReviewOpportunities(
  workspaceId: string,
  userId: string,
  opportunityIds: string[],
  action: 'approve' | 'reject'
) {
  const results = [];
  for (const id of opportunityIds) {
    results.push(await reviewOpportunity(id, workspaceId, userId, action));
  }
  return results;
}

export async function updateOpportunityPriority(
  opportunityId: string,
  workspaceId: string,
  priority: number
) {
  const { data, error } = await getSupabaseAdmin()
    .from('opportunities')
    .update({ priority })
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function enrichOpportunityRecommendations(workspaceId: string) {
  const { data: opps } = await getSupabaseAdmin()
    .from('opportunities')
    .select('id, score')
    .eq('workspace_id', workspaceId)
    .eq('queue_status', 'pending_review');

  for (const opp of opps ?? []) {
    const score = Number(opp.score);
    const recommendation =
      score >= 75
        ? 'Strong fit — approve for campaign'
        : score >= 60
          ? 'Moderate fit — review before approving'
          : 'Low priority — consider rejecting';
    await getSupabaseAdmin()
      .from('opportunities')
      .update({ ai_recommendation: recommendation })
      .eq('id', opp.id);
  }
}
