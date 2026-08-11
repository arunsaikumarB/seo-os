/**
 * Focused integration tests for DATA_MODE=pg PostgREST-compat.
 * Skips when local Postgres is unreachable — does not wipe databases.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import pg from 'pg';

const DB_CANDIDATES = [
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  'postgresql://postgres:postgres@127.0.0.1:54332/backlink_agent',
];

let dbUrl: string | null = null;
let dbReachable = false;

async function probeDb(): Promise<string | null> {
  for (const url of DB_CANDIDATES) {
    const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 1500 });
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return url;
    } catch {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

beforeAll(async () => {
  dbUrl = await probeDb();
  dbReachable = Boolean(dbUrl);

  process.env.DATA_MODE = 'pg';
  process.env.DATABASE_URL = dbUrl ?? DB_CANDIDATES[0]!;
  process.env.SUPABASE_URL ??= 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY ??= 'anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'service';
  process.env.SUPABASE_JWT_SECRET ??= 'jwt-secret-value-for-tests-at-least-32';
  process.env.ENABLE_WORKERS ??= 'false';
  process.env.NODE_ENV ??= 'test';
  process.env.AUTH_MODE ??= 'local';
});

describe('pg-supabase-compat (DATA_MODE=pg)', () => {
  it('insert / select / eq / order / delete on organizations', async ({ skip }) => {
    if (!dbReachable) {
      skip();
      return;
    }

    // Dynamic import after env is set so getEnv()/pool see DATA_MODE=pg
    const { createPgSupabaseCompat } = await import('../src/lib/pg-supabase-compat.js');
    const client = createPgSupabaseCompat();
    const slug = `pg-compat-test-${Date.now()}`;

    const inserted = await client
      .from('organizations')
      .insert({ name: 'PG Compat Test Org', slug })
      .select('*')
      .single();

    expect(inserted.error).toBeNull();
    expect(inserted.data).toBeTruthy();
    const org = inserted.data as { id: string; name: string; slug: string };
    expect(org.slug).toBe(slug);
    expect(org.name).toBe('PG Compat Test Org');

    try {
      const listed = await client
        .from('organizations')
        .select('id, name, slug')
        .eq('slug', slug)
        .order('created_at', { ascending: false })
        .limit(5);

      expect(listed.error).toBeNull();
      expect(Array.isArray(listed.data)).toBe(true);
      const rows = listed.data as Array<{ id: string; slug: string }>;
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows[0]!.slug).toBe(slug);

      const one = await client.from('organizations').select('*').eq('id', org.id).maybeSingle();
      expect(one.error).toBeNull();
      expect((one.data as { id: string }).id).toBe(org.id);

      const missing = await client
        .from('organizations')
        .select('*')
        .eq('id', '00000000-0000-4000-8000-000000000000')
        .maybeSingle();
      expect(missing.error).toBeNull();
      expect(missing.data).toBeNull();

      const singleMissing = await client
        .from('organizations')
        .select('*')
        .eq('id', '00000000-0000-4000-8000-000000000000')
        .single();
      expect(singleMissing.data).toBeNull();
      expect(singleMissing.error).toBeTruthy();

      const orFilter = await client
        .from('organizations')
        .select('id, slug')
        .or(`slug.eq.${slug},slug.eq.__never__`)
        .limit(5);
      expect(orFilter.error).toBeNull();
      expect((orFilter.data as unknown[]).length).toBeGreaterThanOrEqual(1);
    } finally {
      await client.from('organizations').delete().eq('id', org.id);
    }
  });

  it('nested organizations(*) on org_members when feasible', async ({ skip }) => {
    if (!dbReachable) {
      skip();
      return;
    }

    const { createPgSupabaseCompat } = await import('../src/lib/pg-supabase-compat.js');
    const client = createPgSupabaseCompat();
    const slug = `pg-compat-nest-${Date.now()}`;

    const { data: org, error: orgErr } = await client
      .from('organizations')
      .insert({ name: 'Nest Test Org', slug })
      .select('*')
      .single();
    expect(orgErr).toBeNull();
    const orgId = (org as { id: string }).id;

    // org_members requires a real profiles/user FK — skip nested write if we cannot insert a member.
    // Still verify the SELECT SQL path with eq that returns empty (no throw).
    try {
      const empty = await client
        .from('org_members')
        .select('role, organizations(*)')
        .eq('org_id', orgId)
        .eq('status', 'active');
      expect(empty.error).toBeNull();
      expect(Array.isArray(empty.data)).toBe(true);
    } finally {
      await client.from('organizations').delete().eq('id', orgId);
    }
  });
});
