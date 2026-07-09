-- 011_epic2_automation_engine.sql
-- Epic 2: Backlink Automation Engine

-- Import sessions
CREATE TABLE IF NOT EXISTS public.backlink_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('csv', 'excel', 'txt', 'manual', 'url_list')),
  file_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'validating', 'validated', 'analyzing', 'analyzed',
    'classifying', 'classified', 'generating', 'completed', 'failed'
  )),
  total_rows INT NOT NULL DEFAULT 0,
  valid_rows INT NOT NULL DEFAULT 0,
  duplicate_rows INT NOT NULL DEFAULT 0,
  invalid_rows INT NOT NULL DEFAULT 0,
  opportunities_created INT NOT NULL DEFAULT 0,
  content_generated INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Individual import rows
CREATE TABLE IF NOT EXISTS public.backlink_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES public.backlink_imports(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  row_number INT NOT NULL,
  raw_url TEXT NOT NULL,
  normalized_url TEXT,
  normalized_domain TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'valid', 'duplicate', 'invalid')),
  error_message TEXT,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Domain analysis results
CREATE TABLE IF NOT EXISTS public.backlink_domain_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  import_row_id UUID REFERENCES public.backlink_import_rows(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  website_name TEXT,
  niche TEXT,
  language TEXT DEFAULT 'en',
  country TEXT,
  domain_rating INT,
  monthly_traffic INT,
  detected_pages JSONB NOT NULL DEFAULT '{}'::jsonb,
  opportunity_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Automation pipeline runs
CREATE TABLE IF NOT EXISTS public.backlink_automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  import_id UUID REFERENCES public.backlink_imports(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  current_step TEXT,
  progress INT NOT NULL DEFAULT 0,
  steps_completed JSONB NOT NULL DEFAULT '[]'::jsonb,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Submission tracking (semi-automation assistance)
CREATE TABLE IF NOT EXISTS public.backlink_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  submission_type TEXT,
  assisted_mode TEXT CHECK (assisted_mode IN ('directory', 'profile', 'citation', 'forum', 'qa', 'manual')),
  status TEXT NOT NULL DEFAULT 'prepared' CHECK (status IN (
    'prepared', 'submitted', 'waiting', 'accepted', 'rejected', 'published'
  )),
  notes TEXT,
  submitted_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Extend opportunities for automation lifecycle
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS automation_status TEXT DEFAULT 'imported',
  ADD COLUMN IF NOT EXISTS relevance_score INT,
  ADD COLUMN IF NOT EXISTS priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  ADD COLUMN IF NOT EXISTS recommended_action TEXT,
  ADD COLUMN IF NOT EXISTS import_id UUID REFERENCES public.backlink_imports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS domain_analysis_id UUID REFERENCES public.backlink_domain_analyses(id) ON DELETE SET NULL;

-- Extend verification checks
ALTER TABLE public.backlink_checks
  ADD COLUMN IF NOT EXISTS check_type TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS redirect_url TEXT,
  ADD COLUMN IF NOT EXISTS is_broken BOOLEAN DEFAULT false;

-- Expand AI draft types
ALTER TABLE public.backlink_ai_drafts DROP CONSTRAINT IF EXISTS backlink_ai_drafts_draft_type_check;
ALTER TABLE public.backlink_ai_drafts ADD CONSTRAINT backlink_ai_drafts_draft_type_check
  CHECK (draft_type IN (
    'email', 'guest_post', 'press_release', 'outreach_strategy', 'website_summary',
    'directory_description', 'profile_description', 'forum_response', 'qa_answer',
    'resource_suggestion', 'broken_link_replacement'
  ));

CREATE INDEX IF NOT EXISTS idx_backlink_imports_ws ON public.backlink_imports(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backlink_import_rows_import ON public.backlink_import_rows(import_id, status);
CREATE INDEX IF NOT EXISTS idx_backlink_domain_analyses_ws ON public.backlink_domain_analyses(workspace_id, domain);
CREATE INDEX IF NOT EXISTS idx_backlink_automation_runs_ws ON public.backlink_automation_runs(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_backlink_submissions_opp ON public.backlink_submissions(opportunity_id, status);
CREATE INDEX IF NOT EXISTS idx_opportunities_automation ON public.opportunities(workspace_id, automation_status);
CREATE INDEX IF NOT EXISTS idx_opportunities_import ON public.opportunities(import_id);

ALTER TABLE public.backlink_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backlink_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backlink_domain_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backlink_automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backlink_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY backlink_imports_all ON public.backlink_imports
  FOR ALL TO authenticated USING (public.can_access_workspace(workspace_id)) WITH CHECK (public.can_access_workspace(workspace_id));
CREATE POLICY backlink_import_rows_all ON public.backlink_import_rows
  FOR ALL TO authenticated USING (public.can_access_workspace(workspace_id)) WITH CHECK (public.can_access_workspace(workspace_id));
CREATE POLICY backlink_domain_analyses_all ON public.backlink_domain_analyses
  FOR ALL TO authenticated USING (public.can_access_workspace(workspace_id)) WITH CHECK (public.can_access_workspace(workspace_id));
CREATE POLICY backlink_automation_runs_all ON public.backlink_automation_runs
  FOR ALL TO authenticated USING (public.can_access_workspace(workspace_id)) WITH CHECK (public.can_access_workspace(workspace_id));
CREATE POLICY backlink_submissions_all ON public.backlink_submissions
  FOR ALL TO authenticated USING (public.can_access_workspace(workspace_id)) WITH CHECK (public.can_access_workspace(workspace_id));

CREATE TRIGGER backlink_submissions_updated_at
  BEFORE UPDATE ON public.backlink_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
