import pg from 'pg';
import { getEnv } from '../config/env.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

/** Shared pg pool (DATABASE_URL). Used by local auth; does not replace Supabase admin client. */
export function getPgPool(): pg.Pool {
  if (!pool) {
    const env = getEnv();
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 8,
    });
  }
  return pool;
}

export async function pgQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return getPgPool().query<T>(text, params);
}
