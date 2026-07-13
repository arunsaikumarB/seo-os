-- 062_image_generation_jobs.sql

CREATE TABLE IF NOT EXISTS public.image_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES public.image_assets(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  job_type TEXT NOT NULL
    CHECK (job_type IN ('generate', 'variation', 'upscale', 'remove_background', 'regenerate', 'compress')),
  provider_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  attempts INT NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_image_generation_jobs_ws
  ON public.image_generation_jobs(workspace_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.image_generation_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY image_generation_jobs_all ON public.image_generation_jobs
  FOR ALL USING (
    workspace_id IN (SELECT id FROM public.workspaces WHERE org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))
  )
  WITH CHECK (
    workspace_id IN (SELECT id FROM public.workspaces WHERE org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))
  );
