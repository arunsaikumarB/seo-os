-- 073_provider_configs.sql

CREATE TABLE IF NOT EXISTS public.provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL REFERENCES public.provider_registry(provider_key),
  enabled BOOLEAN NOT NULL DEFAULT false,
  priority INT NOT NULL DEFAULT 100,
  endpoint TEXT,
  timeout_ms INT NOT NULL DEFAULT 30000,
  retries INT NOT NULL DEFAULT 2,
  rate_limit_rpm INT,
  fallback_provider_key TEXT REFERENCES public.provider_registry(provider_key),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, workspace_id, provider_key)
);

CREATE INDEX IF NOT EXISTS idx_provider_configs_org
  ON public.provider_configs(org_id, enabled) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_provider_configs_ws
  ON public.provider_configs(workspace_id, enabled) WHERE deleted_at IS NULL AND workspace_id IS NOT NULL;

ALTER TABLE public.provider_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY provider_configs_all ON public.provider_configs
  FOR ALL USING (
    org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
  );
