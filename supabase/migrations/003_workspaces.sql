-- 003_workspaces.sql
-- API exposes workspaces as "projects"

CREATE TABLE public.workspaces (
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
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, domain)
);

CREATE TABLE public.workspace_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  brand_voice JSONB NOT NULL DEFAULT '{}'::jsonb,
  seo_goals JSONB NOT NULL DEFAULT '{}'::jsonb,
  outreach_defaults JSONB NOT NULL DEFAULT '{"approval_mode":"always"}'::jsonb,
  memory_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  crawl_config JSONB NOT NULL DEFAULT '{"max_pages":500}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.domain_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('dns', 'html')),
  token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed')),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workspaces_org_status ON public.workspaces(org_id, status);

CREATE TRIGGER workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER workspace_settings_updated_at
  BEFORE UPDATE ON public.workspace_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- pg-boss schema (job queue)
CREATE SCHEMA IF NOT EXISTS pgboss;
