import type { Request, Response } from 'express';
import { getEnv } from '../config/env.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { getBoss } from '../jobs/boss.js';
import { getMetricsSnapshot } from '../lib/metrics.js';
import { getAIRuntime } from '../modules/ai/runtime.js';

export function healthHandler(_req: Request, res: Response): void {
  res.status(200).json({ status: 'ok', service: 'seo-os-api' });
}

export async function readyHandler(_req: Request, res: Response): Promise<void> {
  const env = getEnv();
  const checks: Record<string, string> = { api: 'ok' };

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('organizations').select('id').limit(1);
    checks.database = error ? 'degraded' : 'ok';
  } catch {
    checks.database = 'down';
  }

  try {
    if (env.ENABLE_WORKERS) {
      const boss = await getBoss();
      checks.queue = boss ? 'ok' : 'down';
    } else {
      checks.queue = 'disabled';
    }
  } catch {
    checks.queue = 'down';
  }

  checks.encryption =
    env.NODE_ENV === 'production' || env.NODE_ENV === 'staging'
      ? env.ENCRYPTION_KEY
        ? 'ok'
        : 'degraded'
      : env.ENCRYPTION_KEY
        ? 'ok'
        : 'optional';

  const blocking = Object.entries(checks).filter(
    ([, v]) => v === 'down' || (v !== 'ok' && v !== 'disabled' && v !== 'optional' && v !== 'degraded')
  );
  const hardFail = Object.values(checks).some((v) => v === 'down');
  res.status(hardFail ? 503 : 200).json({
    status: hardFail ? 'not_ready' : blocking.length || checks.encryption === 'degraded' ? 'degraded' : 'ready',
    checks,
  });
}

export function versionHandler(_req: Request, res: Response): void {
  res.json({
    version: '11.0.5-closed-beta',
    api: 'v1',
    release: 'Closed Beta',
  });
}

export function metricsHandler(_req: Request, res: Response): void {
  res.json({ data: getMetricsSnapshot() });
}

/** Aggregated ops dashboard: app, DB, queue, AI, integrations, latency */
export async function opsHealthHandler(_req: Request, res: Response): Promise<void> {
  const env = getEnv();
  const started = Date.now();
  const metrics = getMetricsSnapshot();

  let database: string = 'unknown';
  try {
    const { error } = await getSupabaseAdmin().from('organizations').select('id').limit(1);
    database = error ? 'degraded' : 'ok';
  } catch {
    database = 'down';
  }

  let queue: string = 'unknown';
  try {
    if (env.ENABLE_WORKERS) {
      const boss = await getBoss();
      queue = boss ? 'ok' : 'down';
    } else {
      queue = 'disabled';
    }
  } catch {
    queue = 'down';
  }

  let aiProviders: { status: string; details?: unknown } = { status: 'unknown' };
  try {
    const rt = getAIRuntime();
    const health = await rt.providers.getAIHealth();
    const statuses = [health.primary?.status, health.fallback?.status].filter(Boolean) as string[];
    const down = statuses.some((s) => s === 'down');
    const degraded = statuses.some((s) => s === 'degraded');
    aiProviders = {
      status: down ? 'down' : degraded ? 'degraded' : 'ok',
      details: health,
    };
  } catch (err) {
    aiProviders = { status: 'degraded', details: String(err) };
  }

  let integrations: string = 'ok';
  try {
    const { count, error } = await getSupabaseAdmin()
      .from('integration_connections')
      .select('id', { count: 'exact', head: true })
      .eq('health_status', 'down');
    if (error) integrations = 'degraded';
    else if ((count ?? 0) > 0) integrations = 'degraded';
  } catch {
    integrations = 'unknown';
  }

  const payload = {
    status:
      database === 'down' || queue === 'down'
        ? 'critical'
        : database === 'degraded' ||
            aiProviders.status === 'degraded' ||
            integrations === 'degraded' ||
            (!env.ENCRYPTION_KEY &&
              (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging'))
          ? 'degraded'
          : 'healthy',
    latencyMs: Date.now() - started,
    checks: {
      application: 'ok',
      database,
      queue,
      api: 'ok',
      aiProviders: aiProviders.status,
      integrations,
      encryption: env.ENCRYPTION_KEY ? 'ok' : 'missing',
    },
    metrics: {
      uptimeSec: metrics.uptimeSec,
      requests: metrics.requests,
      errors: metrics.errors,
      avgMs: metrics.avgMs,
    },
    aiProviders,
    version: '11.0.5-closed-beta',
  };

  res.status(200).json({ data: payload });
}
