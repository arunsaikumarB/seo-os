-- 053_execution_steps.sql

CREATE TABLE IF NOT EXISTS public.execution_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.execution_jobs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  step_index INT NOT NULL,
  action TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  selector_hint TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'skipped', 'failed', 'paused')),
  requires_user BOOLEAN NOT NULL DEFAULT false,
  blocker TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_ms INT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, step_index)
);

CREATE INDEX IF NOT EXISTS idx_execution_steps_job
  ON public.execution_steps(job_id, step_index);

ALTER TABLE public.execution_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY execution_steps_all ON public.execution_steps
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
