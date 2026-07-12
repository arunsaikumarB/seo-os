-- 018_epic8_reports_engine.sql
-- Version 0.96: Reports & Executive Intelligence
-- Additive — report definitions, runs, schedules, white-label brands

CREATE TABLE IF NOT EXISTS public.report_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default Brand',
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#0d9488',
  secondary_color TEXT NOT NULL DEFAULT '#0369a1',
  footer_text TEXT,
  cover_title TEXT,
  agency_name TEXT,
  agency_email TEXT,
  agency_website TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_brands_workspace
  ON public.report_brands(workspace_id);

CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  brand_id UUID REFERENCES public.report_brands(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'queued', 'generating', 'ready', 'failed', 'archived'
  )),
  schedule TEXT NOT NULL DEFAULT 'manual' CHECK (schedule IN (
    'manual', 'on_demand', 'weekly', 'monthly', 'quarterly'
  )),
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  period_start DATE,
  period_end DATE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_workspace ON public.reports(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_schedule ON public.reports(workspace_id, schedule, next_run_at)
  WHERE schedule IN ('weekly', 'monthly', 'quarterly');

CREATE TABLE IF NOT EXISTS public.report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'generating', 'ready', 'failed', 'cancelled'
  )),
  progress INT NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  executive_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  insights JSONB NOT NULL DEFAULT '[]'::jsonb,
  forecasts JSONB NOT NULL DEFAULT '[]'::jsonb,
  error TEXT,
  export_formats TEXT[] NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_runs_workspace
  ON public.report_runs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_runs_report
  ON public.report_runs(report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_runs_status
  ON public.report_runs(workspace_id, status);

CREATE TABLE IF NOT EXISTS public.report_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.report_runs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('pdf', 'pptx', 'csv', 'xlsx', 'json')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'ready', 'failed')),
  storage_path TEXT,
  content TEXT,
  byte_size INT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_exports_run ON public.report_exports(run_id);

CREATE TABLE IF NOT EXISTS public.report_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.report_runs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('download', 'email', 'internal')),
  recipient TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.report_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_brands_select ON public.report_brands;
CREATE POLICY report_brands_select ON public.report_brands
  FOR SELECT USING (public.can_access_workspace(workspace_id));

DROP POLICY IF EXISTS reports_select ON public.reports;
CREATE POLICY reports_select ON public.reports
  FOR SELECT USING (public.can_access_workspace(workspace_id));

DROP POLICY IF EXISTS report_runs_select ON public.report_runs;
CREATE POLICY report_runs_select ON public.report_runs
  FOR SELECT USING (public.can_access_workspace(workspace_id));

DROP POLICY IF EXISTS report_exports_select ON public.report_exports;
CREATE POLICY report_exports_select ON public.report_exports
  FOR SELECT USING (public.can_access_workspace(workspace_id));

DROP POLICY IF EXISTS report_deliveries_select ON public.report_deliveries;
CREATE POLICY report_deliveries_select ON public.report_deliveries
  FOR SELECT USING (public.can_access_workspace(workspace_id));
