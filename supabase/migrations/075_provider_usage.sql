-- 075_provider_usage.sql

CREATE TABLE IF NOT EXISTS public.provider_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL,
  day DATE NOT NULL DEFAULT (CURRENT_DATE),
  calls INT NOT NULL DEFAULT 0,
  successes INT NOT NULL DEFAULT 0,
  failures INT NOT NULL DEFAULT 0,
  failover_events INT NOT NULL DEFAULT 0,
  latency_sum_ms BIGINT NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(12,4) NOT NULL DEFAULT 0,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, workspace_id, provider_key, day)
);

CREATE INDEX IF NOT EXISTS idx_provider_usage_day
  ON public.provider_usage(org_id, day DESC);

ALTER TABLE public.provider_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY provider_usage_all ON public.provider_usage
  FOR ALL USING (
    org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
  );
