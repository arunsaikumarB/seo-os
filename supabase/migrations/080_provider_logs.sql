-- 080_provider_logs.sql

CREATE TABLE IF NOT EXISTS public.provider_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info'
    CHECK (level IN ('debug', 'info', 'warn', 'error', 'audit')),
  action TEXT NOT NULL,
  message TEXT NOT NULL,
  success BOOLEAN,
  latency_ms INT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_logs_org
  ON public.provider_logs(org_id, created_at DESC)
  WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_provider_logs_provider
  ON public.provider_logs(provider_key, created_at DESC);

ALTER TABLE public.provider_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY provider_logs_all ON public.provider_logs
  FOR ALL USING (
    org_id IS NULL OR org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    org_id IS NULL OR org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
  );
