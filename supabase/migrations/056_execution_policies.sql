-- 056_execution_policies.sql

CREATE TABLE IF NOT EXISTS public.execution_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE UNIQUE,
  submission_policy TEXT NOT NULL DEFAULT 'always_ask'
    CHECK (submission_policy IN ('always_ask', 'trusted_websites', 'automatic_eligible')),
  trusted_domains JSONB NOT NULL DEFAULT '[]'::jsonb,
  daily_goal INT NOT NULL DEFAULT 20,
  max_submissions_per_day INT NOT NULL DEFAULT 50,
  max_parallel_sessions INT NOT NULL DEFAULT 1,
  submission_speed TEXT NOT NULL DEFAULT 'normal'
    CHECK (submission_speed IN ('slow', 'normal', 'fast')),
  working_hours JSONB NOT NULL DEFAULT '{"start":"09:00","end":"17:00","tz":"UTC"}'::jsonb,
  retry_count INT NOT NULL DEFAULT 2,
  cooldown_seconds INT NOT NULL DEFAULT 300,
  require_approval_before_submit BOOLEAN NOT NULL DEFAULT true,
  compliance_level TEXT NOT NULL DEFAULT 'strict'
    CHECK (compliance_level IN ('strict', 'standard')),
  approval_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  compliance_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.execution_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY execution_policies_all ON public.execution_policies
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
