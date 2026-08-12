#!/usr/bin/env node
/**
 * Apply schema to empty (or partial) company Postgres — DD3-style.
 *
 * Usage (from ba-backend / monorepo root, with DATABASE_URL in .env):
 *   npm run db:migrate
 *
 * Loads .env from repo root (and apps/api/.env if present).
 * Does NOT use Supabase CLI.
 */
import { config as loadDotenv } from 'dotenv';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function loadEnvFiles() {
  // Prefer explicit shell/CI env. Then root .env (DD3). Never let apps/api/.env
  // override an already-set DATABASE_URL (local demos use Supabase there).
  const hadUrl = Boolean(process.env.DATABASE_URL?.trim());
  const rootEnv = join(repoRoot, '.env');
  const cwdEnv = join(process.cwd(), '.env');
  if (existsSync(rootEnv)) loadDotenv({ path: rootEnv, override: !hadUrl });
  if (cwdEnv !== rootEnv && existsSync(cwdEnv)) {
    loadDotenv({ path: cwdEnv, override: !process.env.DATABASE_URL?.trim() });
  }
  const apiEnv = join(repoRoot, 'apps/api/.env');
  if (existsSync(apiEnv) && !process.env.DATABASE_URL?.trim()) {
    loadDotenv({ path: apiEnv, override: false });
  }
}

function listSqlFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function execSql(client, sql, label) {
  try {
    await client.query(sql);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${label}: ${msg}`);
  }
}

async function main() {
  loadEnvFiles();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error('DATABASE_URL is missing. Set it in root .env (next to package.json).');
    process.exit(1);
  }

  const migrationsDir = join(repoRoot, 'supabase', 'migrations');
  if (!existsSync(migrationsDir)) {
    console.error(`Missing migrations folder: ${migrationsDir}`);
    process.exit(1);
  }

  const prepFiles = [
    join(repoRoot, 'scripts/cutover/prepare-company-roles.sql'),
    join(repoRoot, 'scripts/cutover/prepare-company-bootstrap.sql'),
    join(repoRoot, 'scripts/cutover/prepare-company-auth-users.sql'),
  ];

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  console.log('[db:migrate] connected');

  try {
    for (const file of prepFiles) {
      if (!existsSync(file)) throw new Error(`Missing prep file: ${file}`);
      console.log(`[db:migrate] prep ${file.replace(repoRoot + '\\', '').replace(repoRoot + '/', '')}`);
      await execSql(client, readFileSync(file, 'utf8'), file);
    }

    await execSql(
      client,
      `CREATE TABLE IF NOT EXISTS public.schema_migrations (
         id TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
       );`,
      'schema_migrations'
    );

    const files = listSqlFiles(migrationsDir);
    console.log(`[db:migrate] ${files.length} migration files in supabase/migrations`);

    let applied = 0;
    let skipped = 0;
    for (const name of files) {
      const id = name;
      const { rows } = await client.query(
        'SELECT 1 FROM public.schema_migrations WHERE id = $1',
        [id]
      );
      if (rows.length) {
        skipped += 1;
        continue;
      }

      const sql = readFileSync(join(migrationsDir, name), 'utf8');
      console.log(`[db:migrate] apply ${name}`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO public.schema_migrations (id) VALUES ($1)', [id]);
        await client.query('COMMIT');
        applied += 1;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        const msg = err instanceof Error ? err.message : String(err);
        // Non-fatal: publication already has table / duplicate object on partial DBs
        if (
          /already exists/i.test(msg) ||
          /is already member of publication/i.test(msg) ||
          /duplicate key value/i.test(msg)
        ) {
          console.warn(`[db:migrate] warn ${name}: ${msg} — recording as applied`);
          await client.query(
            'INSERT INTO public.schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING',
            [id]
          );
          applied += 1;
          continue;
        }
        throw new Error(`${name}: ${msg}`);
      }
    }

    const org = await client.query(
      `SELECT COUNT(*)::int AS n FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    const hasOrg = await client.query(
      `SELECT to_regclass('public.organizations') IS NOT NULL AS ok`
    );
    const hasLocal = await client.query(
      `SELECT to_regclass('public.local_auth_users') IS NOT NULL AS ok`
    );

    console.log(
      `[db:migrate] done — applied=${applied} skipped=${skipped} public_tables=${org.rows[0].n}`
    );
    console.log(
      `[db:migrate] organizations=${hasOrg.rows[0].ok} local_auth_users=${hasLocal.rows[0].ok}`
    );
    if (!hasOrg.rows[0].ok || !hasLocal.rows[0].ok) {
      console.error('[db:migrate] required tables missing — migrate incomplete');
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[db:migrate] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
