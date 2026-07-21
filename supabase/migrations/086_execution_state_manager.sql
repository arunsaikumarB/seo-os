-- 086_execution_state_manager.sql
-- Canonical Deleted / Ignored / Approved / Rejected statuses for Execution State Manager.

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
    'skipped', 'unsupported',
    'deleted', 'ignored', 'approved', 'rejected'
  ));

CREATE INDEX IF NOT EXISTS idx_execution_jobs_disposition
  ON public.execution_jobs(workspace_id, disposition)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_execution_jobs_public_status
  ON public.execution_jobs(workspace_id, status)
  WHERE deleted_at IS NULL AND status IN (
    'deleted', 'ignored', 'skipped', 'failed', 'submitted', 'verified', 'approved', 'rejected'
  );
