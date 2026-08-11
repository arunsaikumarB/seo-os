-- 110_local_auth.sql
-- Additive: credentials for AUTH_MODE=local (API-issued JWT).
-- Does not remove Supabase Auth. Safe on existing local/cloud DBs.

CREATE TABLE IF NOT EXISTS public.local_auth_users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT local_auth_users_email_key UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_local_auth_users_email_lower
  ON public.local_auth_users (lower(email));

COMMENT ON TABLE public.local_auth_users IS
  'Password credentials for AUTH_MODE=local. User id aligns with auth.users / profiles.id.';
