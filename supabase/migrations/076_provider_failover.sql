-- 076_provider_failover.sql

CREATE TABLE IF NOT EXISTS public.provider_failover (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  from_provider_key TEXT NOT NULL,
  to_provider_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  operation TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  latency_ms INT,
  notified BOOLEAN NOT NULL DEFAULT false,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_failover_org
  ON public.provider_failover(org_id, created_at DESC);

ALTER TABLE public.provider_failover ENABLE ROW LEVEL SECURITY;
CREATE POLICY provider_failover_all ON public.provider_failover
  FOR ALL USING (
    org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
  );
