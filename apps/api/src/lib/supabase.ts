import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '../config/env.js';
import { isPgDataMode } from './data-mode.js';
import { createPgSupabaseCompat, type PgSupabaseCompat } from './pg-supabase-compat.js';

let adminClient: SupabaseClient | null = null;
let pgCompat: PgSupabaseCompat | null = null;

/**
 * Admin data client.
 * - DATA_MODE=supabase (default): Supabase service-role PostgREST client
 * - DATA_MODE=pg: PostgREST-lite chainable client over node-pg (see pg-supabase-compat.ts)
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (isPgDataMode()) {
    if (!pgCompat) {
      pgCompat = createPgSupabaseCompat();
    }
    return pgCompat as unknown as SupabaseClient;
  }

  if (!adminClient) {
    const env = getEnv();
    adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

/** User-scoped Supabase client (RLS). Remains supabase-only — not used under DATA_MODE=pg. */
export function getSupabaseUserClient(accessToken: string): SupabaseClient {
  const env = getEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
