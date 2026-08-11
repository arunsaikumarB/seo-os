import type { Project, UpdateProjectInput } from '@seo-os/shared';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import { isPgDataMode } from '../../lib/data-mode.js';
import { pgOne, pgMany, pgQuery, withPgTransaction } from '../../lib/pg.js';
import { ensureProfile } from '../organizations/member.service.js';

export function mapWorkspaceRow(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    name: row.name as string,
    domain: row.domain as string,
    url: (row.url as string) ?? null,
    industry: (row.industry as string) ?? null,
    description: (row.description as string) ?? null,
    contactEmail: (row.contact_email as string) ?? null,
    contactName: (row.contact_name as string) ?? null,
    contactPhone: (row.contact_phone as string) ?? null,
    companyName: (row.company_name as string) ?? null,
    brandProfile:
      row.brand_profile && typeof row.brand_profile === 'object'
        ? (row.brand_profile as Record<string, unknown>)
        : null,
    status: row.status as Project['status'],
    domainVerified: row.domain_verified as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** @deprecated prefer mapWorkspaceRow */
function mapWorkspace(row: Record<string, unknown>): Project {
  return mapWorkspaceRow(row);
}

export async function listProjectsByOrg(
  orgId: string,
  opts: { includeArchived?: boolean } = {}
): Promise<Project[]> {
  if (isPgDataMode()) {
    const rows = opts.includeArchived
      ? await pgMany<Record<string, unknown>>(
          `SELECT * FROM public.workspaces WHERE org_id = $1 ORDER BY updated_at DESC`,
          [orgId]
        )
      : await pgMany<Record<string, unknown>>(
          `SELECT * FROM public.workspaces
           WHERE org_id = $1 AND status IS DISTINCT FROM 'archived'
           ORDER BY updated_at DESC`,
          [orgId]
        );
    return rows.map(mapWorkspace);
  }

  let q = getSupabaseAdmin()
    .from('workspaces')
    .select('*')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false });
  if (!opts.includeArchived) {
    q = q.neq('status', 'archived');
  }
  const { data, error } = await q;

  if (error) throw error;
  return (data ?? []).map(mapWorkspace);
}

export async function getProjectById(projectId: string, orgId: string): Promise<Project | null> {
  if (isPgDataMode()) {
    const row = await pgOne<Record<string, unknown>>(
      `SELECT * FROM public.workspaces WHERE id = $1 AND org_id = $2`,
      [projectId, orgId]
    );
    return row ? mapWorkspace(row) : null;
  }

  const { data, error } = await getSupabaseAdmin()
    .from('workspaces')
    .select('*')
    .eq('id', projectId)
    .eq('org_id', orgId)
    .single();

  if (error) return null;
  return mapWorkspace(data);
}

/** Load workspace/project by id alone (content generation brand injection). */
export async function getProjectByWorkspaceId(projectId: string): Promise<Project | null> {
  if (isPgDataMode()) {
    const row = await pgOne<Record<string, unknown>>(
      `SELECT * FROM public.workspaces WHERE id = $1`,
      [projectId]
    );
    return row ? mapWorkspace(row) : null;
  }

  const { data, error } = await getSupabaseAdmin()
    .from('workspaces')
    .select('*')
    .eq('id', projectId)
    .maybeSingle();
  if (error || !data) return null;
  return mapWorkspace(data);
}

type ProjectProfileInput = {
  name: string;
  domain: string;
  url?: string;
  industry?: string;
  description?: string;
  contactEmail?: string;
  contactName?: string;
  contactPhone?: string;
  companyName?: string;
};

export async function createProject(
  orgId: string,
  userId: string,
  input: ProjectProfileInput
): Promise<Project> {
  await ensureProfile(userId);

  const insertPayload = {
    org_id: orgId,
    name: input.name.trim(),
    domain: input.domain.trim().toLowerCase(),
    url: input.url ?? null,
    industry: input.industry ?? null,
    description: input.description ?? null,
    contact_email: input.contactEmail ?? null,
    contact_name: input.contactName ?? null,
    contact_phone: input.contactPhone ?? null,
    company_name: input.companyName ?? input.name.trim(),
    brand_profile: {},
    created_by: userId,
  };

  logger.info(
    { orgId, userId, insertPayload, action: 'create_project' },
    'Creating workspace (project)'
  );

  if (isPgDataMode()) {
    const data = await withPgTransaction(async (client) => {
      const ws = await client.query<Record<string, unknown>>(
        `INSERT INTO public.workspaces (
           org_id, name, domain, url, industry, description,
           contact_email, contact_name, contact_phone, company_name,
           brand_profile, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'{}'::jsonb,$11)
         RETURNING *`,
        [
          insertPayload.org_id,
          insertPayload.name,
          insertPayload.domain,
          insertPayload.url,
          insertPayload.industry,
          insertPayload.description,
          insertPayload.contact_email,
          insertPayload.contact_name,
          insertPayload.contact_phone,
          insertPayload.company_name,
          insertPayload.created_by,
        ]
      );
      const row = ws.rows[0];
      if (!row) throw new Error('Workspace insert failed');
      await client.query(
        `INSERT INTO public.workspace_settings (workspace_id) VALUES ($1)
         ON CONFLICT (workspace_id) DO NOTHING`,
        [row.id]
      );
      return row;
    });

    logger.info({ orgId, userId, projectId: data.id }, 'Workspace created');
    void refreshBrandProfile(String(data.id)).catch((err) =>
      logger.warn({ err, workspaceId: data.id }, 'brand profile crawl failed on create')
    );
    return mapWorkspace(data);
  }

  const { data, error } = await getSupabaseAdmin()
    .from('workspaces')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    logger.error(
      { orgId, userId, insertPayload, supabaseError: error },
      'Workspace insert failed'
    );
    throw error;
  }

  const { error: settingsError } = await getSupabaseAdmin().from('workspace_settings').insert({
    workspace_id: data.id,
  });

  if (settingsError) {
    logger.error(
      { workspaceId: data.id, orgId, userId, supabaseError: settingsError },
      'Workspace settings insert failed'
    );
    throw settingsError;
  }

  logger.info({ orgId, userId, projectId: data.id }, 'Workspace created');

  // Phase 9 — crawl homepage and ground brand_profile (fire-and-forget)
  void refreshBrandProfile(String(data.id)).catch((err) =>
    logger.warn({ err, workspaceId: data.id }, 'brand profile crawl failed on create')
  );

  return mapWorkspace(data);
}

export async function updateProject(
  projectId: string,
  orgId: string,
  input: UpdateProjectInput
): Promise<Project> {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.domain !== undefined) payload.domain = input.domain.toLowerCase();
  if (input.url !== undefined) payload.url = input.url;
  if (input.industry !== undefined) payload.industry = input.industry;
  if (input.description !== undefined) payload.description = input.description;
  if (input.contactEmail !== undefined) payload.contact_email = input.contactEmail;
  if (input.contactName !== undefined) payload.contact_name = input.contactName;
  if (input.contactPhone !== undefined) payload.contact_phone = input.contactPhone;
  if (input.companyName !== undefined) payload.company_name = input.companyName;
  if (input.status !== undefined) payload.status = input.status;

  if (isPgDataMode()) {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(payload)) {
      sets.push(`${k} = $${i++}`);
      vals.push(v);
    }
    sets.push('updated_at = now()');
    vals.push(projectId, orgId);
    const row = await pgOne<Record<string, unknown>>(
      `UPDATE public.workspaces SET ${sets.join(', ')}
       WHERE id = $${i++} AND org_id = $${i}
       RETURNING *`,
      vals
    );
    if (!row) throw new Error('Project not found');
    if (input.url !== undefined || input.domain !== undefined) {
      void refreshBrandProfile(projectId).catch((err) =>
        logger.warn({ err, workspaceId: projectId }, 'brand profile crawl failed on update')
      );
    }
    return mapWorkspace(row);
  }

  const { data, error } = await getSupabaseAdmin()
    .from('workspaces')
    .update(payload)
    .eq('id', projectId)
    .eq('org_id', orgId)
    .select()
    .single();

  if (error) throw error;

  // Re-crawl when URL/domain changes
  if (input.url !== undefined || input.domain !== undefined) {
    void refreshBrandProfile(projectId).catch((err) =>
      logger.warn({ err, workspaceId: projectId }, 'brand profile crawl failed on update')
    );
  }

  return mapWorkspace(data);
}

export async function archiveProject(projectId: string, orgId: string): Promise<Project> {
  return updateProject(projectId, orgId, { status: 'archived' });
}

/**
 * Fetch the project homepage and store a grounded brand_profile.
 * Uses seo-intelligence buildBrandProfile — no invented features.
 */
export async function refreshBrandProfile(workspaceId: string): Promise<Record<string, unknown> | null> {
  const ws = isPgDataMode()
    ? await pgOne<Record<string, unknown>>(
        `SELECT id, name, domain, url, industry FROM public.workspaces WHERE id = $1`,
        [workspaceId]
      )
    : (
        await getSupabaseAdmin()
          .from('workspaces')
          .select('id, name, domain, url, industry')
          .eq('id', workspaceId)
          .maybeSingle()
      ).data;
  if (!ws) return null;

  const target =
    (ws.url as string | null) ||
    (ws.domain ? `https://${String(ws.domain).replace(/^https?:\/\//i, '')}` : null);
  if (!target) return null;

  try {
    const res = await fetch(target, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; BacklinkAgent-BrandProfile/1.0; +https://seoos.io)',
        Accept: 'text/html',
      },
    });
    if (!res.ok) {
      logger.warn({ workspaceId, status: res.status, target }, 'brand profile fetch non-OK');
      return null;
    }
    const html = (await res.text()).slice(0, 400_000);
    const { extractMetadataFromHtml, buildBrandProfile } = await import(
      '@seo-os/seo-intelligence'
    );
    const meta = extractMetadataFromHtml(target, html);
    const profile = buildBrandProfile(meta, html);

    // Extract a few feature-like list items / bold phrases (bounded)
    const features: string[] = [];
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let m: RegExpExecArray | null;
    while ((m = liRe.exec(html)) && features.length < 8) {
      const t = m[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (t.length >= 12 && t.length <= 140) features.push(t);
    }

    const brandProfile = {
      ...profile,
      crawledAt: new Date().toISOString(),
      sourceUrl: target,
      keyFeatures: features.slice(0, 6),
      industry: ws.industry ?? null,
      projectName: ws.name,
    };

    if (isPgDataMode()) {
      await pgQuery(
        `UPDATE public.workspaces
         SET brand_profile = $2::jsonb, updated_at = now()
         WHERE id = $1`,
        [workspaceId, JSON.stringify(brandProfile)]
      );
    } else {
      await getSupabaseAdmin()
        .from('workspaces')
        .update({ brand_profile: brandProfile, updated_at: new Date().toISOString() })
        .eq('id', workspaceId);
    }

    logger.info({ workspaceId, target, topics: profile.primaryTopics?.length }, 'brand profile saved');
    return brandProfile;
  } catch (err) {
    logger.warn({ err, workspaceId, target }, 'brand profile crawl error');
    return null;
  }
}
