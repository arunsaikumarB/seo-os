-- 017_epic7_analytics_insights.sql
-- Epic 7: Analytics & Insights Engine
-- Additive — snapshots, insights cache, no breaking changes.

CREATE TABLE IF NOT EXISTS public.analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  dashboard_key TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_workspace
  ON public.analytics_snapshots(workspace_id, dashboard_key, period_end DESC);

CREATE TABLE IF NOT EXISTS public.analytics_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'cross',
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'positive', 'warning', 'critical')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  recommendation TEXT,
  metric_delta_pct NUMERIC,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_insights_workspace
  ON public.analytics_insights(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.analytics_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  dashboard_key TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('csv', 'xlsx', 'json')),
  created_by UUID,
  row_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_exports_workspace
  ON public.analytics_exports(workspace_id, created_at DESC);

ALTER TABLE public.analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analytics_snapshots_select ON public.analytics_snapshots;
CREATE POLICY analytics_snapshots_select ON public.analytics_snapshots
  FOR SELECT USING (public.can_access_workspace(workspace_id));

DROP POLICY IF EXISTS analytics_insights_select ON public.analytics_insights;
CREATE POLICY analytics_insights_select ON public.analytics_insights
  FOR SELECT USING (public.can_access_workspace(workspace_id));

DROP POLICY IF EXISTS analytics_exports_select ON public.analytics_exports;
CREATE POLICY analytics_exports_select ON public.analytics_exports
  FOR SELECT USING (public.can_access_workspace(workspace_id));
