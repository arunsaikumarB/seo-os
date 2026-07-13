import { getSupabaseAdmin } from '../../lib/supabase.js';

/** Reuse project brand context without duplicating project.service imports cycles */
export async function getBrandContextForBee(workspaceId: string) {
  const { data: ws } = await getSupabaseAdmin()
    .from('workspaces')
    .select('id, name, domain, industry, org_id')
    .eq('id', workspaceId)
    .maybeSingle();

  return {
    brandName: ws?.name ?? 'Our Brand',
    projectDomain: (ws?.domain as string | undefined) ?? undefined,
    industry: (ws?.industry as string | undefined) ?? undefined,
  };
}
