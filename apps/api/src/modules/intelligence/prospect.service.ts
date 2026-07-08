import { randomUUID } from 'node:crypto';
import type { PipelineStatus } from '@seo-os/seo-intelligence';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const VALID_TRANSITIONS: Record<PipelineStatus, PipelineStatus[]> = {
  discovered: ['qualified', 'lost'],
  qualified: ['approved', 'lost', 'discovered'],
  approved: ['outreach_ready', 'lost'],
  outreach_ready: ['won', 'lost'],
  won: [],
  lost: [],
};

export async function listProspects(workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('prospects')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('score', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function listProspectsByStatus(workspaceId: string) {
  const prospects = await listProspects(workspaceId);
  const columns: Record<PipelineStatus, typeof prospects> = {
    discovered: [],
    qualified: [],
    approved: [],
    outreach_ready: [],
    won: [],
    lost: [],
  };
  for (const p of prospects) {
    const status = p.pipeline_status as PipelineStatus;
    if (columns[status]) columns[status].push(p);
  }
  return columns;
}

export async function createProspectFromOpportunity(
  workspaceId: string,
  opportunityId: string
) {
  const { data: opp } = await getSupabaseAdmin()
    .from('opportunities')
    .select('*')
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId)
    .single();

  if (!opp) throw new Error('Opportunity not found');

  const domain = opp.domain ?? `prospect-${opportunityId.slice(0, 8)}.example`;
  const { data, error } = await getSupabaseAdmin()
    .from('prospects')
    .upsert(
      {
        id: randomUUID(),
        workspace_id: workspaceId,
        domain,
        url: opp.url,
        title: opp.title,
        prospect_type: opp.opportunity_type,
        pipeline_status: 'discovered',
        opportunity_id: opportunityId,
        score: opp.score,
        summary: opp.summary,
      },
      { onConflict: 'workspace_id,domain' }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateProspectStatus(
  prospectId: string,
  workspaceId: string,
  newStatus: PipelineStatus
) {
  const { data: prospect } = await getSupabaseAdmin()
    .from('prospects')
    .select('pipeline_status')
    .eq('id', prospectId)
    .eq('workspace_id', workspaceId)
    .single();

  if (!prospect) throw new Error('Prospect not found');

  const current = prospect.pipeline_status as PipelineStatus;
  if (!VALID_TRANSITIONS[current]?.includes(newStatus)) {
    throw new Error(`Invalid transition: ${current} → ${newStatus}`);
  }

  const { data, error } = await getSupabaseAdmin()
    .from('prospects')
    .update({ pipeline_status: newStatus })
    .eq('id', prospectId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
