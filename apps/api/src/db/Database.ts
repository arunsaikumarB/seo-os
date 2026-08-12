/**
 * Company / DD3-style schema bootstrap (no pgvector, no Supabase CLI).
 *
 * 1) Core auth/org/project tables
 * 2) Full product migrations for Import → Assisted Manual (vector/kb skipped)
 *
 * Usage:
 *   - API startup when COMPANY_STACK=true (automatic)
 *   - CLI: npm run db:setup
 */
import type pg from 'pg';
import { getPgPool } from '../lib/pg.js';
import { logger } from '../lib/logger.js';
import { applyCompanyMigrations, assertPipelineTables } from './apply-migrations.js';

const CORE_STATEMENTS: string[] = [
  `CREATE EXTENSION IF NOT EXISTS pgcrypto`,
  `CREATE SCHEMA IF NOT EXISTS auth`,
  `CREATE SCHEMA IF NOT EXISTS pgboss`,

  `CREATE TABLE IF NOT EXISTS auth.users (
     id UUID PRIMARY KEY,
     instance_id UUID NULL,
     aud TEXT NULL,
     role TEXT NULL,
     email TEXT NULL,
     encrypted_password TEXT NULL,
     email_confirmed_at TIMESTAMPTZ NULL,
     raw_app_meta_data JSONB NULL DEFAULT '{}'::jsonb,
     raw_user_meta_data JSONB NULL DEFAULT '{}'::jsonb,
     created_at TIMESTAMPTZ NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NULL DEFAULT now(),
     is_sso_user BOOLEAN NOT NULL DEFAULT false,
     is_anonymous BOOLEAN NOT NULL DEFAULT false
   )`,

  `CREATE UNIQUE INDEX IF NOT EXISTS auth_users_email_key
     ON auth.users (email)
     WHERE email IS NOT NULL`,

  `CREATE OR REPLACE FUNCTION auth.uid()
     RETURNS UUID LANGUAGE sql STABLE AS $$
     SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
   $$`,

  `CREATE OR REPLACE FUNCTION public.set_updated_at()
     RETURNS TRIGGER LANGUAGE plpgsql AS $$
   BEGIN
     NEW.updated_at = now();
     RETURN NEW;
   END;
   $$`,

  `CREATE TABLE IF NOT EXISTS public.organizations (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     name TEXT NOT NULL,
     slug TEXT NOT NULL UNIQUE,
     industry TEXT,
     plan TEXT NOT NULL DEFAULT 'free',
     settings JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS public.profiles (
     id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
     full_name TEXT,
     avatar_url TEXT,
     timezone TEXT NOT NULL DEFAULT 'UTC',
     preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS public.local_auth_users (
     id UUID PRIMARY KEY,
     email TEXT NOT NULL,
     password_hash TEXT NOT NULL,
     full_name TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     CONSTRAINT local_auth_users_email_key UNIQUE (email)
   )`,

  `CREATE INDEX IF NOT EXISTS idx_local_auth_users_email_lower
     ON public.local_auth_users (lower(email))`,

  `CREATE TABLE IF NOT EXISTS public.org_members (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
     user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
     role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'member', 'viewer')),
     status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
     invited_by UUID REFERENCES public.profiles(id),
     joined_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE (org_id, user_id)
   )`,

  `CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.org_members(org_id)`,
  `CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.org_members(user_id)`,

  `CREATE TABLE IF NOT EXISTS public.workspaces (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     domain TEXT NOT NULL,
     url TEXT,
     industry TEXT,
     description TEXT,
     target_audience TEXT,
     status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
     domain_verified BOOLEAN NOT NULL DEFAULT false,
     verification_token TEXT,
     contact_email TEXT,
     contact_name TEXT,
     contact_phone TEXT,
     company_name TEXT,
     brand_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_by UUID REFERENCES public.profiles(id),
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE (org_id, domain)
   )`,

  `CREATE TABLE IF NOT EXISTS public.workspace_settings (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     workspace_id UUID NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
     brand_voice JSONB NOT NULL DEFAULT '{}'::jsonb,
     seo_goals JSONB NOT NULL DEFAULT '{}'::jsonb,
     outreach_defaults JSONB NOT NULL DEFAULT '{"approval_mode":"always"}'::jsonb,
     memory_config JSONB NOT NULL DEFAULT '{}'::jsonb,
     crawl_config JSONB NOT NULL DEFAULT '{"max_pages":500}'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,

  `CREATE INDEX IF NOT EXISTS idx_workspaces_org_status
     ON public.workspaces(org_id, status)`,
];

async function execSoft(client: pg.PoolClient, sql: string): Promise<void> {
  try {
    await client.query(sql);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      /extension .* is not available|permission denied to create extension|could not open extension control file/i.test(
        msg
      ) ||
      /already exists/i.test(msg)
    ) {
      return;
    }
    throw err;
  }
}

export class Database {
  /**
   * Core tables + full import/pipeline schema (no pgvector).
   * Idempotent — safe on every COMPANY_STACK boot.
   */
  static async ensureTables(pool: pg.Pool = getPgPool()): Promise<{
    ok: true;
    tables: string[];
    migrations: { applied: number; skipped: number };
  }> {
    const client = await pool.connect();
    try {
      for (const sql of CORE_STATEMENTS) {
        await execSoft(client, sql);
      }
      await execSoft(
        client,
        `ALTER TABLE public.workspaces
           ADD COLUMN IF NOT EXISTS contact_email TEXT,
           ADD COLUMN IF NOT EXISTS contact_name TEXT,
           ADD COLUMN IF NOT EXISTS contact_phone TEXT,
           ADD COLUMN IF NOT EXISTS company_name TEXT,
           ADD COLUMN IF NOT EXISTS brand_profile JSONB NOT NULL DEFAULT '{}'::jsonb`
      );

      const migrations = await applyCompanyMigrations(client);
      const tables = await assertPipelineTables(client);

      logger.info(
        { tables, migrations },
        'Database.ensureTables complete — import/pipeline ready (no pgvector)'
      );
      return { ok: true, tables, migrations };
    } finally {
      client.release();
    }
  }
}

export async function ensureCompanyDatabase(): Promise<void> {
  await Database.ensureTables();
}
