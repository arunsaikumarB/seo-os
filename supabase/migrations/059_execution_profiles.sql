-- 059_execution_profiles.sql — per-website execution profile

CREATE TABLE IF NOT EXISTS public.execution_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  site_domain TEXT NOT NULL,
  login_url TEXT,
  submission_url TEXT,
  redirect_flow JSONB NOT NULL DEFAULT '[]'::jsonb,
  rich_editor TEXT,
  upload_strategy JSONB NOT NULL DEFAULT '{}'::jsonb,
  wait_times JSONB NOT NULL DEFAULT '{}'::jsonb,
  required_assets JSONB NOT NULL DEFAULT '[]'::jsonb,
  known_issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_navigation JSONB NOT NULL DEFAULT '[]'::jsonb,
  approval_pattern TEXT,
  review_pattern TEXT,
  form_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics_source TEXT NOT NULL DEFAULT 'estimated'
    CHECK (metrics_source IN ('estimated', 'live', 'user')),
  confidence NUMERIC(5,2) NOT NULL DEFAULT 40,
  last_execution_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, site_domain)
);

CREATE INDEX IF NOT EXISTS idx_execution_profiles_domain
  ON public.execution_profiles(workspace_id, site_domain)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'browser_sessions_profile_id_fkey'
  ) THEN
    ALTER TABLE public.browser_sessions
      ADD CONSTRAINT browser_sessions_profile_id_fkey
      FOREIGN KEY (profile_id) REFERENCES public.execution_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.execution_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY execution_profiles_all ON public.execution_profiles
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
