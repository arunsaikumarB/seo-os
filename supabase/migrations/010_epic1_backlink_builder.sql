-- 010_epic1_backlink_builder.sql
-- Epic 1: Backlink Builder v1.0 — production lifecycle

-- Migrate legacy pipeline status
UPDATE public.prospects SET pipeline_status = 'campaign_ready' WHERE pipeline_status = 'outreach_ready';

-- Expand opportunities with enrichment + lifecycle
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS pipeline_stage TEXT DEFAULT 'discovered',
  ADD COLUMN IF NOT EXISTS website_name TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS domain_rating INT,
  ADD COLUMN IF NOT EXISTS monthly_traffic INT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS spam_score INT,
  ADD COLUMN IF NOT EXISTS success_probability INT,
  ADD COLUMN IF NOT EXISTS reply_rate_prediction INT,
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_anchor TEXT,
  ADD COLUMN IF NOT EXISTS suggested_target_page TEXT,
  ADD COLUMN IF NOT EXISTS outreach_strategy TEXT;

-- Seed additional backlink types (Epic 1 — 34 total)
INSERT INTO public.backlink_types (id, category, display_name, description) VALUES
  ('case_study', 'content_based', 'Case Studies', 'Case study placements'),
  ('whitepaper', 'content_based', 'Whitepapers', 'Whitepaper link building'),
  ('statistics_page', 'content_based', 'Statistics Pages', 'Original statistics outreach'),
  ('reddit', 'community_based', 'Reddit', 'Reddit community mentions'),
  ('quora', 'community_based', 'Quora', 'Quora Q&A placements'),
  ('supplier_link', 'business_based', 'Supplier Links', 'Supplier and vendor links'),
  ('unlinked_mention', 'outreach_based', 'Unlinked Mentions', 'Unlinked brand mention reclamation'),
  ('haro', 'outreach_based', 'HARO', 'Help a Reporter Out responses')
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  category = EXCLUDED.category;

UPDATE public.backlink_types SET display_name = 'Digital PR' WHERE id = 'digital_pr';

-- Notes (unlimited per opportunity)
CREATE TABLE IF NOT EXISTS public.backlink_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES public.prospects(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tags
CREATE TABLE IF NOT EXISTS public.backlink_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, name)
);

CREATE TABLE IF NOT EXISTS public.backlink_tag_assignments (
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.backlink_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (opportunity_id, tag_id)
);

-- History / audit trail
CREATE TABLE IF NOT EXISTS public.backlink_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES public.prospects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Relationships (publisher contacts)
CREATE TABLE IF NOT EXISTS public.backlink_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_role TEXT,
  warmth TEXT NOT NULL DEFAULT 'cold' CHECK (warmth IN ('cold', 'warm', 'hot', 'partner')),
  notes TEXT,
  last_contact_at TIMESTAMPTZ,
  opportunity_count INT NOT NULL DEFAULT 0,
  won_count INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, domain)
);

-- AI content drafts (no email delivery — generation only)
CREATE TABLE IF NOT EXISTS public.backlink_ai_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  draft_type TEXT NOT NULL CHECK (draft_type IN ('email', 'guest_post', 'press_release', 'outreach_strategy', 'website_summary')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_pipeline ON public.opportunities(workspace_id, pipeline_stage, score DESC);
CREATE INDEX IF NOT EXISTS idx_opportunities_owner ON public.opportunities(workspace_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_backlink_history_opp ON public.backlink_history(opportunity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backlink_relationships_ws ON public.backlink_relationships(workspace_id, warmth);
CREATE INDEX IF NOT EXISTS idx_backlink_notes_opp ON public.backlink_notes(opportunity_id, created_at DESC);

ALTER TABLE public.backlink_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backlink_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backlink_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backlink_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backlink_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backlink_ai_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY backlink_notes_all ON public.backlink_notes
  FOR ALL TO authenticated USING (public.can_access_workspace(workspace_id)) WITH CHECK (public.can_access_workspace(workspace_id));
CREATE POLICY backlink_tags_all ON public.backlink_tags
  FOR ALL TO authenticated USING (public.can_access_workspace(workspace_id)) WITH CHECK (public.can_access_workspace(workspace_id));
CREATE POLICY backlink_tag_assignments_all ON public.backlink_tag_assignments
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.opportunities o JOIN public.workspaces w ON w.id = o.workspace_id
      WHERE o.id = opportunity_id AND public.can_access_workspace(o.workspace_id))
  );
CREATE POLICY backlink_history_all ON public.backlink_history
  FOR ALL TO authenticated USING (public.can_access_workspace(workspace_id)) WITH CHECK (public.can_access_workspace(workspace_id));
CREATE POLICY backlink_relationships_all ON public.backlink_relationships
  FOR ALL TO authenticated USING (public.can_access_workspace(workspace_id)) WITH CHECK (public.can_access_workspace(workspace_id));
CREATE POLICY backlink_ai_drafts_all ON public.backlink_ai_drafts
  FOR ALL TO authenticated USING (public.can_access_workspace(workspace_id)) WITH CHECK (public.can_access_workspace(workspace_id));

CREATE TRIGGER backlink_relationships_updated_at
  BEFORE UPDATE ON public.backlink_relationships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER backlink_ai_drafts_updated_at
  BEFORE UPDATE ON public.backlink_ai_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
