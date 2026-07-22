-- 092_site_intelligence_engine.sql
-- Phase 5: Domain-keyed Site Profiles (additive — does not alter CSM lifecycle)

CREATE TABLE IF NOT EXISTS public.site_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  fingerprint JSONB NOT NULL DEFAULT '{}'::jsonb,
  navigation_graph JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  page_classifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  guidelines JSONB,
  strategy JSONB,
  learning JSONB NOT NULL DEFAULT '{}'::jsonb,
  profile_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (profile_status IN ('pending','profiling','complete','failed','unsupported')),
  profiled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  last_error TEXT,
  crawl_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  opportunity_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_site_profiles_ws_status
  ON public.site_profiles (workspace_id, profile_status);

CREATE INDEX IF NOT EXISTS idx_site_profiles_expires
  ON public.site_profiles (expires_at)
  WHERE expires_at IS NOT NULL;

ALTER TABLE public.site_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY site_profiles_all ON public.site_profiles
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

-- Soft link from opportunities (additive flag only — CSM lifecycle unchanged)
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS site_profile_id UUID REFERENCES public.site_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS guidelines_mismatch BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS site_profile_status TEXT;

CREATE INDEX IF NOT EXISTS idx_opportunities_site_profile
  ON public.opportunities (site_profile_id)
  WHERE site_profile_id IS NOT NULL;

-- Profiling jobs (separate from execution_jobs; share browser pool via bee_profile)
CREATE TABLE IF NOT EXISTS public.site_profile_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  site_profile_id UUID NOT NULL REFERENCES public.site_profiles(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','complete','failed')),
  lease_holder TEXT,
  lease_expires_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_profile_jobs_ws
  ON public.site_profile_jobs (workspace_id, status);

ALTER TABLE public.site_profile_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY site_profile_jobs_all ON public.site_profile_jobs
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
