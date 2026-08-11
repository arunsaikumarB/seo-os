import { describe, expect, it, beforeAll } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  signLocalAccessToken,
  verifyLocalAccessToken,
  LOCAL_JWT_ISSUER,
} from '../src/modules/auth/local-auth.service.js';

beforeAll(() => {
  process.env.SUPABASE_URL ??= 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY ??= 'anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'service';
  process.env.SUPABASE_JWT_SECRET ??= 'jwt-secret-value-for-tests-at-least-32';
  process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  process.env.AUTH_MODE ??= 'local';
  process.env.ENABLE_WORKERS ??= 'false';
  process.env.NODE_ENV ??= 'test';
});

describe('local auth crypto + JWT', () => {
  it('hashes and verifies passwords', () => {
    const stored = hashPassword('correct-horse');
    expect(verifyPassword('correct-horse', stored)).toBe(true);
    expect(verifyPassword('wrong-password', stored)).toBe(false);
  });

  it('signs and verifies local access tokens', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const token = await signLocalAccessToken(userId, 'demo@example.com');
    const { sub } = await verifyLocalAccessToken(token);
    expect(sub).toBe(userId);
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      iss: string;
    };
    expect(payload.iss).toBe(LOCAL_JWT_ISSUER);
  });
});
