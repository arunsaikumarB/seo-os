-- Enterprise Browser Runtime Management

ALTER TABLE public.execution_jobs DROP CONSTRAINT IF EXISTS execution_jobs_status_check;
ALTER TABLE public.execution_jobs
  ADD CONSTRAINT execution_jobs_status_check CHECK (status IN (
    'queued', 'preparing', 'launching_browser', 'authenticating', 'navigating',
    'analyzing_form', 'uploading_assets', 'filling_fields', 'validating',
    'ready_for_review', 'awaiting_user', 'submitting', 'waiting_verification',
    'completed', 'failed', 'cancelled', 'retry_scheduled', 'paused', 'needs_approval',
    'blocked_captcha', 'blocked_mfa', 'blocked_email_verify', 'blocked_phone_verify',
    'watching', 'watching_captcha', 'watching_login', 'watching_mfa',
    'watching_email', 'watching_phone', 'ready_to_continue', 'submitted', 'verified',
    'waiting_infrastructure'
  ));

CREATE TABLE IF NOT EXISTS public.browser_runtime_status (
  id TEXT PRIMARY KEY DEFAULT 'global',
  playwright_installed BOOLEAN NOT NULL DEFAULT false,
  chromium_exists BOOLEAN NOT NULL DEFAULT false,
  executable_exists BOOLEAN NOT NULL DEFAULT false,
  launch_ok BOOLEAN NOT NULL DEFAULT false,
  browser_version TEXT,
  executable_path TEXT,
  playwright_version TEXT,
  cache_size_bytes BIGINT,
  installed_browsers JSONB NOT NULL DEFAULT '[]'::jsonb,
  install_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (install_status IN ('unknown', 'installing', 'installed', 'failed', 'not_needed')),
  health TEXT NOT NULL DEFAULT 'unknown'
    CHECK (health IN ('unknown', 'healthy', 'missing', 'degraded', 'installing')),
  last_error TEXT,
  last_verification_at TIMESTAMPTZ,
  install_progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.browser_runtime_status (id)
VALUES ('global')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.browser_runtime_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY browser_runtime_status_read ON public.browser_runtime_status
  FOR SELECT USING (true);
