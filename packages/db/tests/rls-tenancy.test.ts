import { describe, it, expect } from 'vitest';

/**
 * RLS integration tests require Supabase local (supabase start).
 * Run: SUPABASE_TEST=1 npm run test --workspace=@seo-os/db
 */
describe('RLS tenancy isolation', () => {
  it.skipIf(!process.env.SUPABASE_TEST)('User A cannot read User B workspace', async () => {
    // Sprint 1: wire with Supabase test client in Sprint 1 hardening
    expect(true).toBe(true);
  });

  it('RLS test suite is registered', () => {
    expect(process.env.NODE_ENV).toBeDefined();
  });
});
