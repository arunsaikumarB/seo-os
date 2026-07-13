-- 057_execution_history.sql

CREATE TABLE IF NOT EXISTS public.execution_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.execution_jobs(id) ON DELETE CASCADE,
  domain TEXT,
  result TEXT NOT NULL
    CHECK (result IN ('submitted', 'failed', 'cancelled', 'blocked', 'completed', 'needs_approval')),
  form_values_redacted JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  timing JSONB NOT NULL DEFAULT '{}'::jsonb,
  screenshot_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  replay_of_job_id UUID REFERENCES public.execution_jobs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_execution_history_ws
  ON public.execution_history(workspace_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.execution_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY execution_history_all ON public.execution_history
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
