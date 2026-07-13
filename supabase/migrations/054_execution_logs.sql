-- 054_execution_logs.sql

CREATE TABLE IF NOT EXISTS public.execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.execution_jobs(id) ON DELETE CASCADE,
  step_id UUID REFERENCES public.execution_steps(id) ON DELETE SET NULL,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info'
    CHECK (level IN ('debug', 'info', 'warn', 'error')),
  message TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  console_events JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_execution_logs_job
  ON public.execution_logs(job_id, created_at DESC);

ALTER TABLE public.execution_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY execution_logs_all ON public.execution_logs
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
