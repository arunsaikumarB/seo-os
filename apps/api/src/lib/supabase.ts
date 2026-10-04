import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '../config/env.js';

let adminClient: SupabaseClient | null = null;

/**
 * Service-role client. This key bypasses Postgres row-level security.
 *
 * The API is the authorization boundary. User-facing handlers must run behind
 * `authMiddleware` (and `requireProjectAccess` when the path has a project id)
 * and filter by the authenticated user, org, or workspace. That predicate is
 * what RLS would have enforced. `getSupabaseUserClient` is for queries that
 * should run as the caller so RLS applies directly.
 *
 * `/health` and `/ready` use this client only for a status word (no row payload).
 * `/metrics` and `/ops/*` use it only after `requireOpsAccess`.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    const env = getEnv();
    adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

export function getSupabaseUserClient(accessToken: string): SupabaseClient {
  const env = getEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
