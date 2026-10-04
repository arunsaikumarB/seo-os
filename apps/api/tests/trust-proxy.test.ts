import { describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { resolveTrustProxy } from '../src/lib/trust-proxy.js';
import { rateLimit } from '../src/middleware/rateLimit.js';

describe('resolveTrustProxy', () => {
  it('trusts one hop in production and staging when unset', () => {
    expect(resolveTrustProxy({ nodeEnv: 'production' })).toBe(1);
    expect(resolveTrustProxy({ nodeEnv: 'staging' })).toBe(1);
  });

  it('does not trust a proxy in local and test when unset', () => {
    expect(resolveTrustProxy({ nodeEnv: 'development' })).toBe(false);
    expect(resolveTrustProxy({ nodeEnv: 'test' })).toBe(false);
  });

  it('trusts one hop when Railway sets its environment', () => {
    expect(resolveTrustProxy({ nodeEnv: 'development', railwayEnvironment: 'production' })).toBe(1);
  });

  it('treats true as a single hop and honors an explicit hop count', () => {
    expect(resolveTrustProxy({ nodeEnv: 'development', raw: 'true' })).toBe(1);
    expect(resolveTrustProxy({ nodeEnv: 'production', raw: '2' })).toBe(2);
    expect(resolveTrustProxy({ nodeEnv: 'production', raw: 'false' })).toBe(false);
    expect(resolveTrustProxy({ nodeEnv: 'production', raw: '99' })).toBe(1);
  });
});

function listen(app: express.Express): Promise<{ base: string; close: () => Promise<void> }> {
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

describe('rate limit client ip', () => {
  it('keys on X-Forwarded-For only when trust proxy is set', async () => {
    const trusted = express();
    trusted.set('trust proxy', resolveTrustProxy({ nodeEnv: 'production' }));
    trusted.use(rateLimit({ windowMs: 60_000, max: 1, keyPrefix: 'trusted-hop' }));
    trusted.get('/', (_req, res) => {
      res.json({ ip: _req.ip });
    });
    const trustedServer = await listen(trusted);
    try {
      const first = await fetch(trustedServer.base, {
        headers: { 'x-forwarded-for': '203.0.113.10' },
      });
      const second = await fetch(trustedServer.base, {
        headers: { 'x-forwarded-for': '203.0.113.11' },
      });
      const third = await fetch(trustedServer.base, {
        headers: { 'x-forwarded-for': '203.0.113.10' },
      });
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(third.status).toBe(429);
      expect(((await first.json()) as { ip: string }).ip).toBe('203.0.113.10');
    } finally {
      await trustedServer.close();
    }

    const direct = express();
    direct.set('trust proxy', resolveTrustProxy({ nodeEnv: 'development' }));
    direct.use(rateLimit({ windowMs: 60_000, max: 1, keyPrefix: 'direct' }));
    direct.get('/', (_req, res) => {
      res.json({ ok: true });
    });
    const directServer = await listen(direct);
    try {
      const a = await fetch(directServer.base, { headers: { 'x-forwarded-for': '203.0.113.20' } });
      const b = await fetch(directServer.base, { headers: { 'x-forwarded-for': '203.0.113.21' } });
      expect(a.status).toBe(200);
      expect(b.status).toBe(429);
    } finally {
      await directServer.close();
    }
  });
});
