/**
 * Global Ignore List — org-scoped domains permanently excluded from BEE.
 */
import { getSupabaseAdmin } from '../../lib/supabase.js';

function normalizeDomain(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]!
    .split('?')[0]!;
}

export async function orgIdForWorkspace(workspaceId: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin()
    .from('workspaces')
    .select('org_id')
    .eq('id', workspaceId)
    .maybeSingle();
  return data?.org_id ? String(data.org_id) : null;
}

export async function isDomainGloballyIgnored(
  workspaceId: string,
  siteDomain: string
): Promise<boolean> {
  const orgId = await orgIdForWorkspace(workspaceId);
  if (!orgId) return false;
  const domain = normalizeDomain(siteDomain);
  if (!domain) return false;
  const { data } = await getSupabaseAdmin()
    .from('execution_global_ignore')
    .select('id')
    .eq('org_id', orgId)
    .eq('site_domain', domain)
    .maybeSingle();
  return Boolean(data?.id);
}

export async function addToGlobalIgnore(params: {
  workspaceId: string;
  siteDomain: string;
  reason?: string;
  sourceJobId?: string;
  userId?: string;
}) {
  const orgId = await orgIdForWorkspace(params.workspaceId);
  if (!orgId) throw Object.assign(new Error('Workspace org not found'), { status: 400 });
  const domain = normalizeDomain(params.siteDomain);
  if (!domain) throw Object.assign(new Error('Invalid domain'), { status: 400 });

  const { data, error } = await getSupabaseAdmin()
    .from('execution_global_ignore')
    .upsert(
      {
        org_id: orgId,
        site_domain: domain,
        reason: params.reason ?? 'deleted_forever',
        source_workspace_id: params.workspaceId,
        source_job_id: params.sourceJobId ?? null,
        created_by: params.userId ?? null,
      },
      { onConflict: 'org_id,site_domain' }
    )
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function removeFromGlobalIgnore(workspaceId: string, siteDomain: string) {
  const orgId = await orgIdForWorkspace(workspaceId);
  if (!orgId) return { removed: false };
  const domain = normalizeDomain(siteDomain);
  await getSupabaseAdmin()
    .from('execution_global_ignore')
    .delete()
    .eq('org_id', orgId)
    .eq('site_domain', domain);
  return { removed: true, siteDomain: domain };
}

export async function listGlobalIgnore(workspaceId: string) {
  const orgId = await orgIdForWorkspace(workspaceId);
  if (!orgId) return { items: [] as unknown[] };
  const { data } = await getSupabaseAdmin()
    .from('execution_global_ignore')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  return { items: data ?? [] };
}
