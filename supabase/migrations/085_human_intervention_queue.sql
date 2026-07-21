-- 085_human_intervention_queue.sql
-- Dedicated Human Intervention Queue: skip/unsupported statuses, prefs, global ignore list.

ALTER TABLE public.execution_jobs DROP CONSTRAINT IF EXISTS execution_jobs_status_check;
ALTER TABLE public.execution_jobs
  ADD CONSTRAINT execution_jobs_status_check CHECK (status IN (
    'queued', 'preparing', 'launching_browser', 'authenticating', 'navigating',
    'analyzing_form', 'uploading_assets', 'filling_fields', 'validating',
    'ready_for_review', 'awaiting_user', 'submitting', 'waiting_verification',
    'completed', 'failed', 'cancelled', 'retry_scheduled',
    'paused', 'needs_approval',
    'blocked_captcha', 'blocked_mfa', 'blocked_email_verify', 'blocked_phone_verify',
    'watching', 'watching_captcha', 'watching_login', 'watching_mfa',
    'watching_email', 'watching_phone',
    'ready_to_continue', 'submitted', 'verified',
    'waiting_infrastructure',
    'skipped', 'unsupported'
  ));

ALTER TABLE public.execution_jobs
  ADD COLUMN IF NOT EXISTS disposition TEXT,
  ADD COLUMN IF NOT EXISTS disposition_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disposition_by UUID;

-- Intervention preferences (workspace)
ALTER TABLE public.execution_policies
  ADD COLUMN IF NOT EXISTS pause_for_login BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pause_for_captcha BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pause_for_email_verify BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_skip_login BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_skip_captcha BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS never_ask_login BOOLEAN NOT NULL DEFAULT false;

-- Global Ignore List — org-scoped so all future projects skip these domains
CREATE TABLE IF NOT EXISTS public.execution_global_ignore (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  site_domain TEXT NOT NULL,
  reason TEXT,
  source_workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  source_job_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, site_domain)
);

CREATE INDEX IF NOT EXISTS idx_execution_global_ignore_org
  ON public.execution_global_ignore(org_id, site_domain);

ALTER TABLE public.execution_global_ignore ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS execution_global_ignore_all ON public.execution_global_ignore;
CREATE POLICY execution_global_ignore_all ON public.execution_global_ignore
  FOR ALL USING (
    org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
  );
