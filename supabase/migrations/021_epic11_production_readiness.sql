-- 021_epic11_production_readiness.sql
-- Version 0.99: Production Readiness — indexes, ops events (no new product features)

-- Hot-path indexes for Mission Control / Analytics / Integrations
CREATE INDEX IF NOT EXISTS idx_platform_events_workspace_type_created
  ON public.platform_events(workspace_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_runs_workspace_status_created
  ON public.agent_runs(workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_technical_issues_workspace_status_severity
  ON public.technical_issues(workspace_id, status, severity);

CREATE INDEX IF NOT EXISTS idx_integration_connections_org_provider_status
  ON public.integration_connections(org_id, provider_key, status);

CREATE INDEX IF NOT EXISTS idx_report_runs_workspace_status_created
  ON public.report_runs(workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workspace_status_created
  ON public.workflow_runs(workspace_id, status, created_at DESC);

-- Lightweight ops telemetry (service-role writes; org members can read)
CREATE TABLE IF NOT EXISTS public.ops_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'api',
  status TEXT NOT NULL DEFAULT 'ok',
  checks JSONB NOT NULL DEFAULT '{}'::jsonb,
  latency_ms NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_health_created
  ON public.ops_health_snapshots(created_at DESC);

ALTER TABLE public.ops_health_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_health_select ON public.ops_health_snapshots;
CREATE POLICY ops_health_select ON public.ops_health_snapshots
  FOR SELECT USING (
    (org_id IS NOT NULL AND public.is_org_member(org_id))
    OR (workspace_id IS NOT NULL AND public.can_access_workspace(workspace_id))
  );
