-- 051_browser_sessions.sql — BEE browser sessions (SoT for runtime)

CREATE TABLE IF NOT EXISTS public.browser_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  profile_id UUID,
  profile_key TEXT NOT NULL DEFAULT 'default',
  mode TEXT NOT NULL DEFAULT 'headless'
    CHECK (mode IN ('headless', 'headed')),
  status TEXT NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle', 'running', 'paused', 'closed', 'error')),
  site_domain TEXT,
  site_account_id UUID,
  storage_state_enc TEXT,
  cookies_ref UUID,
  context_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  health_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (health_status IN ('unknown', 'healthy', 'degraded', 'down')),
  last_health_at TIMESTAMPTZ,
  last_error TEXT,
  playwright_pid TEXT,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_browser_sessions_ws_status
  ON public.browser_sessions(workspace_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_browser_sessions_domain
  ON public.browser_sessions(workspace_id, site_domain)
  WHERE deleted_at IS NULL;

ALTER TABLE public.browser_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY browser_sessions_all ON public.browser_sessions
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
