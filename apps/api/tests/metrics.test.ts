import { describe, expect, it, beforeEach } from 'vitest';
import { getMetricsSnapshot, recordRequest, resetMetricsForTests } from '../src/lib/metrics.js';

describe('api metrics', () => {
  beforeEach(() => resetMetricsForTests());

  it('aggregates latency and errors', () => {
    recordRequest('GET /health', 12, false);
    recordRequest('GET /health', 20, false);
    recordRequest('POST /v1/x', 40, true);
    const snap = getMetricsSnapshot();
    expect(snap.requests).toBe(3);
    expect(snap.errors).toBe(1);
    expect(snap.routes.length).toBeGreaterThan(0);
  });
});
