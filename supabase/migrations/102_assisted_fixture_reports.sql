-- 102_assisted_fixture_reports.sql
-- Phase 8: user-reported bad packages → fixture candidates for the regression suite.

CREATE TABLE IF NOT EXISTS public.assisted_fixture_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  package_id UUID REFERENCES public.assisted_packages(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  domain TEXT NOT NULL,
  entry_url TEXT NOT NULL,
  gate TEXT,
  bucket TEXT,
  note TEXT,
  html TEXT NOT NULL,
  inferred JSONB NOT NULL DEFAULT '{}'::jsonb,
  fixture_draft JSONB NOT NULL DEFAULT '{}'::jsonb,
  reported_by UUID,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'accepted', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assisted_fixture_reports_ws
  ON public.assisted_fixture_reports (workspace_id, created_at DESC);

ALTER TABLE public.assisted_fixture_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY assisted_fixture_reports_all ON public.assisted_fixture_reports
  FOR ALL USING (
    workspace_id IN (SELECT id FROM public.workspaces WHERE org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
    ))
  )
  WITH CHECK (
    workspace_id IN (SELECT id FROM public.workspaces WHERE org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
    ))
  );
