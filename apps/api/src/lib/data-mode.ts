import { getEnv } from '../config/env.js';

/** supabase (default) = PostgREST via getSupabaseAdmin; pg = direct SQL via DATABASE_URL */
export function getDataMode(): 'supabase' | 'pg' {
  return getEnv().DATA_MODE;
}

export function isPgDataMode(): boolean {
  return getDataMode() === 'pg';
}
