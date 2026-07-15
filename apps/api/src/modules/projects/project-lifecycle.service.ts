/**
 * Enterprise project lifecycle: duplicate, restore, reset, hard-delete + impact counts.
 * Reset/delete run inside Postgres functions (transactions).
 */

import { randomUUID } from 'node:crypto';
import { AppError, type Project } from '@seo-os/shared';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import { getProjectById, mapWorkspaceRow, updateProject } from './project.service.js';

export type ProjectImpact = {
  workspaceId: string;
  totalRecords: number;
  categories: Record<string, number>;
  byTable: Record<string, number>;
};

function asImpact(raw: Record<string, unknown> | null): ProjectImpact {
  const categories = (raw?.categories ?? {}) as Record<string, number>;
  const byTable = (raw?.byTable ?? {}) as Record<string, number>;
  return {
    workspaceId: String(raw?.workspaceId ?? ''),
    totalRecords: Number(raw?.totalRecords ?? 0),
    categories,
    byTable,
  };
}

export async function restoreProject(projectId: string, orgId: string): Promise<Project> {
  const existing = await getProjectById(projectId, orgId);
  if (!existing) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Project not found');
  return updateProject(projectId, orgId, { status: 'active' });
}

export async function getProjectImpact(projectId: string, orgId: string): Promise<ProjectImpact> {
  const project = await getProjectById(projectId, orgId);
  if (!project) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Project not found');

  const { data, error } = await getSupabaseAdmin().rpc('seo_os_count_workspace_impact', {
    p_workspace_id: projectId,
  });
  if (error) {
    logger.warn({ error, projectId }, 'Impact RPC unavailable — falling back to sampled counts');
    return fallbackImpact(projectId);
  }
  return asImpact(data as Record<string, unknown>);
}

async function fallbackImpact(workspaceId: string): Promise<ProjectImpact> {
  const tables = [
    ['imported_urls', 'backlink_imports'],
    ['imported_urls', 'backlink_import_rows'],
    ['ai_analysis', 'backlink_domain_analyses'],
    ['ai_analysis', 'website_profiles'],
    ['opportunity_queue', 'opportunities'],
    ['content_packs', 'content_packs'],
    ['content_packs', 'media_asset_briefs'],
    ['image_assets', 'image_assets'],
    ['submission_queue', 'backlink_submissions'],
    ['browser_executions', 'execution_jobs'],
    ['browser_executions', 'browser_sessions'],
    ['verification_history', 'backlink_checks'],
    ['ai_learning', 'memory_entries'],
    ['campaigns', 'campaigns'],
  ] as const;

  const categories: Record<string, number> = {};
  const byTable: Record<string, number> = {};
  let total = 0;

  for (const [cat, table] of tables) {
    const { count } = await getSupabaseAdmin()
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId);
    const n = count ?? 0;
    byTable[table] = (byTable[table] ?? 0) + n;
    categories[cat] = (categories[cat] ?? 0) + n;
    total += n;
  }

  return { workspaceId, totalRecords: total, categories, byTable };
}

export async function resetProject(
  projectId: string,
  orgId: string,
  opts: { clearAiLearning?: boolean; confirm?: string } = {}
) {
  if (opts.confirm !== 'RESET') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Type RESET to confirm project reset');
  }
  const project = await getProjectById(projectId, orgId);
  if (!project) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Project not found');

  const { data, error } = await getSupabaseAdmin().rpc('seo_os_reset_workspace', {
    p_workspace_id: projectId,
    p_clear_ai_learning: Boolean(opts.clearAiLearning),
  });
  if (error) {
    logger.error({ error, projectId }, 'seo_os_reset_workspace failed');
    throw new AppError(500, 'INTERNAL_ERROR', `Project reset failed: ${error.message}`);
  }

  logger.info(
    { projectId, orgId, clearAiLearning: opts.clearAiLearning, result: data },
    'Project reset completed'
  );

  return {
    project,
    result: data as Record<string, unknown>,
  };
}

export async function deleteProject(
  projectId: string,
  orgId: string,
  opts: { confirm?: string } = {}
) {
  if (opts.confirm !== 'DELETE') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Type DELETE to confirm project deletion');
  }
  const project = await getProjectById(projectId, orgId);
  if (!project) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Project not found');

  const impact = await getProjectImpact(projectId, orgId);

  const { data, error } = await getSupabaseAdmin().rpc('seo_os_delete_workspace', {
    p_workspace_id: projectId,
  });
  if (error) {
    // Fallback: direct delete (relies on ON DELETE CASCADE)
    const { error: delErr } = await getSupabaseAdmin()
      .from('workspaces')
      .delete()
      .eq('id', projectId)
      .eq('org_id', orgId);
    if (delErr) {
      logger.error({ error: delErr, projectId }, 'Project hard delete failed');
      throw new AppError(500, 'INTERNAL_ERROR', `Project delete failed: ${delErr.message}`);
    }
    return {
      project,
      totalRecordsRemoved: impact.totalRecords + 1,
      impact,
      deletedWorkspace: true,
    };
  }

  logger.info({ projectId, orgId, result: data }, 'Project deleted');
  return {
    project,
    ...(data as Record<string, unknown>),
    impact,
  };
}

function duplicateDomain(domain: string): string {
  const clean = domain.replace(/^www\./i, '').toLowerCase();
  const parts = clean.split('.');
  if (parts.length >= 2) {
    const tld = parts.pop()!;
    const base = parts.join('.');
    return `${base}-copy.${tld}`;
  }
  return `${clean}-copy`;
}

export async function duplicateProject(
  projectId: string,
  orgId: string,
  userId: string,
  opts: { name?: string } = {}
): Promise<Project> {
  const source = await getProjectById(projectId, orgId);
  if (!source) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Project not found');

  const { data: sourceRow, error: srcErr } = await getSupabaseAdmin()
    .from('workspaces')
    .select('*')
    .eq('id', projectId)
    .eq('org_id', orgId)
    .single();
  if (srcErr || !sourceRow) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Project not found');

  let newDomain = duplicateDomain(source.domain);
  // Ensure uniqueness within org
  for (let i = 0; i < 8; i++) {
    const { data: clash } = await getSupabaseAdmin()
      .from('workspaces')
      .select('id')
      .eq('org_id', orgId)
      .eq('domain', newDomain)
      .maybeSingle();
    if (!clash) break;
    const clean = source.domain.replace(/^www\./i, '').toLowerCase();
    const parts = clean.split('.');
    const tld = parts.length >= 2 ? parts.pop()! : 'com';
    const base = parts.join('.') || clean;
    newDomain = `${base}-copy${i + 2}.${tld}`;
  }

  const newId = randomUUID();
  const insertPayload = {
    id: newId,
    org_id: orgId,
    name: (opts.name?.trim() || `${source.name} (Copy)`).slice(0, 100),
    domain: newDomain,
    url: source.url,
    industry: source.industry,
    description: source.description,
    target_audience: (sourceRow as Record<string, unknown>).target_audience ?? null,
    status: 'active',
    domain_verified: false,
    created_by: userId,
  };

  const { data: created, error: createErr } = await getSupabaseAdmin()
    .from('workspaces')
    .insert(insertPayload)
    .select('*')
    .single();
  if (createErr || !created) {
    throw new AppError(
      500,
      'INTERNAL_ERROR',
      `Failed to duplicate project: ${createErr?.message ?? 'unknown'}`
    );
  }

  // Settings (strip learning blobs)
  const { data: settings } = await getSupabaseAdmin()
    .from('workspace_settings')
    .select('*')
    .eq('workspace_id', projectId)
    .maybeSingle();
  if (settings) {
    const memory = { ...((settings.memory_config ?? {}) as Record<string, unknown>) };
    delete memory.classification_learning;
    delete memory.content_requirement_learning;
    delete memory.learning;
    delete memory.patterns;
    await getSupabaseAdmin().from('workspace_settings').insert({
      workspace_id: newId,
      brand_voice: settings.brand_voice ?? {},
      seo_goals: settings.seo_goals ?? {},
      outreach_defaults: settings.outreach_defaults ?? { approval_mode: 'always' },
      memory_config: memory,
      crawl_config: settings.crawl_config ?? { max_pages: 500 },
    });
  } else {
    await getSupabaseAdmin().from('workspace_settings').insert({ workspace_id: newId });
  }

  // AI settings
  const { data: ai } = await getSupabaseAdmin()
    .from('ai_settings')
    .select('*')
    .eq('workspace_id', projectId)
    .maybeSingle();
  if (ai) {
    await getSupabaseAdmin().from('ai_settings').insert({
      workspace_id: newId,
      primary_provider: ai.primary_provider,
      fallback_provider: ai.fallback_provider,
      temperature: ai.temperature,
      max_tokens: ai.max_tokens,
      feature_overrides: ai.feature_overrides ?? {},
    });
  }

  // Campaign templates
  const { data: templates } = await getSupabaseAdmin()
    .from('campaign_templates')
    .select('*')
    .eq('workspace_id', projectId);
  for (const t of templates ?? []) {
    await getSupabaseAdmin().from('campaign_templates').insert({
      workspace_id: newId,
      campaign_type: t.campaign_type,
      name: t.name,
      description: t.description,
      default_goals: t.default_goals ?? [],
      default_config: t.default_config ?? {},
      is_active: t.is_active ?? true,
    });
  }

  // Provider configs (workspace-scoped)
  const { data: providerConfigs } = await getSupabaseAdmin()
    .from('provider_configs')
    .select('*')
    .eq('workspace_id', projectId)
    .is('deleted_at', null);
  for (const pc of providerConfigs ?? []) {
    await getSupabaseAdmin().from('provider_configs').insert({
      org_id: orgId,
      workspace_id: newId,
      provider_key: pc.provider_key,
      enabled: pc.enabled,
      priority: pc.priority,
      endpoint: pc.endpoint,
      timeout_ms: pc.timeout_ms,
      retries: pc.retries,
      rate_limit_rpm: pc.rate_limit_rpm,
      fallback_provider_key: pc.fallback_provider_key,
      settings: pc.settings ?? {},
      created_by: userId,
    });
  }

  // Provider credentials (workspace-scoped)
  const { data: creds } = await getSupabaseAdmin()
    .from('provider_credentials')
    .select('*')
    .eq('workspace_id', projectId)
    .is('deleted_at', null);
  for (const c of creds ?? []) {
    await getSupabaseAdmin().from('provider_credentials').insert({
      org_id: orgId,
      workspace_id: newId,
      provider_key: c.provider_key,
      auth_mode: c.auth_mode,
      ciphertext: c.ciphertext,
      iv: c.iv,
      auth_tag: c.auth_tag,
      key_version: c.key_version,
      label: c.label,
      expires_at: c.expires_at,
      created_by: userId,
    });
  }

  // Image provider settings
  const { data: imgProviders } = await getSupabaseAdmin()
    .from('image_provider_settings')
    .select('*')
    .eq('workspace_id', projectId)
    .is('deleted_at', null);
  for (const ip of imgProviders ?? []) {
    await getSupabaseAdmin().from('image_provider_settings').insert({
      workspace_id: newId,
      provider_key: ip.provider_key,
      enabled: ip.enabled,
      is_default: ip.is_default,
      config: ip.config ?? {},
      health_status: 'unknown',
    });
  }

  // Integration connections (no sync/history)
  const { data: integrations } = await getSupabaseAdmin()
    .from('integration_connections')
    .select('*')
    .eq('workspace_id', projectId);
  for (const ic of integrations ?? []) {
    const { data: newConn } = await getSupabaseAdmin()
      .from('integration_connections')
      .insert({
        org_id: orgId,
        workspace_id: newId,
        provider_key: ic.provider_key,
        display_name: ic.display_name,
        status: ic.status,
        auth_type: ic.auth_type,
        scopes: ic.scopes ?? [],
        external_account_id: ic.external_account_id,
        external_account_label: ic.external_account_label,
        config: ic.config ?? {},
        metadata: ic.metadata ?? {},
        health_status: ic.health_status ?? 'unknown',
        connected_by: userId,
        connected_at: ic.connected_at,
      })
      .select('id')
      .single();

    if (newConn?.id) {
      const { data: intCreds } = await getSupabaseAdmin()
        .from('integration_credentials')
        .select('ciphertext, iv, auth_tag, key_version, expires_at, rotated_at')
        .eq('connection_id', ic.id);
      for (const cred of intCreds ?? []) {
        await getSupabaseAdmin().from('integration_credentials').insert({
          connection_id: newConn.id,
          ciphertext: cred.ciphertext,
          iv: cred.iv,
          auth_tag: cred.auth_tag,
          key_version: cred.key_version,
          expires_at: cred.expires_at,
          rotated_at: cred.rotated_at,
        });
      }
    }
  }

  logger.info(
    { sourceProjectId: projectId, newProjectId: newId, orgId, userId },
    'Project duplicated'
  );

  return mapWorkspaceRow(created as Record<string, unknown>);
}

