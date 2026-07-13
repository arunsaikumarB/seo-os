import {
  PROVIDER_CATALOG,
  decryptJson,
  encryptJson,
  getIntegrationProvider,
  type IntegrationProviderKey,
  type SyncMode,
} from '@seo-os/integrations';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';
import { logger } from '../../lib/logger.js';
import { getEnv } from '../../config/env.js';
import { fireAndForget, publishPlatformEvent } from '../platform/event-bus.service.js';

async function resolveOrgId(workspaceId: string): Promise<string> {
  const { data, error } = await getSupabaseAdmin()
    .from('workspaces')
    .select('org_id')
    .eq('id', workspaceId)
    .single();
  if (error || !data?.org_id) throw new Error('Workspace org not found');
  return String(data.org_id);
}

function encryptionKey() {
  return getEnv().ENCRYPTION_KEY;
}

async function storeCredentials(connectionId: string, credentials: Record<string, unknown>) {
  const enc = encryptJson(credentials, encryptionKey());
  const { error } = await getSupabaseAdmin().from('integration_credentials').upsert(
    {
      connection_id: connectionId,
      ciphertext: enc.ciphertext,
      iv: enc.iv,
      auth_tag: enc.authTag,
      key_version: enc.keyVersion,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'connection_id' }
  );
  if (error) throw error;
}

async function loadCredentials(connectionId: string): Promise<Record<string, unknown>> {
  const { data, error } = await getSupabaseAdmin()
    .from('integration_credentials')
    .select('ciphertext, iv, auth_tag')
    .eq('connection_id', connectionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return {};
  return decryptJson(
    { ciphertext: data.ciphertext, iv: data.iv, authTag: data.auth_tag },
    encryptionKey()
  );
}

export function listProviderCatalog() {
  return PROVIDER_CATALOG;
}

export async function getIntegrationsSummary(workspaceId: string) {
  const orgId = await resolveOrgId(workspaceId);
  const [connections, jobs] = await Promise.all([
    getSupabaseAdmin()
      .from('integration_connections')
      .select('*')
      .eq('org_id', orgId)
      .order('updated_at', { ascending: false }),
    getSupabaseAdmin()
      .from('integration_sync_jobs')
      .select('id, status, mode, created_at, completed_at, error, connection_id')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(40),
  ]);

  const rows = connections.data ?? [];
  const jobRows = jobs.data ?? [];
  const connected = rows.filter((c) => c.status === 'connected');
  const failedSyncs = jobRows.filter((j) => j.status === 'failed').length;
  const queue = jobRows.filter((j) => ['queued', 'running'].includes(String(j.status))).length;
  const lastSync = connected
    .map((c) => c.last_sync_at)
    .filter(Boolean)
    .sort()
    .reverse()[0] as string | undefined;

  const healthy = connected.filter((c) => c.health_status === 'healthy').length;
  const degraded = connected.filter((c) => c.health_status === 'degraded').length;
  const down = connected.filter((c) => c.health_status === 'down' || c.status === 'error').length;

  return {
    connectedCount: connected.length,
    availableCount: PROVIDER_CATALOG.length,
    syncQueue: queue,
    lastSyncAt: lastSync ?? null,
    failedSyncs,
    apiHealth: {
      healthy,
      degraded,
      down,
      status: down > 0 ? 'down' : degraded > 0 ? 'degraded' : connected.length ? 'healthy' : 'unknown',
    },
    connections: rows.slice(0, 12),
    recentJobs: jobRows.slice(0, 10),
    providers: PROVIDER_CATALOG,
  };
}

export async function listConnections(workspaceId: string) {
  const orgId = await resolveOrgId(workspaceId);
  const { data, error } = await getSupabaseAdmin()
    .from('integration_connections')
    .select(
      'id, provider_key, display_name, status, auth_type, scopes, external_account_label, last_sync_at, health_status, health_message, error_message, connected_at, config, metadata, workspace_id, updated_at'
    )
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listSyncHistory(workspaceId: string, connectionId?: string) {
  const orgId = await resolveOrgId(workspaceId);
  let q = getSupabaseAdmin()
    .from('integration_sync_jobs')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (connectionId) q = q.eq('connection_id', connectionId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function listUsage(workspaceId: string) {
  const orgId = await resolveOrgId(workspaceId);
  const { data: connections } = await getSupabaseAdmin()
    .from('integration_connections')
    .select('id')
    .eq('org_id', orgId);
  const ids = (connections ?? []).map((c) => c.id);
  if (!ids.length) return [];
  const { data, error } = await getSupabaseAdmin()
    .from('integration_usage')
    .select('*')
    .in('connection_id', ids)
    .order('period_start', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

export async function connectProvider(
  workspaceId: string,
  userId: string,
  input: {
    providerKey: IntegrationProviderKey;
    displayName?: string;
    credentials?: Record<string, unknown>;
    config?: Record<string, unknown>;
    scopes?: string[];
  }
) {
  const orgId = await resolveOrgId(workspaceId);
  const catalog = PROVIDER_CATALOG.find((p) => p.key === input.providerKey);
  if (!catalog) throw new Error('Unknown provider');

  if (input.providerKey === 'gmail' || input.providerKey === 'outlook') {
    const creds = input.credentials ?? {};
    const hasOAuth =
      Boolean(creds.accessToken) ||
      Boolean(creds.refreshToken) ||
      (Boolean(creds.oauthCode) && String(creds.oauthCode) !== 'demo-connect');
    if (!hasOAuth) {
      throw Object.assign(
        new Error(
          `OAuth credentials required (V1.1) for ${catalog.name}. SMTP remains the live send path if configured.`
        ),
        { status: 400, code: 'OAUTH_REQUIRED_V1_1' }
      );
    }
  }

  const provider = getIntegrationProvider(input.providerKey);
  const result = await provider.connect({
    orgId,
    workspaceId,
    displayName: input.displayName ?? catalog.name,
    credentials: input.credentials ?? {},
    config: input.config ?? {},
    scopes: input.scopes ?? catalog.scopes,
  });

  const { data: connection, error } = await getSupabaseAdmin()
    .from('integration_connections')
    .insert({
      org_id: orgId,
      workspace_id: workspaceId,
      provider_key: input.providerKey,
      display_name: input.displayName ?? catalog.name,
      status: 'connected',
      auth_type: catalog.authType,
      scopes: result.scopes,
      external_account_id: result.externalAccountId ?? null,
      external_account_label: result.externalAccountLabel ?? null,
      config: { ...result.config, scopes: result.scopes },
      metadata: { capabilities: catalog.capabilities },
      health_status: 'healthy',
      health_message: 'Connected',
      last_health_at: new Date().toISOString(),
      connected_by: userId,
      connected_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error) throw error;

  await storeCredentials(connection.id, result.credentials);

  fireAndForget(
    publishPlatformEvent({
      workspaceId,
      orgId,
      sourceModule: 'integrations',
      eventType: 'integration_connected',
      title: `${catalog.name} connected`,
      severity: 'success',
      entityType: 'integration_connection',
      entityId: connection.id,
      actorId: userId,
      audit: {
        action: 'integration.connect',
        resourceType: 'integration_connection',
        resourceId: connection.id,
        after: { provider: input.providerKey, status: 'connected' },
      },
    })
  );

  return sanitizeConnection(connection);
}

export async function disconnectProvider(workspaceId: string, connectionId: string, userId: string) {
  const orgId = await resolveOrgId(workspaceId);
  const { data: connection } = await getSupabaseAdmin()
    .from('integration_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (!connection) throw new Error('Connection not found');

  const provider = getIntegrationProvider(connection.provider_key as IntegrationProviderKey);
  await provider.disconnect(connectionId).catch(() => undefined);

  await getSupabaseAdmin().from('integration_credentials').delete().eq('connection_id', connectionId);
  const { data, error } = await getSupabaseAdmin()
    .from('integration_connections')
    .update({
      status: 'disconnected',
      health_status: 'unknown',
      disconnected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('id', connectionId)
    .select('*')
    .single();
  if (error) throw error;

  fireAndForget(
    publishPlatformEvent({
      workspaceId,
      orgId,
      sourceModule: 'integrations',
      eventType: 'integration_disconnected',
      title: `${connection.display_name} disconnected`,
      severity: 'info',
      entityType: 'integration_connection',
      entityId: connectionId,
      actorId: userId,
      audit: {
        action: 'integration.disconnect',
        resourceType: 'integration_connection',
        resourceId: connectionId,
      },
    })
  );

  return sanitizeConnection(data);
}

export async function healthCheckConnection(workspaceId: string, connectionId: string) {
  const ctx = await buildProviderContext(workspaceId, connectionId);
  const provider = getIntegrationProvider(ctx.providerKey);
  const result = await provider.healthCheck(ctx);
  const { data, error } = await getSupabaseAdmin()
    .from('integration_connections')
    .update({
      health_status: result.status,
      health_message: result.message ?? null,
      last_health_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId)
    .select('*')
    .single();
  if (error) throw error;
  return { connection: sanitizeConnection(data), health: result };
}

export async function refreshConnectionToken(workspaceId: string, connectionId: string) {
  const ctx = await buildProviderContext(workspaceId, connectionId);
  const provider = getIntegrationProvider(ctx.providerKey);
  const refreshed = await provider.refreshToken(ctx);
  await storeCredentials(connectionId, refreshed.credentials);
  if (refreshed.expiresAt) {
    await getSupabaseAdmin()
      .from('integration_credentials')
      .update({ expires_at: refreshed.expiresAt, rotated_at: new Date().toISOString() })
      .eq('connection_id', connectionId);
  }
  fireAndForget(
    publishPlatformEvent({
      workspaceId,
      orgId: ctx.orgId,
      sourceModule: 'integrations',
      eventType: 'integration_token_refreshed',
      title: 'Integration token refreshed',
      entityType: 'integration_connection',
      entityId: connectionId,
      audit: { action: 'integration.token_refresh', resourceType: 'integration_connection', resourceId: connectionId },
    })
  );
  return { ok: true, expiresAt: refreshed.expiresAt ?? null };
}

export async function queueSync(
  workspaceId: string,
  connectionId: string,
  mode: SyncMode = 'manual'
) {
  const orgId = await resolveOrgId(workspaceId);
  const { data: connection } = await getSupabaseAdmin()
    .from('integration_connections')
    .select('id, status')
    .eq('id', connectionId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (!connection || connection.status !== 'connected') {
    throw new Error('Connection must be connected to sync');
  }

  const { data: job, error } = await getSupabaseAdmin()
    .from('integration_sync_jobs')
    .insert({
      connection_id: connectionId,
      org_id: orgId,
      workspace_id: workspaceId,
      mode,
      status: 'queued',
      progress: 0,
    })
    .select('*')
    .single();
  if (error) throw error;

  const jobId = await enqueueJob(QUEUES.LOW, 'integration.sync', {
    type: 'integration_sync',
    syncJobId: job.id,
    connectionId,
    workspaceId,
  });
  if (!jobId) {
    return runSyncJob(job.id);
  }
  return job;
}

export async function runSyncJob(syncJobId: string) {
  const { data: job } = await getSupabaseAdmin()
    .from('integration_sync_jobs')
    .select('*')
    .eq('id', syncJobId)
    .maybeSingle();
  if (!job) throw new Error('Sync job not found');

  const attempt = Number(job.attempt ?? 0) + 1;
  await getSupabaseAdmin()
    .from('integration_sync_jobs')
    .update({
      status: 'running',
      progress: 10,
      attempt,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', syncJobId);

  await appendSyncLog(syncJobId, job.connection_id, 'info', `Sync started (attempt ${attempt})`);

  try {
    const workspaceId = String(job.workspace_id ?? '');
    const ctx = await buildProviderContext(workspaceId, job.connection_id, job.cursor ?? {});
    const provider = getIntegrationProvider(ctx.providerKey);

    // Token refresh when near expiry pattern (always refresh stub for scheduled)
    if (job.mode === 'scheduled' || attempt > 1) {
      const refreshed = await provider.refreshToken(ctx);
      await storeCredentials(job.connection_id, refreshed.credentials);
      ctx.credentials = refreshed.credentials;
      await appendSyncLog(syncJobId, job.connection_id, 'info', 'Token refreshed before sync');
    }

    await getSupabaseAdmin()
      .from('integration_sync_jobs')
      .update({ progress: 40 })
      .eq('id', syncJobId);

    const result = await provider.sync(ctx, job.mode as SyncMode);

    if (result.conflicts?.length) {
      await getSupabaseAdmin()
        .from('integration_sync_jobs')
        .update({
          status: 'conflict',
          progress: 100,
          result,
          error: result.conflicts.map((c) => c.detail).join('; '),
          completed_at: new Date().toISOString(),
        })
        .eq('id', syncJobId);
      await appendSyncLog(syncJobId, job.connection_id, 'warn', 'Conflicts detected', {
        conflicts: result.conflicts,
      });
      return result;
    }

    for (const snap of result.snapshots) {
      await getSupabaseAdmin().from('integration_snapshots').insert({
        connection_id: job.connection_id,
        org_id: job.org_id,
        workspace_id: job.workspace_id,
        provider_key: ctx.providerKey,
        snapshot_type: snap.type,
        payload: snap.payload,
      });
    }

    if (result.usage?.length) {
      const day = new Date().toISOString().slice(0, 10);
      for (const u of result.usage) {
        await getSupabaseAdmin().from('integration_usage').upsert(
          {
            connection_id: job.connection_id,
            org_id: job.org_id,
            metric_key: u.key,
            metric_value: u.value,
            period_start: day,
            metadata: u.metadata ?? {},
          },
          { onConflict: 'connection_id,metric_key,period_start' }
        );
      }
    }

    await getSupabaseAdmin()
      .from('integration_connections')
      .update({
        last_sync_at: new Date().toISOString(),
        health_status: 'healthy',
        health_message: 'Last sync succeeded',
        updated_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', job.connection_id);

    const { data: completed } = await getSupabaseAdmin()
      .from('integration_sync_jobs')
      .update({
        status: 'completed',
        progress: 100,
        result: {
          recordsUpserted: result.recordsUpserted,
          snapshotTypes: result.snapshots.map((s) => s.type),
        },
        cursor: result.cursor ?? {},
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', syncJobId)
      .select('*')
      .single();

    await appendSyncLog(syncJobId, job.connection_id, 'info', 'Sync completed', {
      recordsUpserted: result.recordsUpserted,
    });

    fireAndForget(
      publishPlatformEvent({
        workspaceId: workspaceId || undefined,
        orgId: job.org_id,
        sourceModule: 'integrations',
        eventType: 'integration_sync_completed',
        title: `Integration sync completed`,
        severity: 'success',
        entityType: 'integration_sync_job',
        entityId: syncJobId,
      })
    );

    return completed;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    logger.error({ err, syncJobId }, 'integration sync failed');
    const maxAttempts = Number(job.max_attempts ?? 3);
    const shouldRetry = attempt < maxAttempts;

    await getSupabaseAdmin()
      .from('integration_sync_jobs')
      .update({
        status: shouldRetry ? 'queued' : 'failed',
        progress: shouldRetry ? 0 : 100,
        error: message,
        updated_at: new Date().toISOString(),
        completed_at: shouldRetry ? null : new Date().toISOString(),
      })
      .eq('id', syncJobId);

    await getSupabaseAdmin()
      .from('integration_connections')
      .update({
        health_status: 'degraded',
        health_message: message,
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.connection_id);

    await appendSyncLog(syncJobId, job.connection_id, 'error', message);

    if (shouldRetry) {
      await enqueueJob(
        QUEUES.LOW,
        'integration.sync',
        {
          type: 'integration_sync',
          syncJobId,
          connectionId: job.connection_id,
          workspaceId: job.workspace_id,
        },
        { startAfter: Math.min(60, attempt * 15) }
      );
      await appendSyncLog(syncJobId, job.connection_id, 'info', `Retry scheduled (attempt ${attempt + 1})`);
    } else {
      fireAndForget(
        publishPlatformEvent({
          workspaceId: job.workspace_id ?? undefined,
          orgId: job.org_id,
          sourceModule: 'integrations',
          eventType: 'integration_sync_failed',
          title: 'Integration sync failed',
          severity: 'failure',
          entityType: 'integration_sync_job',
          entityId: syncJobId,
          summary: message,
        })
      );
    }
    throw err;
  }
}

export async function getConnectionPermissions(workspaceId: string, connectionId: string) {
  const ctx = await buildProviderContext(workspaceId, connectionId);
  const provider = getIntegrationProvider(ctx.providerKey);
  const perms = await provider.permissions(ctx);
  return { scopes: ctx.config.scopes ?? ctx.connectionScopes, providerPermissions: perms };
}

export async function getSyncedMetrics(workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('integration_snapshots')
    .select('provider_key, snapshot_type, payload, synced_at')
    .eq('workspace_id', workspaceId)
    .order('synced_at', { ascending: false })
    .limit(20);
  if (error) throw error;

  const latestByType = new Map<string, Record<string, unknown>>();
  for (const row of data ?? []) {
    const key = `${row.provider_key}:${row.snapshot_type}`;
    if (!latestByType.has(key)) {
      latestByType.set(key, row.payload as Record<string, unknown>);
    }
  }

  const gsc = latestByType.get('google_search_console:search_performance') ?? {};
  const ga4 = latestByType.get('google_analytics_4:ga4_overview') ?? {};

  return {
    searchConsole: {
      clicks: Number(gsc.clicks ?? 0),
      impressions: Number(gsc.impressions ?? 0),
      ctr: Number(gsc.ctr ?? 0),
      position: Number(gsc.position ?? 0),
    },
    analytics: {
      sessions: Number(ga4.sessions ?? 0),
      users: Number(ga4.users ?? 0),
      conversions: Number(ga4.conversions ?? 0),
      engagementRate: Number(ga4.engagementRate ?? 0),
    },
    snapshots: data ?? [],
  };
}

export async function createWordpressDraft(
  workspaceId: string,
  connectionId: string,
  input: { title: string; content: string; status?: 'draft' }
) {
  const ctx = await buildProviderContext(workspaceId, connectionId);
  if (ctx.providerKey !== 'wordpress') throw new Error('Not a WordPress connection');
  const draft = {
    title: input.title,
    content: input.content,
    status: input.status ?? 'draft',
    createdAt: new Date().toISOString(),
    publishing: 'user_controlled',
  };
  await getSupabaseAdmin().from('integration_snapshots').insert({
    connection_id: connectionId,
    org_id: ctx.orgId,
    workspace_id: workspaceId,
    provider_key: 'wordpress',
    snapshot_type: 'wordpress_draft',
    payload: draft,
  });
  return draft;
}

export async function notifySlack(
  workspaceId: string,
  event: string,
  message: string
) {
  const orgId = await resolveOrgId(workspaceId);
  const { data: connections } = await getSupabaseAdmin()
    .from('integration_connections')
    .select('id')
    .eq('org_id', orgId)
    .eq('provider_key', 'slack')
    .eq('status', 'connected')
    .limit(1);
  const connectionId = connections?.[0]?.id;
  if (!connectionId) return { sent: false, reason: 'no_slack_connection' };

  await getSupabaseAdmin().from('integration_snapshots').insert({
    connection_id: connectionId,
    org_id: orgId,
    workspace_id: workspaceId,
    provider_key: 'slack',
    snapshot_type: 'slack_notification',
    payload: { event, message, at: new Date().toISOString() },
  });
  return { sent: true };
}

async function buildProviderContext(
  workspaceId: string,
  connectionId: string,
  cursor: Record<string, unknown> = {}
) {
  const orgId = workspaceId ? await resolveOrgId(workspaceId) : '';
  let q = getSupabaseAdmin().from('integration_connections').select('*').eq('id', connectionId);
  if (orgId) q = q.eq('org_id', orgId);
  const { data: connection, error } = await q.maybeSingle();
  if (error || !connection) throw new Error('Connection not found');
  const credentials = await loadCredentials(connectionId);
  return {
    connectionId,
    orgId: String(connection.org_id),
    workspaceId: connection.workspace_id ?? workspaceId,
    config: (connection.config ?? {}) as Record<string, unknown>,
    credentials,
    cursor,
    providerKey: connection.provider_key as IntegrationProviderKey,
    connectionScopes: (connection.scopes ?? []) as string[],
  };
}

async function appendSyncLog(
  syncJobId: string,
  connectionId: string,
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  details: Record<string, unknown> = {}
) {
  await getSupabaseAdmin().from('integration_sync_logs').insert({
    sync_job_id: syncJobId,
    connection_id: connectionId,
    level,
    message,
    details,
  });
}

function sanitizeConnection(row: Record<string, unknown>) {
  const { /* strip nothing sensitive from public cols */ ...rest } = row;
  return rest;
}
