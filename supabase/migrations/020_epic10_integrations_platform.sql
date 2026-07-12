-- 020_epic10_integrations_platform.sql
-- Version 0.98: Integrations Platform
-- Additive — connections, encrypted credentials, sync queue/logs, usage

CREATE TABLE IF NOT EXISTS public.integration_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN (
    'disconnected', 'connecting', 'connected', 'error', 'revoked'
  )),
  auth_type TEXT NOT NULL DEFAULT 'oauth' CHECK (auth_type IN (
    'oauth', 'api_key', 'smtp', 'webhook', 'app_password'
  )),
  scopes TEXT[] NOT NULL DEFAULT '{}',
  external_account_id TEXT,
  external_account_label TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at TIMESTAMPTZ,
  last_health_at TIMESTAMPTZ,
  health_status TEXT NOT NULL DEFAULT 'unknown' CHECK (health_status IN (
    'unknown', 'healthy', 'degraded', 'down'
  )),
  health_message TEXT,
  error_message TEXT,
  connected_by UUID,
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_connections_unique
  ON public.integration_connections (
    org_id,
    provider_key,
    COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(external_account_id, '')
  );

CREATE INDEX IF NOT EXISTS idx_integration_connections_org
  ON public.integration_connections(org_id, status);
CREATE INDEX IF NOT EXISTS idx_integration_connections_workspace
  ON public.integration_connections(workspace_id, status)
  WHERE workspace_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.integration_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL UNIQUE REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT,
  key_version INT NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ,
  rotated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.integration_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'incremental' CHECK (mode IN (
    'full', 'incremental', 'manual', 'scheduled'
  )),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'running', 'completed', 'failed', 'cancelled', 'conflict'
  )),
  progress INT NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  attempt INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  cursor JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_sync_jobs_queue
  ON public.integration_sync_jobs(status, scheduled_for, created_at);
CREATE INDEX IF NOT EXISTS idx_integration_sync_jobs_connection
  ON public.integration_sync_jobs(connection_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.integration_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_job_id UUID NOT NULL REFERENCES public.integration_sync_jobs(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('debug', 'info', 'warn', 'error')),
  message TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_sync_logs_job
  ON public.integration_sync_logs(sync_job_id, created_at);

CREATE TABLE IF NOT EXISTS public.integration_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  metric_value NUMERIC NOT NULL DEFAULT 0,
  period_start DATE NOT NULL DEFAULT CURRENT_DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, metric_key, period_start)
);

CREATE TABLE IF NOT EXISTS public.integration_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL,
  snapshot_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_snapshots_lookup
  ON public.integration_snapshots(workspace_id, provider_key, snapshot_type, synced_at DESC);

ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS integration_connections_select ON public.integration_connections;
CREATE POLICY integration_connections_select ON public.integration_connections
  FOR SELECT USING (
    public.is_org_member(org_id)
    OR (workspace_id IS NOT NULL AND public.can_access_workspace(workspace_id))
  );

DROP POLICY IF EXISTS integration_sync_jobs_select ON public.integration_sync_jobs;
CREATE POLICY integration_sync_jobs_select ON public.integration_sync_jobs
  FOR SELECT USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS integration_sync_logs_select ON public.integration_sync_logs;
CREATE POLICY integration_sync_logs_select ON public.integration_sync_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.integration_connections c
      WHERE c.id = connection_id AND public.is_org_member(c.org_id)
    )
  );

DROP POLICY IF EXISTS integration_usage_select ON public.integration_usage;
CREATE POLICY integration_usage_select ON public.integration_usage
  FOR SELECT USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS integration_snapshots_select ON public.integration_snapshots;
CREATE POLICY integration_snapshots_select ON public.integration_snapshots
  FOR SELECT USING (
    public.is_org_member(org_id)
    OR (workspace_id IS NOT NULL AND public.can_access_workspace(workspace_id))
  );

-- Credentials: no direct client SELECT (service role only)
DROP POLICY IF EXISTS integration_credentials_deny ON public.integration_credentials;
CREATE POLICY integration_credentials_deny ON public.integration_credentials
  FOR SELECT USING (false);
