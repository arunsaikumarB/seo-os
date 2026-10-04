import { describe, expect, it, vi, beforeAll } from 'vitest';
import type { Server } from 'node:http';
import type { Express, Request, Response, NextFunction } from 'express';
import { AppError } from '@seo-os/shared';

const TOKEN = 'ops-internal-token-test';

beforeAll(() => {
  process.env.SUPABASE_URL ??= 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY ??= 'anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'service';
  process.env.SUPABASE_JWT_SECRET ??= 'jwt-secret-value-for-tests';
  process.env.DATABASE_URL ??= 'postgres://localhost/seo';
  process.env.ENABLE_WORKERS ??= 'false';
  process.env.NODE_ENV = 'test';
  process.env.OPS_INTERNAL_TOKEN = TOKEN;
  delete process.env.RAILWAY_ENVIRONMENT;
  delete process.env.TRUST_PROXY;
});

describe('requireOpsAccess', () => {
  it('accepts the internal token and otherwise defers to admin auth', async () => {
    const { requireOpsAccess } = await import('../src/middleware/ops-auth.js');
    const { requireRole } = await import('../src/middleware/rbac.js');
    const authenticateAdmin = vi.fn((req: Request, _res: Response, next: NextFunction) => {
      next(new AppError(403, 'AUTH_FORBIDDEN', `admin required for ${req.path}`));
    });
    const guard = requireOpsAccess({
      internalToken: () => TOKEN,
      authenticateAdmin,
    });

    const ok = vi.fn();
    guard(
      { headers: { authorization: `Bearer ${TOKEN}` }, path: '/metrics' } as Request,
      {} as Response,
      ok
    );
    expect(ok).toHaveBeenCalledWith();
    expect(authenticateAdmin).not.toHaveBeenCalled();

    const denied = vi.fn();
    guard(
      { headers: { authorization: 'Bearer not-the-token' }, path: '/ops/health' } as Request,
      {} as Response,
      denied
    );
    expect(authenticateAdmin).toHaveBeenCalledOnce();
    expect(denied).toHaveBeenCalledWith(expect.any(AppError));

    const memberDenied = vi.fn();
    requireRole('admin')(
      { auth: { orgRole: 'member' } } as unknown as Request,
      {} as Response,
      memberDenied
    );
    expect((memberDenied.mock.calls[0][0] as AppError).status).toBe(403);

    const ownerOk = vi.fn();
    requireRole('admin')(
      { auth: { orgRole: 'owner' } } as unknown as Request,
      {} as Response,
      ownerOk
    );
    expect(ownerOk).toHaveBeenCalledWith();

    const adminOk = vi.fn();
    requireRole('admin')(
      { auth: { orgRole: 'admin' } } as unknown as Request,
      {} as Response,
      adminOk
    );
    expect(adminOk).toHaveBeenCalledWith();
  });
});

function listen(app: Express): Promise<{ base: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server: Server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        base: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((done, reject) => {
            server.close((err) => (err ? reject(err) : done()));
          }),
      });
    });
  });
}

describe('ops routes', () => {
  it('leaves /health public and requires a token on /metrics and /ops/*', async () => {
    const { createApp } = await import('../src/app.js');
    const { resolveTrustProxy } = await import('../src/lib/trust-proxy.js');
    const app = createApp();
    expect(app.get('trust proxy')).toBe(resolveTrustProxy({ nodeEnv: 'test' }));

    const server = await listen(app);
    try {
      const health = await fetch(`${server.base}/health`);
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({ status: 'ok' });

      const openMetrics = await fetch(`${server.base}/metrics`);
      expect(openMetrics.status).toBe(401);

      const openOps = await fetch(`${server.base}/ops/queues`);
      expect(openOps.status).toBe(401);

      const metrics = await fetch(`${server.base}/metrics`, {
        headers: { authorization: `Bearer ${TOKEN}` },
      });
      expect(metrics.status).toBe(200);
      const body = (await metrics.json()) as { data: { memory: { rssMb: number } } };
      expect(body.data.memory.rssMb).toBeGreaterThan(0);

      const wrong = await fetch(`${server.base}/ops/performance`, {
        headers: { authorization: 'Bearer not-a-jwt' },
      });
      expect(wrong.status).toBe(401);
    } finally {
      await server.close();
    }
  });
});
