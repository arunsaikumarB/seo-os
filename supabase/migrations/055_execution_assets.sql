-- 055_execution_assets.sql

CREATE TABLE IF NOT EXISTS public.execution_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.execution_jobs(id) ON DELETE CASCADE,
  step_id UUID REFERENCES public.execution_steps(id) ON DELETE SET NULL,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL
    CHECK (kind IN ('screenshot', 'download', 'upload_ref', 'dom_snapshot', 'html_capture')),
  label TEXT,
  storage_path TEXT,
  mime_type TEXT,
  byte_size INT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_execution_assets_job
  ON public.execution_assets(job_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.execution_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY execution_assets_all ON public.execution_assets
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
