import type { Project, UpdateProjectInput } from '@seo-os/shared';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import { ensureProfile } from '../organizations/member.service.js';

function mapWorkspace(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    name: row.name as string,
    domain: row.domain as string,
    url: (row.url as string) ?? null,
    industry: (row.industry as string) ?? null,
    description: (row.description as string) ?? null,
    status: row.status as Project['status'],
    domainVerified: row.domain_verified as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listProjectsByOrg(orgId: string): Promise<Project[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('workspaces')
    .select('*')
    .eq('org_id', orgId)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapWorkspace);
}

export async function getProjectById(projectId: string, orgId: string): Promise<Project | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('workspaces')
    .select('*')
    .eq('id', projectId)
    .eq('org_id', orgId)
    .single();

  if (error) return null;
  return mapWorkspace(data);
}

export async function createProject(
  orgId: string,
  userId: string,
  input: { name: string; domain: string; url?: string; industry?: string; description?: string }
): Promise<Project> {
  await ensureProfile(userId);

  const insertPayload = {
    org_id: orgId,
    name: input.name.trim(),
    domain: input.domain.trim().toLowerCase(),
    url: input.url ?? null,
    industry: input.industry ?? null,
    description: input.description ?? null,
    created_by: userId,
  };

  logger.info(
    { orgId, userId, insertPayload, action: 'create_project' },
    'Creating workspace (project)'
  );

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
  if (input.status !== undefined) payload.status = input.status;

  const { data, error } = await getSupabaseAdmin()
    .from('workspaces')
    .update(payload)
    .eq('id', projectId)
    .eq('org_id', orgId)
    .select()
    .single();

  if (error) throw error;
  return mapWorkspace(data);
}

export async function archiveProject(projectId: string, orgId: string): Promise<Project> {
  return updateProject(projectId, orgId, { status: 'archived' });
}
