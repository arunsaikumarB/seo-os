import { randomUUID } from 'node:crypto';
import {
  PROVIDER_TYPES,
  getProviderManager,
  type FrameworkProviderType,
} from '@seo-os/providers';
import { encryptSecret } from '@seo-os/integrations';
import { DEFAULT_FEATURE_FLAGS } from '@seo-os/shared';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';

function flagForType(type: string): boolean {
  const map: Record<string, boolean> = {
    keyword: DEFAULT_FEATURE_FLAGS.provider_keyword,
    authority: DEFAULT_FEATURE_FLAGS.provider_authority,
    cms: DEFAULT_FEATURE_FLAGS.provider_cms,
    image: DEFAULT_FEATURE_FLAGS.provider_image,
    email: DEFAULT_FEATURE_FLAGS.provider_email,
    browser: DEFAULT_FEATURE_FLAGS.provider_browser,
    llm: DEFAULT_FEATURE_FLAGS.provider_llm,
    search: DEFAULT_FEATURE_FLAGS.provider_search,
    storage: true,
    analytics: true,
    embedding: true,
    webhook: true,
  };
  return map[type] ?? true;
}

async function resolveOrgId(workspaceId: string): Promise<string> {
  const { data } = await getSupabaseAdmin()
    .from('workspaces')
    .select('org_id')
    .eq('id', workspaceId)
    .single();
  if (!data?.org_id) throw Object.assign(new Error('Workspace not found'), { status: 404 });
  return data.org_id as string;
}

async function audit(params: {
  orgId: string;
  workspaceId?: string;
  providerKey: string;
  action: string;
  message: string;
  level?: string;
  userId?: string;
  success?: boolean;
  meta?: Record<string, unknown>;
}) {
  await getSupabaseAdmin().from('provider_logs').insert({
    id: randomUUID(),
    org_id: params.orgId,
    workspace_id: params.workspaceId ?? null,
    provider_key: params.providerKey,
    level: params.level ?? 'audit',
    action: params.action,
    message: params.message,
    success: params.success ?? true,
    meta: params.meta ?? {},
    actor_user_id: params.userId ?? null,
  });
}

export async function listProviders(workspaceId: string, type?: string) {
  const manager = getProviderManager();
  const catalog = manager.list(type as FrameworkProviderType | undefined);
  const orgId = await resolveOrgId(workspaceId);
  const { data: configs } = await getSupabaseAdmin()
    .from('provider_configs')
    .select('provider_key, enabled, priority, fallback_provider_key')
    .eq('org_id', orgId)
    .is('deleted_at', null);

  const configMap = new Map((configs ?? []).map((c) => [c.provider_key, c]));
  return catalog
    .filter((p) => flagForType(p.type))
    .map((p) => {
      const cfg = configMap.get(p.key);
      return {
        ...p,
        enabled: cfg?.enabled ?? p.enabled,
        priority: cfg?.priority ?? p.priority,
        fallbackProviderKey: cfg?.fallback_provider_key ?? null,
        featureEnabled: flagForType(p.type),
      };
    });
}

export async function listProviderTypes() {
  return PROVIDER_TYPES.map((type) => ({
    type,
    featureEnabled: flagForType(type),
    defaultKey: getProviderManager().getDefault(type).key,
  }));
}

export async function getProviderHealthSnapshot(workspaceId: string) {
  const orgId = await resolveOrgId(workspaceId);
  const manager = getProviderManager();
  const live = await manager.health();
  const day = new Date().toISOString().slice(0, 10);

  for (const h of live) {
    const { data: existing } = await getSupabaseAdmin()
      .from('provider_health')
      .select('id')
      .eq('org_id', orgId)
      .eq('workspace_id', workspaceId)
      .eq('provider_key', h.key)
      .maybeSingle();
    const row = {
      org_id: orgId,
      workspace_id: workspaceId,
      provider_key: h.key,
      status: h.status,
      latency_ms: h.latencyMs ?? null,
      message: h.message,
      last_checked_at: h.checkedAt,
      last_success_at: h.status === 'healthy' ? h.checkedAt : null,
      last_failure_at: h.status === 'offline' ? h.checkedAt : null,
      updated_at: new Date().toISOString(),
    };
    if (existing?.id) {
      await getSupabaseAdmin().from('provider_health').update(row).eq('id', existing.id);
    } else {
      await getSupabaseAdmin()
        .from('provider_health')
        .insert({ id: randomUUID(), ...row, created_at: new Date().toISOString() });
    }
  }

  const { data: usage } = await getSupabaseAdmin()
    .from('provider_usage')
    .select('*')
    .eq('org_id', orgId)
    .eq('day', day);

  const healthy = live.filter((h) => h.status === 'healthy').length;
  const offline = live.filter((h) => h.status === 'offline' || h.status === 'unconfigured').length;
  const warning = live.filter((h) => h.status === 'warning' || h.status === 'quota_exceeded').length;
  const todaysCalls = (usage ?? []).reduce((s, u) => s + Number(u.calls ?? 0), 0);
  const errors = (usage ?? []).reduce((s, u) => s + Number(u.failures ?? 0), 0);
  const failoverEvents = (usage ?? []).reduce((s, u) => s + Number(u.failover_events ?? 0), 0);
  const latencySamples = live.filter((h) => typeof h.latencyMs === 'number');
  const avgLatency =
    latencySamples.length > 0
      ? Math.round(
          latencySamples.reduce((s, h) => s + (h.latencyMs ?? 0), 0) / latencySamples.length
        )
      : null;

  return {
    connected: live.filter((h) => h.status === 'healthy' || h.status === 'warning').length,
    healthy,
    warning,
    offline,
    quota: live.filter((h) => h.status === 'quota_exceeded').length,
    averageLatencyMs: avgLatency,
    todaysCalls,
    errors,
    failoverEvents,
    providers: live,
    metricsSource: 'live' as const,
  };
}

export async function getProviderStatistics(workspaceId: string) {
  const orgId = await resolveOrgId(workspaceId);
  const { data: usage } = await getSupabaseAdmin()
    .from('provider_usage')
    .select('*')
    .eq('org_id', orgId)
    .order('day', { ascending: false })
    .limit(90);
  const { data: failovers } = await getSupabaseAdmin()
    .from('provider_failover')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50);
  return { usage: usage ?? [], failovers: failovers ?? [] };
}

export async function listCapabilities(workspaceId?: string) {
  void workspaceId;
  const { data } = await getSupabaseAdmin().from('provider_capabilities').select('*').limit(500);
  if (data?.length) return data;
  return getProviderManager()
    .list()
    .flatMap((p) =>
      p.capabilities.map((c) => ({
        provider_key: p.key,
        capability_key: c,
        label: c,
        enabled: true,
      }))
    );
}

export async function configureProvider(params: {
  workspaceId: string;
  providerKey: string;
  enabled?: boolean;
  priority?: number;
  endpoint?: string;
  timeoutMs?: number;
  retries?: number;
  rateLimitRpm?: number;
  fallbackProviderKey?: string;
  settings?: Record<string, unknown>;
  userId?: string;
}) {
  const orgId = await resolveOrgId(params.workspaceId);
  const row = {
    org_id: orgId,
    workspace_id: params.workspaceId,
    provider_key: params.providerKey,
    enabled: params.enabled ?? true,
    priority: params.priority ?? 100,
    endpoint: params.endpoint ?? null,
    timeout_ms: params.timeoutMs ?? 30000,
    retries: params.retries ?? 2,
    rate_limit_rpm: params.rateLimitRpm ?? null,
    fallback_provider_key: params.fallbackProviderKey ?? null,
    settings: params.settings ?? {},
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await getSupabaseAdmin()
    .from('provider_configs')
    .upsert(row, { onConflict: 'org_id,workspace_id,provider_key' })
    .select('*')
    .single();
  if (error) throw error;

  const manager = getProviderManager();
  if (row.enabled) manager.enable(params.providerKey);
  else manager.disable(params.providerKey);

  await audit({
    orgId,
    workspaceId: params.workspaceId,
    providerKey: params.providerKey,
    action: 'configure',
    message: `Configured ${params.providerKey}`,
    userId: params.userId,
  });
  return data;
}

export async function setProviderEnabled(
  workspaceId: string,
  providerKey: string,
  enabled: boolean,
  userId?: string
) {
  return configureProvider({ workspaceId, providerKey, enabled, userId });
}

export async function connectProvider(params: {
  workspaceId: string;
  providerKey: string;
  authMode?: string;
  secret?: string;
  endpoint?: string;
  label?: string;
  userId?: string;
}) {
  const orgId = await resolveOrgId(params.workspaceId);
  if (params.secret) {
    const enc = encryptSecret(params.secret);
    await getSupabaseAdmin().from('provider_credentials').insert({
      id: randomUUID(),
      org_id: orgId,
      workspace_id: params.workspaceId,
      provider_key: params.providerKey,
      auth_mode: params.authMode ?? 'api_key',
      ciphertext: enc.ciphertext,
      iv: enc.iv,
      auth_tag: enc.authTag,
      key_version: enc.keyVersion,
      label: params.label ?? null,
      created_by: params.userId ?? null,
    });
  }
  const cfg = await configureProvider({
    workspaceId: params.workspaceId,
    providerKey: params.providerKey,
    enabled: true,
    endpoint: params.endpoint,
    userId: params.userId,
  });
  await audit({
    orgId,
    workspaceId: params.workspaceId,
    providerKey: params.providerKey,
    action: 'connect',
    message: `Connected ${params.providerKey}`,
    userId: params.userId,
  });
  return cfg;
}

export async function disconnectProvider(
  workspaceId: string,
  providerKey: string,
  userId?: string
) {
  const orgId = await resolveOrgId(workspaceId);
  await getSupabaseAdmin()
    .from('provider_credentials')
    .update({ deleted_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('provider_key', providerKey)
    .is('deleted_at', null);
  const cfg = await configureProvider({
    workspaceId,
    providerKey,
    enabled: false,
    userId,
  });
  await audit({
    orgId,
    workspaceId,
    providerKey,
    action: 'disconnect',
    message: `Disconnected ${providerKey}`,
    userId,
  });
  return cfg;
}

export async function testProvider(workspaceId: string, providerKey: string, userId?: string) {
  const orgId = await resolveOrgId(workspaceId);
  const t0 = Date.now();
  try {
    const health = await getProviderManager().get(providerKey).health();
    const latencyMs = Date.now() - t0;
    await recordUsage(orgId, workspaceId, providerKey, true, latencyMs);
    await audit({
      orgId,
      workspaceId,
      providerKey,
      action: 'test',
      message: health.message,
      success: health.status === 'healthy' || health.status === 'warning',
      userId,
      meta: { health },
    });
    return { ok: true, latencyMs, health };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    await recordUsage(orgId, workspaceId, providerKey, false, latencyMs);
    await audit({
      orgId,
      workspaceId,
      providerKey,
      action: 'test',
      message: err instanceof Error ? err.message : 'test failed',
      success: false,
      userId,
    });
    throw err;
  }
}

export async function triggerFailover(params: {
  workspaceId: string;
  fromProviderKey: string;
  toProviderKey?: string;
  reason?: string;
  userId?: string;
}) {
  const orgId = await resolveOrgId(params.workspaceId);
  const manager = getProviderManager();
  const from = manager.get(params.fromProviderKey);
  const toKey =
    params.toProviderKey ??
    manager.list(from.type).find((p) => p.key !== params.fromProviderKey && p.isEstimated)?.key ??
    manager.getDefault(from.type).key;

  manager.disable(params.fromProviderKey);
  manager.enable(toKey);

  await getSupabaseAdmin().from('provider_failover').insert({
    id: randomUUID(),
    org_id: orgId,
    workspace_id: params.workspaceId,
    from_provider_key: params.fromProviderKey,
    to_provider_key: toKey,
    reason: params.reason ?? 'manual_failover',
    success: true,
    notified: true,
  });

  await recordUsage(orgId, params.workspaceId, toKey, true, 0, 1);
  await audit({
    orgId,
    workspaceId: params.workspaceId,
    providerKey: toKey,
    action: 'failover',
    message: `Failover ${params.fromProviderKey} → ${toKey}`,
    userId: params.userId,
  });

  return { from: params.fromProviderKey, to: toKey, notified: true };
}

async function recordUsage(
  orgId: string,
  workspaceId: string,
  providerKey: string,
  success: boolean,
  latencyMs: number,
  failoverEvents = 0
) {
  const day = new Date().toISOString().slice(0, 10);
  const { data: existing } = await getSupabaseAdmin()
    .from('provider_usage')
    .select('*')
    .eq('org_id', orgId)
    .eq('workspace_id', workspaceId)
    .eq('provider_key', providerKey)
    .eq('day', day)
    .maybeSingle();

  if (existing) {
    await getSupabaseAdmin()
      .from('provider_usage')
      .update({
        calls: Number(existing.calls) + 1,
        successes: Number(existing.successes) + (success ? 1 : 0),
        failures: Number(existing.failures) + (success ? 0 : 1),
        failover_events: Number(existing.failover_events) + failoverEvents,
        latency_sum_ms: Number(existing.latency_sum_ms) + latencyMs,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    await getSupabaseAdmin().from('provider_usage').insert({
      id: randomUUID(),
      org_id: orgId,
      workspace_id: workspaceId,
      provider_key: providerKey,
      day,
      calls: 1,
      successes: success ? 1 : 0,
      failures: success ? 0 : 1,
      failover_events: failoverEvents,
      latency_sum_ms: latencyMs,
    });
  }
}

/** Phase 5.6 — content generation records LLM/image calls on the same metrics path as Test. */
export async function recordProviderInvocation(params: {
  workspaceId: string;
  providerKey: string;
  success: boolean;
  latencyMs: number;
}) {
  const orgId = await resolveOrgId(params.workspaceId);
  await recordUsage(
    orgId,
    params.workspaceId,
    params.providerKey,
    params.success,
    params.latencyMs
  );
}

export async function listProviderLogs(workspaceId: string) {
  const orgId = await resolveOrgId(workspaceId);
  const { data } = await getSupabaseAdmin()
    .from('provider_logs')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100);
  return data ?? [];
}

export async function enqueueProviderWorkers(workspaceId: string) {
  await enqueueJob(QUEUES.LOW, 'provider_health', {
    type: 'provider_health',
    workspaceId,
  });
  await enqueueJob(QUEUES.LOW, 'provider_metrics', {
    type: 'provider_metrics',
    workspaceId,
  });
  return { queued: ['provider_health', 'provider_metrics'] };
}

export async function buildProviderReport(workspaceId: string, format: string) {
  const health = await getProviderHealthSnapshot(workspaceId);
  const stats = await getProviderStatistics(workspaceId);
  const payload = {
    title: 'Provider Integration Report',
    generatedAt: new Date().toISOString(),
    health,
    stats,
  };
  if (format === 'csv' || format === 'xlsx') {
    const rows = [
      'provider,status,latencyMs,message',
      ...health.providers.map(
        (p) => `${p.key},${p.status},${p.latencyMs ?? ''},${JSON.stringify(p.message)}`
      ),
    ];
    return { contentType: 'text/csv', body: rows.join('\n'), filename: 'provider-report.csv' };
  }
  if (format === 'pdf') {
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);
    let y = 750;
    for (const line of [
      'SEO OS — Provider Integration Report',
      `Generated: ${payload.generatedAt}`,
      `Healthy: ${health.healthy} · Offline: ${health.offline} · Calls: ${health.todaysCalls}`,
      ...health.providers.slice(0, 40).map((p) => `${p.key} · ${p.status}`),
    ]) {
      page.drawText(line.slice(0, 90), { x: 40, y, size: 10, font });
      y -= 14;
      if (y < 40) break;
    }
    const bytes = await doc.save();
    return {
      contentType: 'application/pdf',
      body: Buffer.from(bytes),
      filename: 'provider-report.pdf',
    };
  }
  return { contentType: 'application/json', body: JSON.stringify({ data: payload }), filename: null };
}
