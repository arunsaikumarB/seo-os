import type { Organization, OrgMember, OrgRole, Profile } from '@seo-os/shared';
import { getSupabaseAdmin } from '../../lib/supabase.js';

function mapProfile(row: Record<string, unknown>): Profile {
  return {
    id: row.id as string,
    fullName: (row.full_name as string) ?? null,
    avatarUrl: (row.avatar_url as string) ?? null,
    timezone: row.timezone as string,
    preferences: (row.preferences as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
  };
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) return null;
  return mapProfile(data);
}

/** Backfill profile when auth.users exists but handle_new_user did not run */
export async function ensureProfile(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle();
  if (existing) return;

  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
  if (authError) throw authError;

  const user = authData.user;
  const { error } = await supabase.from('profiles').insert({
    id: userId,
    full_name:
      (user?.user_metadata?.full_name as string | undefined) ??
      user?.email ??
      'User',
    avatar_url: (user?.user_metadata?.avatar_url as string | undefined) ?? null,
  });

  if (error) throw error;
}

export async function updateProfile(
  userId: string,
  input: { fullName?: string; timezone?: string; avatarUrl?: string }
): Promise<Profile> {
  const payload: Record<string, unknown> = {};
  if (input.fullName !== undefined) payload.full_name = input.fullName;
  if (input.timezone !== undefined) payload.timezone = input.timezone;
  if (input.avatarUrl !== undefined) payload.avatar_url = input.avatarUrl;

  const { data, error } = await getSupabaseAdmin()
    .from('profiles')
    .update(payload)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return mapProfile(data);
}

export interface OrgMemberWithProfile extends OrgMember {
  profile: Profile | null;
}

export async function listOrgMembers(orgId: string): Promise<OrgMemberWithProfile[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('org_members')
    .select('id, org_id, user_id, role, status, joined_at, profiles(*)')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    orgId: row.org_id as string,
    userId: row.user_id as string,
    role: row.role as OrgRole,
    status: row.status as OrgMember['status'],
    joinedAt: (row.joined_at as string) ?? null,
    profile: row.profiles ? mapProfile(row.profiles as unknown as Record<string, unknown>) : null,
  }));
}

export async function updateOrganization(
  orgId: string,
  input: { name?: string; industry?: string; settings?: Record<string, unknown> }
): Promise<Organization> {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.industry !== undefined) payload.industry = input.industry;
  if (input.settings !== undefined) payload.settings = input.settings;

  const { data, error } = await getSupabaseAdmin()
    .from('organizations')
    .update(payload)
    .eq('id', orgId)
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    industry: data.industry ?? null,
    plan: data.plan,
    settings: data.settings ?? {},
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}
