-- 082_automation_pipeline_repair.sql
-- Fix silent write failures: priority INT vs TEXT, run statuses, execution logs.

-- 1) opportunities.priority: INT (008) blocked TEXT (011 ADD IF NOT EXISTS) — convert properly
DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'opportunities'
    AND column_name = 'priority';

  IF col_type = 'integer' THEN
    ALTER TABLE public.opportunities RENAME COLUMN priority TO priority_int_legacy;
    ALTER TABLE public.opportunities ADD COLUMN priority TEXT;
    UPDATE public.opportunities
    SET priority = CASE
      WHEN priority_int_legacy >= 80 THEN 'urgent'
      WHEN priority_int_legacy >= 60 THEN 'high'
      WHEN priority_int_legacy >= 40 THEN 'medium'
      ELSE 'low'
    END;
    ALTER TABLE public.opportunities DROP COLUMN priority_int_legacy;
  ELSIF col_type IS NULL THEN
    ALTER TABLE public.opportunities ADD COLUMN priority TEXT;
  END IF;
END $$;

ALTER TABLE public.opportunities DROP CONSTRAINT IF EXISTS opportunities_priority_check;
ALTER TABLE public.opportunities
  ADD CONSTRAINT opportunities_priority_check
  CHECK (priority IS NULL OR priority IN ('low', 'medium', 'high', 'urgent'));

-- 2) queue_status must stay within campaign CHECK — ensure default is valid
ALTER TABLE public.opportunities
  ALTER COLUMN queue_status SET DEFAULT 'pending_review';

-- 3) Expand automation run statuses for partial / retry / waiting
ALTER TABLE public.backlink_automation_runs DROP CONSTRAINT IF EXISTS backlink_automation_runs_status_check;
ALTER TABLE public.backlink_automation_runs
  ADD CONSTRAINT backlink_automation_runs_status_check
  CHECK (status IN (
    'queued', 'running', 'retrying', 'waiting',
    'completed', 'partially_completed', 'failed', 'cancelled'
  ));

-- 4) Live execution logs for AI Thinking (no fake UI loop)
CREATE TABLE IF NOT EXISTS public.backlink_automation_run_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.backlink_automation_runs(id) ON DELETE CASCADE,
  import_id UUID REFERENCES public.backlink_imports(id) ON DELETE SET NULL,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('debug', 'info', 'warn', 'error')),
  stage TEXT NOT NULL,
  message TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_run_logs_run
  ON public.backlink_automation_run_logs(run_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_automation_run_logs_ws
  ON public.backlink_automation_run_logs(workspace_id, created_at DESC);

ALTER TABLE public.backlink_automation_run_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS backlink_automation_run_logs_all ON public.backlink_automation_run_logs;
CREATE POLICY backlink_automation_run_logs_all ON public.backlink_automation_run_logs
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

-- 5) Analytics snapshot table for Mission Control / reports after pipeline
CREATE TABLE IF NOT EXISTS public.backlink_automation_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  day DATE NOT NULL DEFAULT (CURRENT_DATE),
  imported_websites INT NOT NULL DEFAULT 0,
  analyzed_websites INT NOT NULL DEFAULT 0,
  qualified_opportunities INT NOT NULL DEFAULT 0,
  generated_drafts INT NOT NULL DEFAULT 0,
  pending_approvals INT NOT NULL DEFAULT 0,
  relationships INT NOT NULL DEFAULT 0,
  submissions INT NOT NULL DEFAULT 0,
  verified_backlinks INT NOT NULL DEFAULT 0,
  campaigns INT NOT NULL DEFAULT 0,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, day)
);

CREATE INDEX IF NOT EXISTS idx_automation_analytics_ws_day
  ON public.backlink_automation_analytics(workspace_id, day DESC);

ALTER TABLE public.backlink_automation_analytics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS backlink_automation_analytics_all ON public.backlink_automation_analytics;
CREATE POLICY backlink_automation_analytics_all ON public.backlink_automation_analytics
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
