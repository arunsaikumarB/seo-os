-- 077_provider_metrics.sql

CREATE TABLE IF NOT EXISTS public.provider_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL,
  metric TEXT NOT NULL,
  value NUMERIC NOT NULL,
  unit TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_provider_metrics_key
  ON public.provider_metrics(provider_key, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_metrics_org
  ON public.provider_metrics(org_id, captured_at DESC)
  WHERE org_id IS NOT NULL;

ALTER TABLE public.provider_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY provider_metrics_all ON public.provider_metrics
  FOR ALL USING (
    org_id IS NULL OR org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    org_id IS NULL OR org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
  );
