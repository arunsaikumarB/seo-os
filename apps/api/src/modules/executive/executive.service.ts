import { getSupabaseAdmin } from '../../lib/supabase.js';

export type ExecutiveOrgBreakdown = {
  id: string;
  name: string;
  projectCount: number;
};

export type ExecutiveSummary = {
  organizations: number;
  projects: number;
  aiRuns: number;
  campaigns: number;
  opportunities: number;
  knowledgeDocuments: number;
  relationships: number;
  timeSavedHours: number;
  campaignSuccessRate: number;
  productivityScore: number;
  orgBreakdown: ExecutiveOrgBreakdown[];
};

async function countInWorkspaces(
  table: string,
  workspaceIds: string[],
  filter?: { column: string; value: string }
): Promise<number> {
  if (workspaceIds.length === 0) return 0;
  let query = getSupabaseAdmin()
    .from(table)
    .select('id', { count: 'exact', head: true })
    .in('workspace_id', workspaceIds);
  if (filter) {
    query = query.eq(filter.column, filter.value);
  }
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function getExecutiveSummary(
  orgId: string,
  userId: string
): Promise<ExecutiveSummary> {
  const supabase = getSupabaseAdmin();

  const { data: workspaces, error: wsError } = await supabase
    .from('workspaces')
    .select('id')
    .eq('org_id', orgId);
  if (wsError) throw wsError;
  const workspaceIds = (workspaces ?? []).map((w) => w.id as string);

  const [
    projects,
    aiRuns,
    completedRuns,
    campaigns,
    opportunities,
    knowledgeDocuments,
    relationships,
    campaignRows,
    orgMemberships,
  ] = await Promise.all([
    Promise.resolve(workspaceIds.length),
    countInWorkspaces('agent_runs', workspaceIds),
    countInWorkspaces('agent_runs', workspaceIds, { column: 'status', value: 'completed' }),
    countInWorkspaces('campaigns', workspaceIds),
    countInWorkspaces('opportunities', workspaceIds),
    countInWorkspaces('kb_documents', workspaceIds),
    countInWorkspaces('relationship_organizations', workspaceIds),
    workspaceIds.length
      ? supabase.from('campaigns').select('status').in('workspace_id', workspaceIds)
      : Promise.resolve({ data: [] as { status: string }[], error: null }),
    supabase
      .from('org_members')
      .select('org_id, organizations(id, name)')
      .eq('user_id', userId)
      .eq('status', 'active'),
  ]);

  if (campaignRows.error) throw campaignRows.error;
  if (orgMemberships.error) throw orgMemberships.error;

  const statuses = (campaignRows.data ?? []).map((c) => c.status);
  const totalCampaigns = statuses.length;
  const successfulCampaigns = statuses.filter((s) => s === 'completed' || s === 'active').length;
  const campaignSuccessRate =
    totalCampaigns > 0 ? Math.round((successfulCampaigns / totalCampaigns) * 100) : 0;

  const timeSavedHours = Math.round(completedRuns * 0.25);
  const automationRatio = aiRuns > 0 ? completedRuns / aiRuns : 0;
  const productivityScore = Math.min(
    100,
    Math.round(40 + automationRatio * 40 + Math.min(projects, 10) * 2)
  );

  const orgIds = (orgMemberships.data ?? []).map((m) => m.org_id as string);
  let orgBreakdown: ExecutiveOrgBreakdown[] = [];

  if (orgIds.length > 0) {
    const { data: allWorkspaces, error: allWsError } = await supabase
      .from('workspaces')
      .select('org_id')
      .in('org_id', orgIds);
    if (allWsError) throw allWsError;

    const countsByOrg = new Map<string, number>();
    for (const ws of allWorkspaces ?? []) {
      const id = ws.org_id as string;
      countsByOrg.set(id, (countsByOrg.get(id) ?? 0) + 1);
    }

    orgBreakdown = (orgMemberships.data ?? []).map((m) => {
      const rawOrg = m.organizations as { id: string; name: string } | { id: string; name: string }[] | null;
      const org = Array.isArray(rawOrg) ? rawOrg[0] : rawOrg;
      const id = (org?.id ?? m.org_id) as string;
      return {
        id,
        name: org?.name ?? 'Organization',
        projectCount: countsByOrg.get(id) ?? 0,
      };
    });
  }

  return {
    organizations: orgBreakdown.length || 1,
    projects,
    aiRuns,
    campaigns,
    opportunities,
    knowledgeDocuments,
    relationships,
    timeSavedHours,
    campaignSuccessRate,
    productivityScore,
    orgBreakdown,
  };
}
