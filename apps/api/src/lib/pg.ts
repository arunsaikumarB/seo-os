import pg from 'pg';
import { getEnv } from '../config/env.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

/** Shared pg pool (DATABASE_URL). Used by local auth + DATA_MODE=pg. */
export function getPgPool(): pg.Pool {
  if (!pool) {
    const env = getEnv();
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      // Import pipeline runs concurrent domain analysis; keep headroom under load.
      max: Number(process.env.PG_POOL_MAX ?? 25) || 25,
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

export async function pgOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await pgQuery<T>(text, params);
  return result.rows[0] ?? null;
}

export async function pgMany<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await pgQuery<T>(text, params);
  return result.rows;
}

export async function withPgTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');
    const value = await fn(client);
    await client.query('COMMIT');
    return value;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
