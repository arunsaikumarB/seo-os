-- 008_campaign_engine.sql
-- Sprint 5: Campaigns, opportunity queue, approvals, AI planner foundation

-- Extensible campaign types registry
CREATE TABLE public.campaign_types (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.campaign_types (id, display_name, description) VALUES
  ('guest_post', 'Guest Posts', 'Outreach for guest post placements'),
  ('resource_page', 'Resource Pages', 'Resource page link building'),
  ('broken_link', 'Broken Links', 'Broken link reclamation'),
  ('directory', 'Business Directories', 'Directory and citation listings'),
  ('citation', 'Citations', 'NAP/citation building'),
  ('qa_site', 'Q&A Sites', 'Quora, Reddit, and Q&A platforms'),
  ('forum', 'Forums', 'Forum participation and links'),
  ('podcast', 'Podcasts', 'Podcast guest outreach'),
  ('partnership', 'Partnerships', 'Strategic partnership outreach'),
  ('press_release', 'Press Releases', 'Digital PR and press'),
  ('digital_pr', 'Digital PR', 'Digital PR campaigns')
ON CONFLICT (id) DO NOTHING;

-- Widen opportunity types (drop Sprint 4 constraint, use registry)
ALTER TABLE public.opportunities DROP CONSTRAINT IF EXISTS opportunities_opportunity_type_check;
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS queue_status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (queue_status IN ('pending_review', 'approved', 'rejected', 'archived')),
  ADD COLUMN IF NOT EXISTS ai_recommendation TEXT,
  ADD COLUMN IF NOT EXISTS campaign_id UUID;

-- Opportunity status expanded for queue
ALTER TABLE public.opportunities DROP CONSTRAINT IF EXISTS opportunities_status_check;
ALTER TABLE public.opportunities
  ADD CONSTRAINT opportunities_status_check
  CHECK (status IN ('discovered', 'qualified', 'approved', 'dismissed', 'in_campaign'));

CREATE TABLE public.campaign_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_type TEXT NOT NULL REFERENCES public.campaign_types(id),
  name TEXT NOT NULL,
  description TEXT,
  default_goals JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_type TEXT NOT NULL REFERENCES public.campaign_types(id),
  template_id UUID REFERENCES public.campaign_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'active', 'paused', 'completed', 'cancelled')),
  goals JSONB NOT NULL DEFAULT '[]'::jsonb,
  plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  progress INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.opportunities
  ADD CONSTRAINT opportunities_campaign_id_fkey
  FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;

CREATE TABLE public.campaign_opportunities (
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, opportunity_id)
);

CREATE TABLE public.campaign_timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  approval_type TEXT NOT NULL
    CHECK (approval_type IN ('opportunity', 'email_draft', 'content_draft', 'campaign_launch')),
  subject_id UUID NOT NULL,
  subject_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  title TEXT NOT NULL,
  summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_by UUID REFERENCES public.profiles(id),
  reviewed_by UUID REFERENCES public.profiles(id),
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE TABLE public.email_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected')),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.content_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected')),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed global templates
INSERT INTO public.campaign_templates (campaign_type, name, description, default_goals, default_config)
SELECT id, display_name || ' — Standard', description,
  '["Increase referring domains", "Build topical authority"]'::jsonb,
  '{"duration_weeks": 8, "target_prospects": 25}'::jsonb
FROM public.campaign_types;

CREATE INDEX idx_campaigns_workspace_status ON public.campaigns(workspace_id, status);
CREATE INDEX idx_campaigns_workspace_type ON public.campaigns(workspace_id, campaign_type);
CREATE INDEX idx_campaign_timeline ON public.campaign_timeline_events(campaign_id, created_at DESC);
CREATE INDEX idx_approvals_workspace_status ON public.approvals(workspace_id, status);
CREATE INDEX idx_opportunities_queue ON public.opportunities(workspace_id, queue_status, priority DESC);
CREATE INDEX idx_opportunities_campaign ON public.opportunities(campaign_id);

ALTER TABLE public.campaign_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY campaign_types_select ON public.campaign_types FOR SELECT TO authenticated USING (true);

CREATE POLICY campaign_templates_select ON public.campaign_templates
  FOR SELECT TO authenticated
  USING (workspace_id IS NULL OR public.can_access_workspace(workspace_id));

CREATE POLICY campaigns_all ON public.campaigns
  FOR ALL TO authenticated
  USING (public.can_access_workspace(workspace_id))
  WITH CHECK (public.can_access_workspace(workspace_id));

CREATE POLICY campaign_opportunities_all ON public.campaign_opportunities
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND public.can_access_workspace(c.workspace_id))
  );

CREATE POLICY campaign_timeline_select ON public.campaign_timeline_events
  FOR SELECT TO authenticated USING (public.can_access_workspace(workspace_id));

CREATE POLICY approvals_all ON public.approvals
  FOR ALL TO authenticated
  USING (public.can_access_workspace(workspace_id))
  WITH CHECK (public.can_access_workspace(workspace_id));

CREATE POLICY email_drafts_all ON public.email_drafts
  FOR ALL TO authenticated
  USING (public.can_access_workspace(workspace_id))
  WITH CHECK (public.can_access_workspace(workspace_id));

CREATE POLICY content_drafts_all ON public.content_drafts
  FOR ALL TO authenticated
  USING (public.can_access_workspace(workspace_id))
  WITH CHECK (public.can_access_workspace(workspace_id));

CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER campaign_templates_updated_at
  BEFORE UPDATE ON public.campaign_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER email_drafts_updated_at
  BEFORE UPDATE ON public.email_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER content_drafts_updated_at
  BEFORE UPDATE ON public.content_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
