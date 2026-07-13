import type { Request, Response } from 'express';
import { getEnv } from '../config/env.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { getBoss, QUEUES } from '../jobs/boss.js';
import { getMetricsSnapshot } from '../lib/metrics.js';
import { getAIRuntime } from '../modules/ai/runtime.js';
import { listCircuits } from '../lib/circuit-breaker.js';
import { getProviderManager } from '@seo-os/providers';

export function healthHandler(_req: Request, res: Response): void {
  res.status(200).json({ status: 'ok', service: 'seo-os-api', version: '1.2.5-bee-resume' });
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

  checks.sentry = env.SENTRY_DSN ? 'configured' : 'optional';

  const hardFail = Object.values(checks).some((v) => v === 'down');
  res.status(hardFail ? 503 : 200).json({
    status: hardFail
      ? 'not_ready'
      : checks.encryption === 'degraded'
        ? 'degraded'
        : 'ready',
    checks,
    version: '1.2.5-bee-resume',
  });
}

export function versionHandler(_req: Request, res: Response): void {
  res.json({
    version: '1.2.5-bee-resume',
    api: 'v1',
    release: 'Enterprise Production Polish',
  });
}

export function metricsHandler(_req: Request, res: Response): void {
  const mem = process.memoryUsage();
  res.json({
    data: {
      ...getMetricsSnapshot(),
      memory: {
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
        externalMb: Math.round(mem.external / 1024 / 1024),
      },
      circuits: listCircuits(),
    },
  });
}

async function queueDepths(): Promise<Record<string, number>> {
  const env = getEnv();
  const out: Record<string, number> = {};
  if (!env.ENABLE_WORKERS) {
    for (const name of Object.values(QUEUES)) out[name] = 0;
    return out;
  }
  try {
    const boss = await getBoss();
    if (!boss) return out;
    await Promise.all(
      Object.values(QUEUES).map(async (name) => {
        try {
          out[name] = await boss.getQueueSize(name);
        } catch {
          out[name] = -1;
        }
      })
    );
  } catch {
    /* ignore */
  }
  return out;
}

/** Aggregated ops dashboard: app, DB, queue, AI, providers, memory, latency */
export async function opsHealthHandler(_req: Request, res: Response): Promise<void> {
  const env = getEnv();
  const started = Date.now();
  const metrics = getMetricsSnapshot();
  const mem = process.memoryUsage();

  let database: string = 'unknown';
  try {
    const { error } = await getSupabaseAdmin().from('organizations').select('id').limit(1);
    database = error ? 'degraded' : 'ok';
  } catch {
    database = 'down';
  }

  let queue: string = 'unknown';
  const depths = await queueDepths();
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

  let providerFramework: { healthy: number; offline: number; warning: number } = {
    healthy: 0,
    offline: 0,
    warning: 0,
  };
  try {
    const live = await getProviderManager().health();
    providerFramework = {
      healthy: live.filter((h) => h.status === 'healthy').length,
      offline: live.filter((h) => h.status === 'offline' || h.status === 'unconfigured').length,
      warning: live.filter((h) => h.status === 'warning' || h.status === 'quota_exceeded').length,
    };
  } catch {
    /* ignore */
  }

  const errorRate =
    metrics.requests > 0 ? Math.round((metrics.errors / metrics.requests) * 1000) / 10 : 0;
  const successRate = Math.max(0, Math.round((100 - errorRate) * 10) / 10);
  const pendingJobs = Object.values(depths).reduce((s, n) => s + Math.max(0, n), 0);

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
      storage: database === 'ok' ? 'ok' : database,
      workers: queue,
      aiProviders: aiProviders.status,
      integrations,
      encryption: env.ENCRYPTION_KEY ? 'ok' : 'missing',
      sentry: env.SENTRY_DSN ? 'configured' : 'optional',
    },
    metrics: {
      uptimeSec: metrics.uptimeSec,
      requests: metrics.requests,
      errors: metrics.errors,
      avgMs: metrics.avgMs,
      errorRate,
      successRate,
      pendingJobs,
      failedJobs: metrics.errors,
    },
    queues: depths,
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
    },
    providerFramework,
    circuits: listCircuits(),
    aiProviders,
    environment: {
      nodeEnv: env.NODE_ENV,
      workersEnabled: env.ENABLE_WORKERS,
      providerMode: env.PROVIDER_MODE,
    },
    version: '1.2.5-bee-resume',
  };

  res.status(200).json({ data: payload });
}

export async function getEnterpriseHealthSnapshot(): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const res = {
      status() {
        return this;
      },
      json(body: { data: Record<string, unknown> }) {
        resolve(body.data);
      },
    };
    void opsHealthHandler({} as Request, res as unknown as Response);
  });
}
