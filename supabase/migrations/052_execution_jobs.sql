-- 052_execution_jobs.sql — BEE execution jobs

CREATE TABLE IF NOT EXISTS public.execution_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  submission_id UUID,
  session_id UUID REFERENCES public.browser_sessions(id) ON DELETE SET NULL,
  legacy_plan_id UUID REFERENCES public.browser_action_plans(id) ON DELETE SET NULL,
  mode TEXT NOT NULL DEFAULT 'prepare'
    CHECK (mode IN ('prepare', 'preview', 'manual', 'automatic_eligible')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued', 'preparing', 'launching_browser', 'authenticating', 'navigating',
      'analyzing_form', 'uploading_assets', 'filling_fields', 'validating',
      'ready_for_review', 'awaiting_user', 'submitting', 'waiting_verification',
      'completed', 'failed', 'cancelled', 'retry_scheduled',
      'paused', 'needs_approval',
      'blocked_captcha', 'blocked_mfa', 'blocked_email_verify', 'blocked_phone_verify'
    )),
  current_step_index INT NOT NULL DEFAULT 0,
  plan_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  mapping_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  site_domain TEXT,
  eta_seconds INT,
  error_code TEXT,
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_execution_jobs_ws_status
  ON public.execution_jobs(workspace_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_execution_jobs_opportunity
  ON public.execution_jobs(opportunity_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.execution_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY execution_jobs_all ON public.execution_jobs
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
