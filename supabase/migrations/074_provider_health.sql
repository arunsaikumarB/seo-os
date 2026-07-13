-- 074_provider_health.sql

CREATE TABLE IF NOT EXISTS public.provider_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL REFERENCES public.provider_registry(provider_key),
  status TEXT NOT NULL DEFAULT 'offline'
    CHECK (status IN ('healthy', 'warning', 'offline', 'unconfigured', 'quota_exceeded')),
  latency_ms INT,
  quota_remaining NUMERIC,
  quota_limit NUMERIC,
  error_rate NUMERIC(6,3) DEFAULT 0,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  message TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_health_scope
  ON public.provider_health(
    COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid),
    provider_key
  );

CREATE INDEX IF NOT EXISTS idx_provider_health_status
  ON public.provider_health(status, last_checked_at DESC);

ALTER TABLE public.provider_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY provider_health_all ON public.provider_health
  FOR ALL USING (
    org_id IS NULL OR org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    org_id IS NULL OR org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
  );
