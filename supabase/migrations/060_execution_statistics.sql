-- 060_execution_statistics.sql

CREATE TABLE IF NOT EXISTS public.execution_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  day DATE NOT NULL DEFAULT (CURRENT_DATE),
  running INT NOT NULL DEFAULT 0,
  queued INT NOT NULL DEFAULT 0,
  paused INT NOT NULL DEFAULT 0,
  needs_approval INT NOT NULL DEFAULT 0,
  completed INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  blocked INT NOT NULL DEFAULT 0,
  cancelled INT NOT NULL DEFAULT 0,
  avg_runtime_ms INT,
  success_rate NUMERIC(5,2),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, day)
);

CREATE INDEX IF NOT EXISTS idx_execution_statistics_ws_day
  ON public.execution_statistics(workspace_id, day DESC);

ALTER TABLE public.execution_statistics ENABLE ROW LEVEL SECURITY;
CREATE POLICY execution_statistics_all ON public.execution_statistics
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

-- Soft-link assist sessions to BEE jobs (compatibility, no rebuild)
ALTER TABLE public.browser_assist_sessions
  ADD COLUMN IF NOT EXISTS execution_job_id UUID REFERENCES public.execution_jobs(id) ON DELETE SET NULL;
