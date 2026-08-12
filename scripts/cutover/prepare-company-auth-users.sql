-- Minimal Supabase-compatible auth stubs for company Postgres (empty DB migrate).
-- Required before supabase/migrations/002 (profiles FK + trigger on auth.users).
-- Safe to re-run.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY,
  instance_id UUID NULL,
  aud TEXT NULL,
  role TEXT NULL,
  email TEXT NULL,
  encrypted_password TEXT NULL,
  email_confirmed_at TIMESTAMPTZ NULL,
  invited_at TIMESTAMPTZ NULL,
  confirmation_token TEXT NULL,
  confirmation_sent_at TIMESTAMPTZ NULL,
  recovery_token TEXT NULL,
  recovery_sent_at TIMESTAMPTZ NULL,
  email_change_token_new TEXT NULL,
  email_change TEXT NULL,
  email_change_sent_at TIMESTAMPTZ NULL,
  last_sign_in_at TIMESTAMPTZ NULL,
  raw_app_meta_data JSONB NULL DEFAULT '{}'::jsonb,
  raw_user_meta_data JSONB NULL DEFAULT '{}'::jsonb,
  is_super_admin BOOLEAN NULL,
  created_at TIMESTAMPTZ NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NULL DEFAULT now(),
  phone TEXT NULL,
  phone_confirmed_at TIMESTAMPTZ NULL,
  phone_change TEXT NULL,
  phone_change_token TEXT NULL,
  phone_change_sent_at TIMESTAMPTZ NULL,
  confirmed_at TIMESTAMPTZ NULL,
  email_change_token_current TEXT NULL,
  email_change_confirm_status SMALLINT NULL,
  banned_until TIMESTAMPTZ NULL,
  reauthentication_token TEXT NULL,
  reauthentication_sent_at TIMESTAMPTZ NULL,
  is_sso_user BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ NULL,
  is_anonymous BOOLEAN NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_partial_key
  ON auth.users (email)
  WHERE email IS NOT NULL;

-- Used by RLS policies in migrations. Company API uses service role / bypass via app.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '');
$$;

-- Realtime publication referenced by some migrations (no-op consumers on company stack).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;
