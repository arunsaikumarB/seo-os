-- 098_assisted_manual_phase7.sql
-- Phase 7: Site Recipes on site_profiles + Assisted Manual packages (pilot ≤10)
-- Additive only — does not alter CSM lifecycle, Auto/Manual routing, or BEE worker.

ALTER TABLE public.site_profiles
  ADD COLUMN IF NOT EXISTS recipe JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.site_profiles.recipe IS
  'Phase 7 Site Recipe: form fingerprint, field roles, human_corrected overrides, gate notes';

CREATE TABLE IF NOT EXISTS public.assisted_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  entry_url TEXT NOT NULL,
  form_fingerprint TEXT NOT NULL,
  prepared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  bucket TEXT NOT NULL DEFAULT 'needs_person'
    CHECK (bucket IN ('ready','check_fields','needs_person')),
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','done','failed')),
  gate TEXT NOT NULL DEFAULT 'none',
  fingerprint_status TEXT NOT NULL DEFAULT 'fresh'
    CHECK (fingerprint_status IN ('fresh','stale','changed')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  correction_count INT NOT NULL DEFAULT 0,
  pilot_batch_id TEXT,
  minutes_spent NUMERIC(8,2),
  rejected_at_submit BOOLEAN,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, opportunity_id)
);

CREATE INDEX IF NOT EXISTS idx_assisted_packages_ws_bucket
  ON public.assisted_packages (workspace_id, bucket);

CREATE INDEX IF NOT EXISTS idx_assisted_packages_pilot
  ON public.assisted_packages (workspace_id, pilot_batch_id)
  WHERE pilot_batch_id IS NOT NULL;

ALTER TABLE public.assisted_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY assisted_packages_all ON public.assisted_packages
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

-- Soft flag on opportunities (does not change submissionLane / CSM)
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS assisted_package_id UUID REFERENCES public.assisted_packages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_opportunities_assisted_package
  ON public.opportunities (assisted_package_id)
  WHERE assisted_package_id IS NOT NULL;
