import { randomUUID } from 'node:crypto';
import type { PipelineStatus } from '@seo-os/seo-intelligence';
import {
  canTransition,
  normalizePipelineStage,
  type PipelineStage,
} from '@seo-os/backlink-builder';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const EPIC_STAGES: PipelineStage[] = [
  'discovered',
  'qualified',
  'approved',
  'campaign_ready',
  'outreach',
  'negotiation',
  'won',
  'lost',
  'verified',
];

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
  const columns = Object.fromEntries(EPIC_STAGES.map((s) => [s, [] as typeof prospects])) as Record<
    PipelineStage,
    typeof prospects
  >;

  for (const p of prospects) {
    const status = normalizePipelineStage(p.pipeline_status as string) as PipelineStage;
    if (columns[status]) columns[status].push(p);
  }
  return columns;
}

export async function createProspectFromOpportunity(workspaceId: string, opportunityId: string) {
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
        pipeline_status: opp.pipeline_stage ?? 'discovered',
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

  const current = normalizePipelineStage(prospect.pipeline_status as string) as PipelineStage;
  const next = normalizePipelineStage(newStatus) as PipelineStage;
  if (!canTransition(current, next)) {
    throw new Error(`Invalid transition: ${current} → ${next}`);
  }

  const { data, error } = await getSupabaseAdmin()
    .from('prospects')
    .update({ pipeline_status: next })
    .eq('id', prospectId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
