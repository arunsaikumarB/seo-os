import type { Organization, OrgMember, OrgRole, Profile } from '@seo-os/shared';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { isPgDataMode } from '../../lib/data-mode.js';
import { pgMany, pgOne, pgQuery } from '../../lib/pg.js';

function mapProfile(row: Record<string, unknown>): Profile {
  return {
    id: row.id as string,
    fullName: (row.full_name as string) ?? null,
    avatarUrl: (row.avatar_url as string) ?? null,
    timezone: (row.timezone as string) ?? 'UTC',
    preferences: (row.preferences as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
  };
}

export async function getProfile(userId: string): Promise<Profile | null> {
  if (isPgDataMode()) {
    const row = await pgOne<Record<string, unknown>>(
      `SELECT id, full_name, avatar_url, timezone, preferences, created_at
       FROM public.profiles WHERE id = $1`,
      [userId]
    );
    return row ? mapProfile(row) : null;
  }

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
  if (isPgDataMode()) {
    const existing = await pgOne<{ id: string }>(
      `SELECT id FROM public.profiles WHERE id = $1`,
      [userId]
    );
    if (existing) return;

    const local = await pgOne<{ full_name: string | null; email: string }>(
      `SELECT full_name, email FROM public.local_auth_users WHERE id = $1`,
      [userId]
    );
    const authMeta = await pgOne<{ full_name: string | null; email: string | null }>(
      `SELECT
         COALESCE(raw_user_meta_data->>'full_name', email) AS full_name,
         email
       FROM auth.users WHERE id = $1`,
      [userId]
    );
    const fullName = local?.full_name ?? authMeta?.full_name ?? authMeta?.email ?? local?.email ?? 'User';

    await pgQuery(
      `INSERT INTO public.profiles (id, full_name)
       VALUES ($1, $2)
       ON CONFLICT (id) DO NOTHING`,
      [userId, fullName]
    );
    return;
  }

  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle();
  if (existing) return;

  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
  if (authError) throw authError;

  const user = authData.user;
  const { error } = await supabase.from('profiles').insert({
    id: userId,
    full_name:
      (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? 'User',
    avatar_url: (user?.user_metadata?.avatar_url as string | undefined) ?? null,
  });

  if (error) throw error;
}

export async function updateProfile(
  userId: string,
  input: { fullName?: string; timezone?: string; avatarUrl?: string }
): Promise<Profile> {
  if (isPgDataMode()) {
    const row = await pgOne<Record<string, unknown>>(
      `UPDATE public.profiles SET
         full_name = COALESCE($2, full_name),
         timezone = COALESCE($3, timezone),
         avatar_url = COALESCE($4, avatar_url)
       WHERE id = $1
       RETURNING id, full_name, avatar_url, timezone, preferences, created_at`,
      [userId, input.fullName ?? null, input.timezone ?? null, input.avatarUrl ?? null]
    );
    if (!row) throw new Error('Profile not found');
    return mapProfile(row);
  }

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
  if (isPgDataMode()) {
    const rows = await pgMany<Record<string, unknown>>(
      `SELECT
         m.id, m.org_id, m.user_id, m.role, m.status, m.joined_at,
         p.id AS profile_id, p.full_name, p.avatar_url, p.timezone, p.preferences, p.created_at AS profile_created_at
       FROM public.org_members m
       LEFT JOIN public.profiles p ON p.id = m.user_id
       WHERE m.org_id = $1 AND m.status = 'active'
       ORDER BY m.joined_at ASC NULLS LAST`,
      [orgId]
    );
    return rows.map((row) => ({
      id: row.id as string,
      orgId: row.org_id as string,
      userId: row.user_id as string,
      role: row.role as OrgRole,
      status: row.status as OrgMember['status'],
      joinedAt: (row.joined_at as string) ?? null,
      profile: row.profile_id
        ? mapProfile({
            id: row.profile_id,
            full_name: row.full_name,
            avatar_url: row.avatar_url,
            timezone: row.timezone,
            preferences: row.preferences,
            created_at: row.profile_created_at,
          })
        : null,
    }));
  }

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
  if (isPgDataMode()) {
    const row = await pgOne<Record<string, unknown>>(
      `UPDATE public.organizations SET
         name = COALESCE($2, name),
         industry = COALESCE($3, industry),
         settings = COALESCE($4::jsonb, settings),
         updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        orgId,
        input.name ?? null,
        input.industry ?? null,
        input.settings !== undefined ? JSON.stringify(input.settings) : null,
      ]
    );
    if (!row) throw new Error('Organization not found');
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

/** Active membership lookup (auth middleware + tenancy). */
export async function getActiveOrgMembership(
  orgId: string,
  userId: string
): Promise<{ role: string; status: string } | null> {
  if (isPgDataMode()) {
    return pgOne<{ role: string; status: string }>(
      `SELECT role, status FROM public.org_members
       WHERE org_id = $1 AND user_id = $2 AND status = 'active'
       LIMIT 1`,
      [orgId, userId]
    );
  }

  const { data, error } = await getSupabaseAdmin()
    .from('org_members')
    .select('role, status')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .single();

  if (error || !data || data.status !== 'active') return null;
  return { role: data.role as string, status: data.status as string };
}
