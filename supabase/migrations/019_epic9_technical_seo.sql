-- 019_epic9_technical_seo.sql
-- Version 0.97: AI Technical SEO Engine
-- Additive — audits, issues, health scores, crawl jobs

CREATE TABLE IF NOT EXISTS public.technical_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  target_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'crawling', 'analyzing', 'completed', 'failed', 'cancelled'
  )),
  audit_mode TEXT NOT NULL DEFAULT 'full' CHECK (audit_mode IN ('full', 'incremental', 'quick')),
  pages_crawled INT NOT NULL DEFAULT 0,
  issues_found INT NOT NULL DEFAULT 0,
  health_score NUMERIC,
  progress INT NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_technical_audits_workspace
  ON public.technical_audits(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.technical_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  audit_id UUID NOT NULL REFERENCES public.technical_audits(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  issue_code TEXT NOT NULL,
  title TEXT NOT NULL,
  page_url TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'in_progress', 'fixed', 'ignored', 'reopened'
  )),
  business_impact TEXT,
  seo_impact TEXT,
  explanation TEXT,
  recommended_fix TEXT,
  estimated_fix_minutes INT,
  confidence_score NUMERIC,
  suggested_fix JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_technical_issues_workspace
  ON public.technical_issues(workspace_id, severity, status);
CREATE INDEX IF NOT EXISTS idx_technical_issues_audit
  ON public.technical_issues(audit_id);

CREATE TABLE IF NOT EXISTS public.technical_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  audit_id UUID REFERENCES public.technical_audits(id) ON DELETE SET NULL,
  overall_score NUMERIC NOT NULL,
  performance_score NUMERIC,
  seo_score NUMERIC,
  accessibility_score NUMERIC,
  content_score NUMERIC,
  security_score NUMERIC,
  technical_score NUMERIC,
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_technical_health_workspace
  ON public.technical_health_snapshots(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.technical_crawl_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  audit_id UUID REFERENCES public.technical_audits(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'crawling', 'done', 'failed', 'skipped'
  )),
  depth INT NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_technical_crawl_queue
  ON public.technical_crawl_queue(workspace_id, status);

ALTER TABLE public.technical_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_crawl_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS technical_audits_select ON public.technical_audits;
CREATE POLICY technical_audits_select ON public.technical_audits
  FOR SELECT USING (public.can_access_workspace(workspace_id));

DROP POLICY IF EXISTS technical_issues_select ON public.technical_issues;
CREATE POLICY technical_issues_select ON public.technical_issues
  FOR SELECT USING (public.can_access_workspace(workspace_id));

DROP POLICY IF EXISTS technical_health_select ON public.technical_health_snapshots;
CREATE POLICY technical_health_select ON public.technical_health_snapshots
  FOR SELECT USING (public.can_access_workspace(workspace_id));

DROP POLICY IF EXISTS technical_crawl_select ON public.technical_crawl_queue;
CREATE POLICY technical_crawl_select ON public.technical_crawl_queue
  FOR SELECT USING (public.can_access_workspace(workspace_id));

-- Allow Technical SEO workflow triggers (additive to Epic 6 check constraint)
DO $$
BEGIN
  ALTER TABLE public.workflows DROP CONSTRAINT IF EXISTS workflows_trigger_type_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.workflows
  ADD CONSTRAINT workflows_trigger_type_check CHECK (trigger_type IN (
    'manual',
    'scheduled',
    'website_scan_completed',
    'opportunity_discovered',
    'campaign_created',
    'approval_granted',
    'reply_received',
    'backlink_verified',
    'critical_seo_issue_detected',
    'technical_audit_completed'
  ));
