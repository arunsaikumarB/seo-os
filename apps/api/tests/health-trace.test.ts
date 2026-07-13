import { describe, expect, it, vi, beforeAll } from 'vitest';
import type { Request, Response } from 'express';

beforeAll(() => {
  process.env.SUPABASE_URL ??= 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY ??= 'anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'service';
  process.env.SUPABASE_JWT_SECRET ??= 'jwt-secret-value-for-tests';
  process.env.DATABASE_URL ??= 'postgres://localhost/seo';
  process.env.ENABLE_WORKERS ??= 'false';
  process.env.NODE_ENV = 'test';
});

describe('health routes', () => {
  it('health returns ok', async () => {
    const { healthHandler, versionHandler } = await import('../src/routes/health.js');
    const res = {
      statusCode: 200,
      body: null as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      },
    };
    healthHandler({} as Request, res as unknown as Response);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'seo-os-api' });

    versionHandler({} as Request, res as unknown as Response);
    expect(res.body).toMatchObject({
      version: '1.2.4-enterprise',
      api: 'v1',
    });
  });
});

describe('trace middleware', () => {
  it('propagates correlation headers', async () => {
    const { traceIdMiddleware } = await import('../src/middleware/traceId.js');
    const headers: Record<string, string> = {};
    const req = { headers: { 'x-correlation-id': 'corr-123' } } as unknown as Request;
    const res = {
      setHeader(k: string, v: string) {
        headers[k] = v;
      },
    } as unknown as Response;
    const next = vi.fn();
    traceIdMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(headers['X-Trace-Id']).toBe('corr-123');
    expect(headers['X-Request-Id']).toBe('corr-123');
    expect(headers['X-Correlation-Id']).toBe('corr-123');
  });
});
