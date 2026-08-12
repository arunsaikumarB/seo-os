/**
 * Apply supabase/migrations on company Postgres without pgvector.
 * Used by Database.ensureTables / npm run db:setup.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { logger } from '../lib/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveRepoRoot(): string {
  return resolve(__dirname, '../../../..');
}

function listMigrationFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** Split SQL on semicolons, respecting dollar-quoted bodies. */
export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = '';
  let i = 0;
  let dollarTag: string | null = null;

  while (i < sql.length) {
    if (dollarTag) {
      const end = sql.indexOf(dollarTag, i);
      if (end === -1) {
        buf += sql.slice(i);
        break;
      }
      buf += sql.slice(i, end + dollarTag.length);
      i = end + dollarTag.length;
      dollarTag = null;
      continue;
    }

    if (sql[i] === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? sql.length : nl + 1;
      continue;
    }

    if (sql[i] === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }

    if (sql[i] === "'") {
      buf += sql[i++];
      while (i < sql.length) {
        buf += sql[i];
        if (sql[i] === "'" && sql[i + 1] === "'") {
          buf += sql[++i];
          i++;
          continue;
        }
        if (sql[i] === "'") {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (sql[i] === '$') {
      const m = sql.slice(i).match(/^\$([A-Za-z_]*)\$/);
      if (m) {
        dollarTag = m[0];
        buf += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }

    if (sql[i] === ';') {
      const stmt = buf.trim();
      if (stmt) out.push(stmt);
      buf = '';
      i++;
      continue;
    }

    buf += sql[i++];
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

function sanitizeMigrationSql(name: string, sql: string, repoRoot: string): string {
  if (name.startsWith('006_')) {
    const alt = join(repoRoot, 'scripts/cutover/006_without_vector.sql');
    if (existsSync(alt)) return readFileSync(alt, 'utf8');
  }

  return sql
    .replace(/CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+vector\s*;?/gi, '-- skipped vector\n')
    .replace(/CREATE\s+EXTENSION\s+vector\s*;?/gi, '-- skipped vector\n')
    .replace(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.kb_hybrid_search[\s\S]*?\$\$\s*;/gi,
      '-- skipped kb_hybrid_search\n'
    )
    .replace(/CREATE\s+INDEX[\s\S]*?USING\s+hnsw[\s\S]*?;/gi, '-- skipped hnsw\n')
    .replace(/vector\(\d+\)/gi, 'TEXT');
}

function isIgnorableStmtError(msg: string): boolean {
  // Do NOT ignore permission/ownership errors — those leave a half schema and break Import.
  return (
    /already exists/i.test(msg) ||
    /is already a member of publication/i.test(msg) ||
    /duplicate key value/i.test(msg) ||
    /multiple primary keys/i.test(msg) ||
    /type "vector" does not exist/i.test(msg) ||
    /extension "vector"/i.test(msg) ||
    /could not open extension control file/i.test(msg) ||
    /policy .* already exists/i.test(msg) ||
    /trigger .* already exists/i.test(msg)
  );
}

async function runSqlFile(client: pg.PoolClient, sql: string, label: string): Promise<void> {
  const statements = splitSqlStatements(sql);
  for (const stmt of statements) {
    try {
      await client.query(stmt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isIgnorableStmtError(msg)) continue;
      throw new Error(`${label}: ${msg}\n--- SQL ---\n${stmt.slice(0, 240)}`);
    }
  }
}

export async function applyCompanyMigrations(
  client: pg.PoolClient
): Promise<{ applied: number; skipped: number }> {
  const repoRoot = resolveRepoRoot();
  const migrationsDir = join(repoRoot, 'supabase', 'migrations');
  if (!existsSync(migrationsDir)) {
    throw new Error(`Missing migrations at ${migrationsDir} — pull latest ba-backend`);
  }

  const roles = join(repoRoot, 'scripts/cutover/prepare-company-roles.sql');
  if (existsSync(roles)) {
    await runSqlFile(client, readFileSync(roles, 'utf8'), 'prepare-company-roles');
  }
  await client.query(`CREATE SCHEMA IF NOT EXISTS extensions`);
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END $$;
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // If a previous partial bootstrap marked early migrations applied but
  // pipeline tables are missing, clear the ledger and re-apply.
  const { rows: pipeCheck } = await client.query<{ n: string }>(
    `SELECT to_regclass('public.backlink_imports')::text AS n`
  );
  if (!pipeCheck[0]?.n) {
    await client.query(`DELETE FROM public.schema_migrations`);
    logger.warn('Cleared schema_migrations — backlink_imports missing, re-applying all');
  }

  const files = listMigrationFiles(migrationsDir);
  let applied = 0;
  let skipped = 0;

  for (const name of files) {
    const { rows } = await client.query('SELECT 1 FROM public.schema_migrations WHERE id = $1', [
      name,
    ]);
    if (rows.length) {
      skipped += 1;
      continue;
    }

    const raw = readFileSync(join(migrationsDir, name), 'utf8');
    const sql = sanitizeMigrationSql(name, raw, repoRoot);
    logger.info({ migration: name }, 'Database applying migration (no pgvector)');
    await runSqlFile(client, sql, name);
    await client.query('INSERT INTO public.schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING', [
      name,
    ]);
    applied += 1;
  }

  return { applied, skipped };
}

export async function assertPipelineTables(client: pg.PoolClient): Promise<string[]> {
  // Full Import → AI Review → Generate → Assisted Manual path (no pgvector/kb_*)
  const required = [
    'organizations',
    'local_auth_users',
    'workspaces',
    'workspace_settings',
    'backlink_imports',
    'backlink_import_rows',
    'backlink_domain_analyses',
    'backlink_automation_runs',
    'backlink_automation_run_logs',
    'opportunities',
    'backlink_ai_drafts',
    'backlink_submissions',
    'relationship_organizations',
    'relationship_contacts',
    'content_packs',
    'assisted_packages',
    'site_profiles',
    'execution_policies',
    'platform_events',
  ];
  const { rows } = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [required]
  );
  const have = new Set(rows.map((r) => r.table_name));
  const missing = required.filter((t) => !have.has(t));
  if (missing.length) {
    throw new Error(
      `Pipeline tables missing after migrate: ${missing.join(', ')}. Re-run: npm run db:setup`
    );
  }
  return [...have].sort();
}
