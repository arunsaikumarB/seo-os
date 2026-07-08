-- 005_ai_foundation.sql
-- Sprint 2: AI foundation tables (subset of Database Freeze ai_core + ai_config)

CREATE TABLE public.agent_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sync_mode TEXT NOT NULL DEFAULT 'async' CHECK (sync_mode IN ('sync', 'async')),
  default_approval TEXT NOT NULL DEFAULT 'none'
    CHECK (default_approval IN ('none', 'optional', 'review', 'required')),
  output_schema_id TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued', 'running', 'completed', 'failed', 'cancelled')),
  provider TEXT,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  error TEXT,
  tokens_input INT NOT NULL DEFAULT 0,
  tokens_output INT NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12, 6),
  triggered_by UUID REFERENCES public.profiles(id),
  parent_run_id UUID REFERENCES public.agent_runs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE public.agent_run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  step_index INT NOT NULL,
  step_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, agent_type, version)
);

CREATE TABLE public.ai_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  primary_provider TEXT NOT NULL DEFAULT 'gemini',
  fallback_provider TEXT DEFAULT 'ollama',
  temperature NUMERIC(3, 2) NOT NULL DEFAULT 0.70,
  max_tokens INT NOT NULL DEFAULT 2048,
  feature_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_usage_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_run_id UUID REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT,
  tokens_input INT NOT NULL DEFAULT 0,
  tokens_output INT NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12, 6),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_run_id UUID REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_runs_workspace_created ON public.agent_runs(workspace_id, created_at DESC);
CREATE INDEX idx_agent_runs_workspace_type ON public.agent_runs(workspace_id, agent_type);
CREATE INDEX idx_agent_run_steps_run ON public.agent_run_steps(run_id);
CREATE INDEX idx_ai_events_workspace_created ON public.ai_events(workspace_id, created_at DESC);
CREATE INDEX idx_ai_usage_workspace ON public.ai_usage_ledger(workspace_id, recorded_at DESC);

-- Seed Sprint 2 workforce agent definitions (8 agents)
INSERT INTO public.agent_definitions (agent_type, display_name, description, sync_mode, default_approval, output_schema_id)
VALUES
  ('ceo', 'CEO Agent', 'Strategic oversight and execution planning', 'async', 'optional', 'ceo_plan_v1'),
  ('seo_strategist', 'SEO Strategist', 'SEO strategy and prioritization', 'async', 'review', 'seo_strategy_v1'),
  ('research_manager', 'Research Manager', 'Orchestrates research workflows', 'async', 'none', 'research_plan_v1'),
  ('competitor_intelligence', 'Competitor Intelligence', 'Competitive landscape analysis', 'async', 'none', 'competitor_intel_v1'),
  ('prospect_discovery', 'Prospect Discovery', 'Discovers link-building prospects', 'async', 'review', 'prospect_discovery_v1'),
  ('content_strategist', 'Content Strategist', 'Content planning and briefs', 'async', 'none', 'content_strategy_v1'),
  ('outreach_manager', 'Outreach Manager', 'Outreach campaign coordination', 'async', 'review', 'outreach_plan_v1'),
  ('qa', 'Quality Assurance Agent', 'Validates agent outputs', 'async', 'none', 'qa_result_v1');

-- RLS
ALTER TABLE public.agent_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_definitions_select ON public.agent_definitions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY agent_runs_select ON public.agent_runs
  FOR SELECT TO authenticated USING (public.can_access_workspace(workspace_id));

CREATE POLICY agent_runs_insert ON public.agent_runs
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_workspace(workspace_id));

CREATE POLICY agent_runs_update ON public.agent_runs
  FOR UPDATE TO authenticated
  USING (public.can_access_workspace(workspace_id));

CREATE POLICY agent_run_steps_select ON public.agent_run_steps
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_runs r
      WHERE r.id = run_id AND public.can_access_workspace(r.workspace_id)
    )
  );

CREATE POLICY prompt_templates_select ON public.prompt_templates
  FOR SELECT TO authenticated
  USING (workspace_id IS NULL OR public.can_access_workspace(workspace_id));

CREATE POLICY ai_settings_select ON public.ai_settings
  FOR SELECT TO authenticated USING (public.can_access_workspace(workspace_id));

CREATE POLICY ai_usage_select ON public.ai_usage_ledger
  FOR SELECT TO authenticated USING (public.can_access_workspace(workspace_id));

CREATE POLICY ai_events_select ON public.ai_events
  FOR SELECT TO authenticated
  USING (workspace_id IS NULL OR public.can_access_workspace(workspace_id));

CREATE TRIGGER agent_definitions_updated_at
  BEFORE UPDATE ON public.agent_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER prompt_templates_updated_at
  BEFORE UPDATE ON public.prompt_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER ai_settings_updated_at
  BEFORE UPDATE ON public.ai_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
