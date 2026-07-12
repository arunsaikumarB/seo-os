import { randomUUID } from 'node:crypto';
import { fireAndForget, publishPlatformEvent } from '../platform/event-bus.service.js';
import {
  AI_WORKFORCE_AGENTS,
  BACKLINK_TYPES,
  PIPELINE_STAGES,
  buildAiSuggestion,
  buildPaginationMeta,
  canTransition,
  estimateSuccessProbability,
  faviconUrl,
  generateEmailDraft,
  generateGuestPostDraft,
  generatePressReleaseDraft,
  getTypesByCategory,
  normalizePipelineStage,
  parsePagination,
  predictReplyRate,
  scoreBacklinkOpportunity,
  suggestAnchorText,
  suggestBacklinkTypes,
  suggestOutreachStrategy,
  suggestTargetPage,
  summarizeWebsite,
  type BacklinkCategory,
  type PipelineStage,
} from '@seo-os/backlink-builder';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logRelationshipTimeline } from '../relationships/relationship-intelligence.service.js';
import { listProspectsByStatus } from '../intelligence/prospect.service.js';
import { attachOpportunitiesToCampaign, listCampaigns } from '../campaigns/campaign.service.js';
import { getProjectById } from '../projects/project.service.js';

export interface ExplorerFilters {
  category?: BacklinkCategory;
  type?: string;
  minScore?: number;
  maxSpam?: number;
  queueStatus?: string;
  pipelineStage?: string;
  verificationStatus?: string;
  campaignId?: string;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  limit?: number;
  cursor?: string;
}

function enrichOpportunityRow(o: Record<string, unknown>, brand?: string): Record<string, unknown> {
  const ctx = {
    title: String(o.title),
    domain: o.domain as string | null,
    opportunity_type: String(o.opportunity_type),
    score: Number(o.score ?? 0),
    domain_rating: o.domain_rating as number | null,
    monthly_traffic: o.monthly_traffic as number | null,
    spam_score: o.spam_score as number | null,
    website_name: o.website_name as string | null,
  };
  const score =
    ctx.score ||
    scoreBacklinkOpportunity({
      type: ctx.opportunity_type,
      title: ctx.title,
      domain: ctx.domain ?? undefined,
      da: ctx.domain_rating ?? undefined,
    });
  return {
    ...o,
    logo_url: o.logo_url ?? faviconUrl(ctx.domain),
    pipeline_stage: normalizePipelineStage(String(o.pipeline_stage ?? 'discovered')),
    success_probability: o.success_probability ?? estimateSuccessProbability({ ...ctx, score }),
    reply_rate_prediction: o.reply_rate_prediction ?? predictReplyRate({ ...ctx, score }),
    spam_score: o.spam_score ?? Math.max(5, 100 - score),
    ai_suggestion:
      o.ai_recommendation ??
      buildAiSuggestion({ score, opportunity_type: ctx.opportunity_type, title: ctx.title }),
    suggested_anchor: o.suggested_anchor ?? suggestAnchorText(ctx, brand),
    suggested_target_page: o.suggested_target_page ?? suggestTargetPage(ctx.domain),
    outreach_strategy: o.outreach_strategy ?? suggestOutreachStrategy({ ...ctx, score }),
  };
}

async function logHistory(
  workspaceId: string,
  opportunityId: string,
  eventType: string,
  title: string,
  actorId?: string,
  metadata: Record<string, unknown> = {}
) {
  await getSupabaseAdmin()
    .from('backlink_history')
    .insert({
      id: randomUUID(),
      workspace_id: workspaceId,
      opportunity_id: opportunityId,
      event_type: eventType,
      title,
      actor_id: actorId ?? null,
      metadata,
    });
}

export async function getBacklinkDashboard(workspaceId: string) {
  const [opps, backlinks, campaigns] = await Promise.all([
    getSupabaseAdmin()
      .from('opportunities')
      .select('pipeline_stage, domain_rating, success_probability, score')
      .eq('workspace_id', workspaceId),
    getSupabaseAdmin()
      .from('backlinks')
      .select('verification_status, da_score')
      .eq('workspace_id', workspaceId),
    listCampaigns(workspaceId),
  ]);

  const opportunities = opps.data ?? [];
  const bl = backlinks.data ?? [];

  const stageCounts = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, 0])) as Record<
    PipelineStage,
    number
  >;
  for (const o of opportunities) {
    const stage = normalizePipelineStage(String(o.pipeline_stage ?? 'discovered'));
    stageCounts[stage] = (stageCounts[stage] ?? 0) + 1;
  }

  const drValues = opportunities.map((o) => Number(o.domain_rating ?? 0)).filter((v) => v > 0);
  const avgDr = drValues.length
    ? Math.round(drValues.reduce((a, b) => a + b, 0) / drValues.length)
    : 0;

  const won = stageCounts.won + stageCounts.verified;
  const attempted = won + stageCounts.lost;
  const successRate = attempted > 0 ? Math.round((won / attempted) * 100) : 0;

  return {
    totalOpportunities: opportunities.length,
    discovered: stageCounts.discovered,
    qualified: stageCounts.qualified,
    approved: stageCounts.approved,
    campaign_ready: stageCounts.campaign_ready,
    outreach_running: stageCounts.outreach + stageCounts.negotiation,
    won: stageCounts.won,
    lost: stageCounts.lost,
    verified: stageCounts.verified + bl.filter((b) => b.verification_status === 'verified').length,
    pending: bl.filter((b) => b.verification_status === 'pending').length,
    avgDomainRating: avgDr,
    successRate,
    activeCampaigns: campaigns.filter((c) => c.status === 'active').length,
    aiActivity: AI_WORKFORCE_AGENTS.map((a, i) => ({
      agent: a.displayName,
      agentType: a.id,
      task: [
        'Scoring opportunities',
        'Discovering prospects',
        'Generating drafts',
        'Verifying links',
      ][i % 4],
      progress: 40 + ((i * 7) % 55),
    })),
    // legacy keys for widget compat
    outreach_ready: stageCounts.campaign_ready,
  };
}

export async function listBacklinkTypes(category?: BacklinkCategory) {
  return getTypesByCategory(category).map((t) => ({
    id: t.id,
    category: t.category,
    display_name: t.displayName,
  }));
}

export async function exploreOpportunities(
  workspaceId: string,
  filters: ExplorerFilters = {},
  orgId?: string
) {
  const project = orgId ? await getProjectById(workspaceId, orgId) : null;
  const brand = project?.name;

  let query = getSupabaseAdmin()
    .from('opportunities')
    .select('*, campaigns:campaign_id(id, name)')
    .eq('workspace_id', workspaceId);

  const sortCol = filters.sort ?? 'score';
  const ascending = filters.order === 'asc';
  query = query.order(sortCol, { ascending });

  if (filters.category) query = query.eq('backlink_category', filters.category);
  if (filters.type) query = query.eq('opportunity_type', filters.type);
  if (filters.minScore) query = query.gte('score', filters.minScore);
  if (filters.queueStatus) query = query.eq('queue_status', filters.queueStatus);
  if (filters.pipelineStage) query = query.eq('pipeline_stage', filters.pipelineStage);
  if (filters.verificationStatus)
    query = query.eq('verification_status', filters.verificationStatus);
  if (filters.campaignId) query = query.eq('campaign_id', filters.campaignId);
  if (filters.cursor) query = query.lt('id', filters.cursor);

  const limit = Math.min(100, filters.limit ?? 25);
  query = query.limit(limit + 1);

  const { data, error } = await query;
  if (error) throw error;

  let results = (data ?? []).map((o) => enrichOpportunityRow(o as Record<string, unknown>, brand));
  if (filters.search) {
    const q = filters.search.toLowerCase();
    results = results.filter(
      (o) =>
        String(o.title).toLowerCase().includes(q) ||
        String(o.domain ?? '')
          .toLowerCase()
          .includes(q) ||
        String(o.website_name ?? '')
          .toLowerCase()
          .includes(q)
    );
  }
  if (filters.maxSpam) results = results.filter((o) => Number(o.spam_score) <= filters.maxSpam!);

  const { items, pagination } = buildPaginationMeta(
    results.map((o) => ({ ...o, id: String(o.id) })),
    limit
  );
  return { items, pagination };
}

export async function getOpportunityDetail(
  opportunityId: string,
  workspaceId: string,
  orgId?: string
) {
  const project = orgId ? await getProjectById(workspaceId, orgId) : null;
  const { data, error } = await getSupabaseAdmin()
    .from('opportunities')
    .select('*, campaigns:campaign_id(id, name)')
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId)
    .single();
  if (error || !data) return null;

  const typeMeta = BACKLINK_TYPES.find((t) => t.id === data.opportunity_type);
  const enriched = enrichOpportunityRow(data as Record<string, unknown>, project?.name);
  const [notes, history, drafts] = await Promise.all([
    getSupabaseAdmin()
      .from('backlink_notes')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .order('created_at', { ascending: false })
      .limit(20),
    getSupabaseAdmin()
      .from('backlink_history')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .order('created_at', { ascending: false })
      .limit(20),
    getSupabaseAdmin()
      .from('backlink_ai_drafts')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  return {
    ...enriched,
    category: data.backlink_category ?? typeMeta?.category,
    type_label: typeMeta?.displayName ?? data.opportunity_type,
    score_tier:
      Number(enriched.score) >= 75 ? 'high' : Number(enriched.score) >= 55 ? 'medium' : 'low',
    notes: notes.data ?? [],
    history: history.data ?? [],
    drafts: drafts.data ?? [],
  };
}

export async function listOpportunitiesByPipeline(workspaceId: string, orgId?: string) {
  const { items } = await exploreOpportunities(workspaceId, { limit: 500 }, orgId);
  const columns = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, [] as typeof items])) as Record<
    PipelineStage,
    typeof items
  >;
  for (const o of items) {
    const stage = normalizePipelineStage(
      String((o as Record<string, unknown>).pipeline_stage ?? 'discovered')
    );
    columns[stage]?.push(o);
  }
  return columns;
}

export async function moveOpportunityStage(
  opportunityId: string,
  workspaceId: string,
  newStage: PipelineStage,
  actorId?: string
) {
  const { data: opp } = await getSupabaseAdmin()
    .from('opportunities')
    .select('pipeline_stage')
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!opp) throw new Error('Opportunity not found');

  const current = normalizePipelineStage(String(opp.pipeline_stage ?? 'discovered'));
  if (!canTransition(current, newStage)) {
    throw new Error(`Invalid transition: ${current} → ${newStage}`);
  }

  const { data, error } = await getSupabaseAdmin()
    .from('opportunities')
    .update({ pipeline_stage: newStage, status: newStage })
    .eq('id', opportunityId)
    .select()
    .single();
  if (error) throw error;

  await logHistory(workspaceId, opportunityId, 'pipeline.moved', `Moved to ${newStage}`, actorId, {
    from: current,
    to: newStage,
  });
  return data;
}

export async function bulkOpportunityAction(
  workspaceId: string,
  opportunityIds: string[],
  action: 'approve' | 'reject' | 'move',
  payload?: { stage?: PipelineStage; actorId?: string }
) {
  const results = [];
  for (const id of opportunityIds) {
    if (action === 'approve') {
      await getSupabaseAdmin()
        .from('opportunities')
        .update({ queue_status: 'approved', pipeline_stage: 'approved' })
        .eq('id', id);
      await logHistory(
        workspaceId,
        id,
        'opportunity.approved',
        'Approved via bulk action',
        payload?.actorId
      );
      results.push({ id, status: 'approved' });
    } else if (action === 'reject') {
      await getSupabaseAdmin()
        .from('opportunities')
        .update({ queue_status: 'rejected', pipeline_stage: 'lost' })
        .eq('id', id);
      results.push({ id, status: 'rejected' });
    } else if (action === 'move' && payload?.stage) {
      await moveOpportunityStage(id, workspaceId, payload.stage, payload.actorId);
      results.push({ id, status: payload.stage });
    }
  }
  return results;
}

export async function enrichOpportunityScoring(workspaceId: string, orgId?: string) {
  const project = orgId ? await getProjectById(workspaceId, orgId) : null;
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
      da: opp.domain_rating,
    });
    const enriched = enrichOpportunityRow({ ...opp, score }, project?.name);
    await getSupabaseAdmin()
      .from('opportunities')
      .update({
        score,
        backlink_category: typeMeta?.category ?? opp.backlink_category,
        ai_recommendation: enriched.ai_suggestion,
        success_probability: enriched.success_probability,
        reply_rate_prediction: enriched.reply_rate_prediction,
        spam_score: enriched.spam_score,
        suggested_anchor: enriched.suggested_anchor,
        suggested_target_page: enriched.suggested_target_page,
        outreach_strategy: enriched.outreach_strategy,
        logo_url: enriched.logo_url,
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
    .update({
      status: 'in_campaign',
      queue_status: 'approved',
      pipeline_stage: 'campaign_ready',
      campaign_id: campaignId,
    })
    .eq('id', opportunityId);
  await logHistory(workspaceId, opportunityId, 'campaign.attached', 'Added to campaign');
  return { attached: true };
}

export async function getAiSuggestions(workspaceId: string, orgId: string) {
  const project = await getProjectById(workspaceId, orgId);
  const types = suggestBacklinkTypes({ industry: project?.industry ?? undefined });
  const { items } = await exploreOpportunities(workspaceId, { limit: 10, minScore: 60 }, orgId);
  return {
    recommendedTypes: types,
    topOpportunities: items.slice(0, 5),
    agents: AI_WORKFORCE_AGENTS,
    insight: `Focus on ${types
      .slice(0, 3)
      .map((t) => t.replace(/_/g, ' '))
      .join(', ')} for ${project?.domain ?? 'this project'}.`,
  };
}

export async function generateAiDraft(
  opportunityId: string,
  workspaceId: string,
  draftType: 'email' | 'guest_post' | 'press_release' | 'outreach_strategy' | 'website_summary',
  orgId?: string
) {
  const detail = await getOpportunityDetail(opportunityId, workspaceId, orgId);
  if (!detail) throw new Error('Opportunity not found');
  const project = orgId ? await getProjectById(workspaceId, orgId) : null;
  const brand = project?.name ?? 'Our Brand';
  const d = detail as Record<string, unknown>;
  const ctx = {
    title: String(d.title),
    domain: d.domain as string | null,
    opportunity_type: String(d.opportunity_type),
    website_name: d.website_name as string | null,
    score: Number(d.score),
  };

  const contentMap = {
    email: generateEmailDraft(ctx, brand),
    guest_post: generateGuestPostDraft(ctx, brand),
    press_release: generatePressReleaseDraft(ctx, brand),
    outreach_strategy: suggestOutreachStrategy(ctx),
    website_summary: summarizeWebsite(ctx),
  };

  const titleMap: Record<typeof draftType, string> = {
    email: `Email — ${ctx.title}`,
    guest_post: `Guest Post — ${ctx.title}`,
    press_release: `Press Release — ${ctx.title}`,
    outreach_strategy: `Strategy — ${ctx.title}`,
    website_summary: `Summary — ${ctx.domain}`,
  };

  const { data, error } = await getSupabaseAdmin()
    .from('backlink_ai_drafts')
    .insert({
      id: randomUUID(),
      workspace_id: workspaceId,
      opportunity_id: opportunityId,
      draft_type: draftType,
      title: titleMap[draftType],
      content: contentMap[draftType],
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listRelationships(workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('backlink_relationships')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('won_count', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getCampaignAssociations(workspaceId: string) {
  const [campaigns, opps] = await Promise.all([
    listCampaigns(workspaceId),
    getSupabaseAdmin()
      .from('opportunities')
      .select('id, title, domain, campaign_id, pipeline_stage, score')
      .eq('workspace_id', workspaceId)
      .not('campaign_id', 'is', null),
  ]);
  return {
    campaigns,
    associations: (opps.data ?? []).map((o) => ({
      ...o,
      pipeline_stage: normalizePipelineStage(String(o.pipeline_stage ?? 'discovered')),
    })),
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
  const [backlinks, checks, history] = await Promise.all([
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
    getSupabaseAdmin()
      .from('backlink_history')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(30),
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
    recentHistory: history.data ?? [],
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

  if (status === 'verified' && data?.domain) {
    const domain = String(data.domain);
    const { data: org } = await getSupabaseAdmin()
      .from('relationship_organizations')
      .select('id, backlinks_won')
      .eq('workspace_id', workspaceId)
      .eq('domain', domain)
      .maybeSingle();
    await logRelationshipTimeline(
      workspaceId,
      'backlink_verified',
      `Backlink verified on ${domain}`,
      {
        organizationId: org?.id,
        metadata: { backlinkId, sourceUrl: data.source_url },
      }
    );
    if (org?.id) {
      await getSupabaseAdmin()
        .from('relationship_organizations')
        .update({ backlinks_won: Number(org.backlinks_won ?? 0) + 1 })
        .eq('id', org.id);
    }
  }

  if (status === 'verified') {
    fireAndForget(
      publishPlatformEvent({
        workspaceId,
        sourceModule: 'backlink_builder',
        eventType: 'backlink_verified',
        title: `Backlink verified${data?.domain ? ` on ${data.domain}` : ''}`,
        summary: notes ?? data?.source_url ?? undefined,
        severity: 'success',
        entityType: 'backlink',
        entityId: backlinkId,
        payload: { backlinkId, status, domain: data?.domain },
        href: `/projects/${workspaceId}/backlink-builder/won`,
      })
    );
  }

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

  if (input.opportunityId) {
    await getSupabaseAdmin()
      .from('opportunities')
      .update({ pipeline_stage: 'won' })
      .eq('id', input.opportunityId);
  }
  return data;
}

export { parsePagination, listProspectsByStatus };
