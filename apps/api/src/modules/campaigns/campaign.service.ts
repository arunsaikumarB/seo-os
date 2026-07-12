import { randomUUID } from 'node:crypto';
import {
  assertCampaignTransition,
  computeCampaignProgress,
  type CampaignStatus,
  type CampaignType,
} from '@seo-os/campaign-engine';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logRelationshipTimeline } from '../relationships/relationship-intelligence.service.js';
import { createApproval } from './approval.service.js';
import { fireAndForget, publishPlatformEvent } from '../platform/event-bus.service.js';

export async function listCampaignTypes() {
  const { data, error } = await getSupabaseAdmin()
    .from('campaign_types')
    .select('*')
    .eq('is_active', true)
    .order('display_name');
  if (error) throw error;
  return data ?? [];
}

export async function listTemplates(workspaceId: string, campaignType?: string) {
  let query = getSupabaseAdmin()
    .from('campaign_templates')
    .select('*')
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .eq('is_active', true);
  if (campaignType) query = query.eq('campaign_type', campaignType);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listCampaigns(workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('campaigns')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getCampaign(campaignId: string, workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('workspace_id', workspaceId)
    .single();
  if (error) return null;
  return data;
}

export async function getCampaignTimeline(campaignId: string, workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('campaign_timeline_events')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function logTimeline(
  campaignId: string,
  workspaceId: string,
  eventType: string,
  title: string,
  payload?: Record<string, unknown>
) {
  await getSupabaseAdmin()
    .from('campaign_timeline_events')
    .insert({
      id: randomUUID(),
      campaign_id: campaignId,
      workspace_id: workspaceId,
      event_type: eventType,
      title,
      payload: payload ?? {},
    });
}

export async function createCampaign(
  workspaceId: string,
  userId: string,
  input: {
    name: string;
    campaignType: CampaignType;
    templateId?: string;
    goals?: unknown[];
    plan?: Record<string, unknown>;
  }
) {
  const id = randomUUID();
  const { data, error } = await getSupabaseAdmin()
    .from('campaigns')
    .insert({
      id,
      workspace_id: workspaceId,
      campaign_type: input.campaignType,
      template_id: input.templateId ?? null,
      name: input.name,
      status: 'draft',
      goals: input.goals ?? [],
      plan: input.plan ?? {},
      created_by: userId,
    })
    .select()
    .single();
  if (error) throw error;
  await logTimeline(id, workspaceId, 'campaign.created', `Campaign "${input.name}" created`);
  await logRelationshipTimeline(
    workspaceId,
    'campaign_created',
    `Campaign created: ${input.name}`,
    {
      metadata: { campaignId: id, campaignType: input.campaignType },
    }
  );
  fireAndForget(
    publishPlatformEvent({
      workspaceId,
      sourceModule: 'campaigns',
      eventType: 'campaign_created',
      title: `Campaign created: ${input.name}`,
      summary: `${input.campaignType} campaign ready for planning`,
      severity: 'success',
      entityType: 'campaign',
      entityId: id,
      actorId: userId,
      payload: { campaignId: id, campaignType: input.campaignType },
      href: `/projects/${workspaceId}/campaigns/${id}`,
      notifyUserId: userId,
      audit: {
        action: 'campaign.created',
        resourceType: 'campaign',
        resourceId: id,
        after: { name: input.name, campaignType: input.campaignType },
      },
    })
  );
  return data;
}

export async function updateCampaignStatus(
  campaignId: string,
  workspaceId: string,
  userId: string,
  newStatus: CampaignStatus
) {
  const campaign = await getCampaign(campaignId, workspaceId);
  if (!campaign) throw new Error('Campaign not found');

  assertCampaignTransition(campaign.status as CampaignStatus, newStatus);

  const updates: Record<string, unknown> = { status: newStatus };
  if (newStatus === 'active') updates.started_at = new Date().toISOString();
  if (newStatus === 'completed') updates.completed_at = new Date().toISOString();

  if (newStatus === 'pending_approval') {
    await createApproval(workspaceId, userId, {
      approvalType: 'campaign_launch',
      subjectId: campaignId,
      subjectType: 'campaign',
      title: `Launch campaign: ${campaign.name}`,
      summary: `Request to activate ${campaign.campaign_type} campaign`,
    });
  }

  const { data, error } = await getSupabaseAdmin()
    .from('campaigns')
    .update(updates)
    .eq('id', campaignId)
    .select()
    .single();
  if (error) throw error;

  await logTimeline(campaignId, workspaceId, 'campaign.status_changed', `Status → ${newStatus}`, {
    from: campaign.status,
    to: newStatus,
  });

  return data;
}

export async function attachOpportunitiesToCampaign(
  campaignId: string,
  workspaceId: string,
  opportunityIds: string[]
) {
  for (const oppId of opportunityIds) {
    await getSupabaseAdmin().from('campaign_opportunities').upsert({
      campaign_id: campaignId,
      opportunity_id: oppId,
    });
    await getSupabaseAdmin()
      .from('opportunities')
      .update({ campaign_id: campaignId, status: 'in_campaign' })
      .eq('id', oppId)
      .eq('workspace_id', workspaceId);
  }
  await logTimeline(
    campaignId,
    workspaceId,
    'campaign.opportunities_added',
    `Added ${opportunityIds.length} opportunities`
  );
}

export async function refreshCampaignProgress(campaignId: string, workspaceId: string) {
  const { count: total } = await getSupabaseAdmin()
    .from('campaign_opportunities')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId);

  const { count: approved } = await getSupabaseAdmin()
    .from('opportunities')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('queue_status', 'approved');

  const campaign = await getCampaign(campaignId, workspaceId);
  if (!campaign) return;

  const progress = computeCampaignProgress(campaign.status as CampaignStatus, {
    opportunitiesTotal: total ?? 0,
    opportunitiesApproved: approved ?? 0,
  });

  await getSupabaseAdmin().from('campaigns').update({ progress }).eq('id', campaignId);
  return progress;
}

export async function getCampaignSummary(workspaceId: string) {
  const { data: campaigns } = await getSupabaseAdmin()
    .from('campaigns')
    .select('status, progress')
    .eq('workspace_id', workspaceId);

  const list = campaigns ?? [];
  return {
    active: list.filter((c) => c.status === 'active').length,
    pendingApproval: list.filter((c) => c.status === 'pending_approval').length,
    total: list.length,
    avgProgress:
      list.length > 0
        ? Math.round(list.reduce((s, c) => s + (c.progress ?? 0), 0) / list.length)
        : 0,
  };
}
