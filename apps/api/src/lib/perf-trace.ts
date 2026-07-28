/**
 * P1 — In-process pipeline timing (ring buffer). No DB schema.
 * Stages align with the Performance Dashboard.
 */

export type PerfStage =
  | 'import'
  | 'ai_review'
  | 'content_generation'
  | 'site_intelligence'
  | 'browser_startup'
  | 'form_detection'
  | 'submission'
  | 'db_query'
  | 'queue_wait'
  | 'campaign_health'
  | 'directory_detection'
  | 'other';

type Sample = {
  stage: PerfStage;
  ms: number;
  at: number;
  ok: boolean;
  meta?: Record<string, unknown>;
};

type StageAgg = {
  count: number;
  totalMs: number;
  maxMs: number;
  errorCount: number;
  samples: number[];
};

const RING_MAX = 400;
const ring: Sample[] = [];
const stages = new Map<PerfStage, StageAgg>();
const counters = {
  cacheHits: 0,
  cacheMisses: 0,
  skipRediscovery: 0,
  earlyCrawlStop: 0,
};

function ensureAgg(stage: PerfStage): StageAgg {
  let a = stages.get(stage);
  if (!a) {
    a = { count: 0, totalMs: 0, maxMs: 0, errorCount: 0, samples: [] };
    stages.set(stage, a);
  }
  return a;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

export function recordPerfSample(
  stage: PerfStage,
  ms: number,
  opts?: { ok?: boolean; meta?: Record<string, unknown> }
) {
  const ok = opts?.ok !== false;
  const sample: Sample = { stage, ms: Math.max(0, Math.round(ms)), at: Date.now(), ok, meta: opts?.meta };
  ring.push(sample);
  if (ring.length > RING_MAX) ring.shift();

  const a = ensureAgg(stage);
  a.count += 1;
  a.totalMs += sample.ms;
  a.maxMs = Math.max(a.maxMs, sample.ms);
  if (!ok) a.errorCount += 1;
  a.samples.push(sample.ms);
  if (a.samples.length > 80) a.samples.shift();
}

export function startPerfSpan(stage: PerfStage, meta?: Record<string, unknown>) {
  const t0 = Date.now();
  return {
    end(ok = true, extra?: Record<string, unknown>) {
      recordPerfSample(stage, Date.now() - t0, {
        ok,
        meta: { ...meta, ...extra },
      });
      return Date.now() - t0;
    },
  };
}

export async function withPerfSpan<T>(
  stage: PerfStage,
  fn: () => Promise<T>,
  meta?: Record<string, unknown>
): Promise<T> {
  const span = startPerfSpan(stage, meta);
  try {
    const result = await fn();
    span.end(true);
    return result;
  } catch (err) {
    span.end(false, { error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

export function recordCacheHit() {
  counters.cacheHits += 1;
}
export function recordCacheMiss() {
  counters.cacheMisses += 1;
}
export function recordSkipRediscovery() {
  counters.skipRediscovery += 1;
}
export function recordEarlyCrawlStop() {
  counters.earlyCrawlStop += 1;
}

const DASHBOARD_STAGES: Array<{ key: PerfStage; label: string }> = [
  { key: 'import', label: 'Import' },
  { key: 'ai_review', label: 'AI Review' },
  { key: 'content_generation', label: 'Content Generation' },
  { key: 'site_intelligence', label: 'Site Intelligence' },
  { key: 'browser_startup', label: 'Browser Startup' },
  { key: 'form_detection', label: 'Form Detection' },
  { key: 'submission', label: 'Submission' },
  { key: 'campaign_health', label: 'Campaign Health' },
  { key: 'directory_detection', label: 'Directory Detection' },
];

export function getPerformanceSnapshot() {
  const stageRows = DASHBOARD_STAGES.map(({ key, label }) => {
    const a = stages.get(key);
    const sorted = [...(a?.samples ?? [])].sort((x, y) => x - y);
    return {
      stage: key,
      label,
      count: a?.count ?? 0,
      avgMs: a?.count ? Math.round(a.totalMs / a.count) : 0,
      p50Ms: percentile(sorted, 50),
      p95Ms: percentile(sorted, 95),
      maxMs: a?.maxMs ?? 0,
      errorCount: a?.errorCount ?? 0,
      lastMs: a?.samples.length ? a.samples[a.samples.length - 1]! : null,
    };
  });

  const cacheTotal = counters.cacheHits + counters.cacheMisses;
  return {
    stages: stageRows,
    recent: ring.slice(-40).reverse(),
    cache: {
      hits: counters.cacheHits,
      misses: counters.cacheMisses,
      hitRate: cacheTotal ? Math.round((counters.cacheHits / cacheTotal) * 1000) / 10 : 0,
      skipRediscovery: counters.skipRediscovery,
      earlyCrawlStop: counters.earlyCrawlStop,
    },
  };
}

export function resetPerfForTests() {
  ring.length = 0;
  stages.clear();
  counters.cacheHits = 0;
  counters.cacheMisses = 0;
  counters.skipRediscovery = 0;
  counters.earlyCrawlStop = 0;
}
