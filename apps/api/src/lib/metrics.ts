/** In-process API latency & request counters for ops dashboards (v0.99) */

type Bucket = {
  count: number;
  errorCount: number;
  totalMs: number;
  maxMs: number;
};

const routes = new Map<string, Bucket>();
let startedAt = Date.now();

export function recordRequest(routeKey: string, durationMs: number, isError: boolean) {
  const key = routeKey.slice(0, 120);
  let b = routes.get(key);
  if (!b) {
    b = { count: 0, errorCount: 0, totalMs: 0, maxMs: 0 };
    routes.set(key, b);
  }
  b.count += 1;
  if (isError) b.errorCount += 1;
  b.totalMs += durationMs;
  b.maxMs = Math.max(b.maxMs, durationMs);
}

export function getMetricsSnapshot() {
  const top = [...routes.entries()]
    .map(([route, b]) => ({
      route,
      count: b.count,
      errorCount: b.errorCount,
      avgMs: b.count ? Math.round(b.totalMs / b.count) : 0,
      maxMs: Math.round(b.maxMs),
      errorRate: b.count ? Math.round((b.errorCount / b.count) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 40);

  const totals = top.reduce(
    (acc, r) => {
      acc.requests += r.count;
      acc.errors += r.errorCount;
      acc.avgMsSum += r.avgMs * r.count;
      return acc;
    },
    { requests: 0, errors: 0, avgMsSum: 0 }
  );

  return {
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    requests: totals.requests,
    errors: totals.errors,
    avgMs: totals.requests ? Math.round(totals.avgMsSum / totals.requests) : 0,
    routes: top,
  };
}

export function resetMetricsForTests() {
  routes.clear();
  startedAt = Date.now();
}
