import type { Organization } from '@seo-os/shared';
import { getSupabaseAdmin } from '../../lib/supabase.js';

function mapOrg(row: Record<string, unknown>): Organization {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    industry: (row.industry as string) ?? null,
    plan: row.plan as string,
    settings: (row.settings as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function createOrganization(
  userId: string,
  input: { name: string; slug: string; industry?: string }
): Promise<Organization> {
  const { data: org, error: orgError } = await getSupabaseAdmin()
    .from('organizations')
    .insert({
      name: input.name,
      slug: input.slug,
      industry: input.industry ?? null,
    })
    .select()
    .single();

  if (orgError) throw orgError;

  const { error: memberError } = await getSupabaseAdmin().from('org_members').insert({
    org_id: org.id,
    user_id: userId,
    role: 'owner',
    status: 'active',
    joined_at: new Date().toISOString(),
  });

  if (memberError) throw memberError;

  return mapOrg(org);
}

export async function getOrganization(orgId: string): Promise<Organization | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single();

  if (error) return null;
  return mapOrg(data);
}

export async function listUserOrganizations(
  userId: string
): Promise<Array<Organization & { role: string }>> {
  const { data, error } = await getSupabaseAdmin()
    .from('org_members')
    .select('role, organizations(*)')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) throw error;

  return (data ?? []).map((row) => {
    const org = row.organizations as unknown as Record<string, unknown>;
    return { ...mapOrg(org), role: row.role as string };
  });
}
