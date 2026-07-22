-- 090_bee_execution_reliability.sql
-- Phase 4: additive lease + timeline for crash-safe browser execution

ALTER TABLE public.execution_jobs
  ADD COLUMN IF NOT EXISTS lease_holder TEXT,
  ADD COLUMN IF NOT EXISTS lease_generation INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS leased_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS infra_retry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_classification TEXT,
  ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_execution_jobs_lease_expires
  ON public.execution_jobs (lease_expires_at)
  WHERE lease_expires_at IS NOT NULL AND deleted_at IS NULL;

-- Append-only execution timeline (forensic history per job / campaign item)
CREATE TABLE IF NOT EXISTS public.execution_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.execution_jobs(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  stage TEXT,
  worker_id TEXT,
  duration_ms INT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_execution_timeline_job
  ON public.execution_timeline (job_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_execution_timeline_ws
  ON public.execution_timeline (workspace_id, created_at DESC);

ALTER TABLE public.execution_timeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY execution_timeline_all ON public.execution_timeline
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
