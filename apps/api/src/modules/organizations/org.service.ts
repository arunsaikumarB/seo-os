import type { Organization } from '@seo-os/shared';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import { isPgDataMode } from '../../lib/data-mode.js';
import { pgMany, pgOne, withPgTransaction } from '../../lib/pg.js';
import { ensureProfile } from './member.service.js';

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
  await ensureProfile(userId);

  if (isPgDataMode()) {
    return withPgTransaction(async (client) => {
      const orgRes = await client.query<Record<string, unknown>>(
        `INSERT INTO public.organizations (name, slug, industry)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [input.name, input.slug, input.industry ?? null]
      );
      const org = orgRes.rows[0];
      if (!org) throw new Error('Organization insert failed');

      await client.query(
        `INSERT INTO public.org_members (org_id, user_id, role, status, joined_at)
         VALUES ($1, $2, 'owner', 'active', now())`,
        [org.id, userId]
      );

      return mapOrg(org);
    });
  }

  const { data: org, error: orgError } = await getSupabaseAdmin()
    .from('organizations')
    .insert({
      name: input.name,
      slug: input.slug,
      industry: input.industry ?? null,
    })
    .select()
    .single();

  if (orgError) {
    logger.error({ userId, input, supabaseError: orgError }, 'Organization insert failed');
    throw orgError;
  }

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
  if (isPgDataMode()) {
    const row = await pgOne<Record<string, unknown>>(
      `SELECT * FROM public.organizations WHERE id = $1`,
      [orgId]
    );
    return row ? mapOrg(row) : null;
  }

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
  if (isPgDataMode()) {
    const rows = await pgMany<Record<string, unknown>>(
      `SELECT o.*, m.role AS member_role
       FROM public.org_members m
       JOIN public.organizations o ON o.id = m.org_id
       WHERE m.user_id = $1 AND m.status = 'active'`,
      [userId]
    );
    return rows.map((row) => ({ ...mapOrg(row), role: row.member_role as string }));
  }

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
