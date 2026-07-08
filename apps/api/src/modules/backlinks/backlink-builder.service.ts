import { randomUUID } from 'node:crypto';
import {
  BACKLINK_TYPES,
  buildAiSuggestion,
  getTypesByCategory,
  scoreBacklinkOpportunity,
  suggestBacklinkTypes,
  type BacklinkCategory,
} from '@seo-os/backlink-builder';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { listProspectsByStatus } from '../intelligence/prospect.service.js';
import { attachOpportunitiesToCampaign, listCampaigns } from '../campaigns/campaign.service.js';
import { getProjectById } from '../projects/project.service.js';

export interface ExplorerFilters {
  category?: BacklinkCategory;
  type?: string;
  minScore?: number;
  queueStatus?: string;
  verificationStatus?: string;
  search?: string;
}

export async function getBacklinkDashboard(workspaceId: string) {
  const [pipeline, opportunities, backlinks, campaigns] = await Promise.all([
    listProspectsByStatus(workspaceId),
    getSupabaseAdmin()
      .from('opportunities')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId),
    getSupabaseAdmin()
      .from('backlinks')
      .select('verification_status')
      .eq('workspace_id', workspaceId),
    listCampaigns(workspaceId),
  ]);

  const bl = backlinks.data ?? [];
  const counts = {
    discovered: pipeline.discovered.length,
    qualified: pipeline.qualified.length,
    approved: pipeline.approved.length,
    outreach_ready: pipeline.outreach_ready.length,
    won: pipeline.won.length,
    lost: pipeline.lost.length,
    verified: bl.filter((b) => b.verification_status === 'verified').length,
    pending: bl.filter((b) => b.verification_status === 'pending').length,
    totalOpportunities: opportunities.count ?? 0,
    activeCampaigns: campaigns.filter((c) => c.status === 'active').length,
  };

  return counts;
}

export async function listBacklinkTypes(category?: BacklinkCategory) {
  const types = getTypesByCategory(category);
  return types.map((t) => ({
    id: t.id,
    category: t.category,
    display_name: t.displayName,
  }));
}

export async function exploreOpportunities(workspaceId: string, filters: ExplorerFilters = {}) {
  let query = getSupabaseAdmin()
    .from('opportunities')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('score', { ascending: false });

  if (filters.category) query = query.eq('backlink_category', filters.category);
  if (filters.type) query = query.eq('opportunity_type', filters.type);
  if (filters.minScore) query = query.gte('score', filters.minScore);
  if (filters.queueStatus) query = query.eq('queue_status', filters.queueStatus);
  if (filters.verificationStatus) query = query.eq('verification_status', filters.verificationStatus);

  const { data, error } = await query;
  if (error) throw error;

  let results = data ?? [];
  if (filters.search) {
    const q = filters.search.toLowerCase();
    results = results.filter(
      (o) =>
        String(o.title).toLowerCase().includes(q) ||
        String(o.domain ?? '').toLowerCase().includes(q)
    );
  }

  return results.map((o) => ({
    ...o,
    ai_suggestion: o.ai_recommendation ?? buildAiSuggestion({
      score: Number(o.score),
      opportunity_type: o.opportunity_type,
      title: o.title,
    }),
  }));
}

export async function getOpportunityDetail(opportunityId: string, workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('opportunities')
    .select('*')
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId)
    .single();
  if (error || !data) return null;

  const typeMeta = BACKLINK_TYPES.find((t) => t.id === data.opportunity_type);
  return {
    ...data,
    category: data.backlink_category ?? typeMeta?.category,
    type_label: typeMeta?.displayName ?? data.opportunity_type,
    ai_suggestion: data.ai_recommendation ?? buildAiSuggestion({
      score: Number(data.score),
      opportunity_type: data.opportunity_type,
      title: data.title,
    }),
    score_tier: scoreBacklinkOpportunity({
      type: data.opportunity_type,
      title: data.title,
      domain: data.domain,
    }) >= 75 ? 'high' : 'medium',
  };
}

export async function enrichOpportunityScoring(workspaceId: string) {
  const { data: opps } = await getSupabaseAdmin()
    .from('opportunities')
    .select('*')
    .eq('workspace_id', workspaceId);

  for (const opp of opps ?? []) {
    const typeMeta = BACKLINK_TYPES.find((t) => t.id === opp.opportunity_type);
    const score = scoreBacklinkOpportunity({
      type: opp.opportunity_type,
      title: opp.title,
      domain: opp.domain,
    });
    const suggestion = buildAiSuggestion({
      score,
      opportunity_type: opp.opportunity_type,
      title: opp.title,
    });
    await getSupabaseAdmin()
      .from('opportunities')
      .update({
        score,
        backlink_category: typeMeta?.category ?? opp.backlink_category,
        ai_recommendation: suggestion,
      })
      .eq('id', opp.id);
  }
}

export async function addOpportunityToCampaign(
  opportunityId: string,
  campaignId: string,
  workspaceId: string
) {
  await attachOpportunitiesToCampaign(campaignId, workspaceId, [opportunityId]);
  await getSupabaseAdmin()
    .from('opportunities')
    .update({ status: 'in_campaign', queue_status: 'approved' })
    .eq('id', opportunityId);
  return { attached: true };
}

export async function getAiSuggestions(workspaceId: string, orgId: string) {
  const project = await getProjectById(workspaceId, orgId);
  const types = suggestBacklinkTypes({ industry: project?.industry ?? undefined });
  const { data: top } = await getSupabaseAdmin()
    .from('opportunities')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('score', { ascending: false })
    .limit(5);

  return {
    recommendedTypes: types,
    topOpportunities: (top ?? []).map((o) => ({
      ...o,
      ai_suggestion: buildAiSuggestion({
        score: Number(o.score),
        opportunity_type: o.opportunity_type,
        title: o.title,
      }),
    })),
    insight: `Focus on ${types.slice(0, 3).join(', ')} for ${project?.domain ?? 'this project'}.`,
  };
}

export async function listWonBacklinks(workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('backlinks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('won_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listLostBacklinks(workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('backlinks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('verification_status', 'lost')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listPendingBacklinks(workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('backlinks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('verification_status', 'pending')
    .order('won_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getLinkAudit(workspaceId: string) {
  const [backlinks, checks] = await Promise.all([
    getSupabaseAdmin()
      .from('backlinks')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false }),
    getSupabaseAdmin()
      .from('backlink_checks')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('checked_at', { ascending: false })
      .limit(50),
  ]);

  const bl = backlinks.data ?? [];
  return {
    summary: {
      total: bl.length,
      verified: bl.filter((b) => b.verification_status === 'verified').length,
      pending: bl.filter((b) => b.verification_status === 'pending').length,
      lost: bl.filter((b) => b.verification_status === 'lost').length,
    },
    backlinks: bl,
    recentChecks: checks.data ?? [],
  };
}

export async function verifyBacklink(
  backlinkId: string,
  workspaceId: string,
  status: 'verified' | 'lost' | 'unreachable',
  notes?: string
) {
  const updates: Record<string, unknown> = {
    verification_status: status,
    verified_at: status === 'verified' ? new Date().toISOString() : null,
  };

  const { data, error } = await getSupabaseAdmin()
    .from('backlinks')
    .update(updates)
    .eq('id', backlinkId)
    .eq('workspace_id', workspaceId)
    .select()
    .single();
  if (error) throw error;

  await getSupabaseAdmin().from('backlink_checks').insert({
    id: randomUUID(),
    backlink_id: backlinkId,
    workspace_id: workspaceId,
    status,
    notes,
  });

  return data;
}

export async function recordWonBacklink(
  workspaceId: string,
  input: {
    prospectId?: string;
    opportunityId?: string;
    campaignId?: string;
    backlinkType: string;
    sourceUrl: string;
    targetUrl?: string;
    anchorText?: string;
    domain: string;
  }
) {
  const id = randomUUID();
  const { data, error } = await getSupabaseAdmin()
    .from('backlinks')
    .insert({
      id,
      workspace_id: workspaceId,
      prospect_id: input.prospectId ?? null,
      opportunity_id: input.opportunityId ?? null,
      campaign_id: input.campaignId ?? null,
      backlink_type: input.backlinkType,
      source_url: input.sourceUrl,
      target_url: input.targetUrl,
      anchor_text: input.anchorText,
      domain: input.domain,
      verification_status: 'pending',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
