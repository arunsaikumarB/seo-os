-- 081_bee_auto_resume.sql — BEE watchers, auto-resume, session reuse, queue continue
-- Never bypasses CAPTCHA/MFA/email/phone/login — only continues after user completes the gate.

-- Extended execution job states (watching + ready_to_continue + submitted/verified)
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
    'ready_to_continue', 'submitted', 'verified'
  ));

ALTER TABLE public.execution_jobs
  ADD COLUMN IF NOT EXISTS pause_reason TEXT,
  ADD COLUMN IF NOT EXISTS resume_reason TEXT,
  ADD COLUMN IF NOT EXISTS watch_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS watch_finished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS watch_duration_ms INT,
  ADD COLUMN IF NOT EXISTS auto_resumed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS queue_batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_execution_jobs_queue_batch
  ON public.execution_jobs(workspace_id, queue_batch_id, created_at)
  WHERE deleted_at IS NULL AND queue_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_execution_jobs_watching
  ON public.execution_jobs(workspace_id, status)
  WHERE deleted_at IS NULL AND status LIKE 'watching%';

-- Workspace watcher / auto-resume policy knobs
ALTER TABLE public.execution_policies
  ADD COLUMN IF NOT EXISTS auto_resume BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS watch_interval_ms INT NOT NULL DEFAULT 2000,
  ADD COLUMN IF NOT EXISTS max_watch_ms INT NOT NULL DEFAULT 1800000,
  ADD COLUMN IF NOT EXISTS session_reuse BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS queue_auto_continue BOOLEAN NOT NULL DEFAULT true;

-- Daily stats extras (JSON meta already exists; add typed counters)
ALTER TABLE public.execution_statistics
  ADD COLUMN IF NOT EXISTS watching INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_resumed INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_after_captcha INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_after_login INT NOT NULL DEFAULT 0;

-- Session reuse helpers
ALTER TABLE public.browser_sessions
  ADD COLUMN IF NOT EXISTS last_reuse_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS session_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auth_detected BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_browser_sessions_reuse
  ON public.browser_sessions(workspace_id, site_domain, status)
  WHERE deleted_at IS NULL AND storage_state_enc IS NOT NULL;
