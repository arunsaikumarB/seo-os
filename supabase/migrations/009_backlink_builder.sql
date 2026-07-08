-- 009_backlink_builder.sql
-- Sprint 5.5: Backlink Builder flagship module

CREATE TABLE public.backlink_types (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL
    CHECK (category IN ('content_based', 'community_based', 'business_based', 'outreach_based', 'authority_based')),
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.backlink_types (id, category, display_name, description) VALUES
  ('guest_post', 'content_based', 'Guest Posts', 'Guest post placements'),
  ('press_release', 'content_based', 'Press Releases', 'Press release distribution'),
  ('pdf', 'content_based', 'PDFs', 'PDF link building'),
  ('infographic', 'content_based', 'Infographics', 'Infographic outreach'),
  ('video', 'content_based', 'Videos', 'Video content links'),
  ('web2', 'content_based', 'Web 2.0', 'Web 2.0 properties'),
  ('qa_site', 'community_based', 'Q&A', 'Q&A platform mentions'),
  ('forum', 'community_based', 'Forums', 'Forum participation'),
  ('blog_comment', 'community_based', 'Blog Comments', 'Relevant blog comments'),
  ('social_bookmark', 'community_based', 'Social Bookmarking', 'Social bookmark links'),
  ('directory', 'business_based', 'Directories', 'Business directories'),
  ('citation', 'business_based', 'Citations', 'NAP citations'),
  ('profile', 'business_based', 'Profiles', 'Business profiles'),
  ('testimonial', 'business_based', 'Testimonials', 'Testimonial placements'),
  ('partnership', 'business_based', 'Partnerships', 'Strategic partnerships'),
  ('broken_link', 'outreach_based', 'Broken Links', 'Broken link reclamation'),
  ('resource_page', 'outreach_based', 'Resource Pages', 'Resource page outreach'),
  ('niche_edit', 'outreach_based', 'Niche Edits', 'Contextual niche edits'),
  ('brand_mention', 'outreach_based', 'Brand Mentions', 'Unlinked brand mentions'),
  ('digital_pr', 'outreach_based', 'HARO / Digital PR', 'Digital PR and HARO'),
  ('edu', 'authority_based', 'EDU', 'Educational institution links'),
  ('gov', 'authority_based', 'GOV', 'Government links'),
  ('news', 'authority_based', 'News', 'News publication links'),
  ('podcast', 'authority_based', 'Podcasts', 'Podcast guest links'),
  ('event', 'authority_based', 'Events', 'Event sponsorship links'),
  ('sponsorship', 'authority_based', 'Sponsorships', 'Sponsorship placements')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS backlink_category TEXT,
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'lost', 'unreachable'));

ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'lost', 'unreachable'));

CREATE TABLE public.backlinks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES public.prospects(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  backlink_type TEXT NOT NULL REFERENCES public.backlink_types(id),
  source_url TEXT NOT NULL,
  target_url TEXT,
  anchor_text TEXT,
  domain TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'lost', 'unreachable')),
  da_score INT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  won_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.backlink_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backlink_id UUID NOT NULL REFERENCES public.backlinks(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'verified', 'lost', 'unreachable')),
  http_status INT,
  notes TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_backlinks_workspace_status ON public.backlinks(workspace_id, verification_status);
CREATE INDEX idx_backlinks_workspace_type ON public.backlinks(workspace_id, backlink_type);
CREATE INDEX idx_backlink_checks_backlink ON public.backlink_checks(backlink_id, checked_at DESC);
CREATE INDEX idx_opportunities_category ON public.opportunities(workspace_id, backlink_category);
CREATE INDEX idx_opportunities_verification ON public.opportunities(workspace_id, verification_status);

ALTER TABLE public.backlink_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backlinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backlink_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY backlink_types_select ON public.backlink_types FOR SELECT TO authenticated USING (true);

CREATE POLICY backlinks_all ON public.backlinks
  FOR ALL TO authenticated
  USING (public.can_access_workspace(workspace_id))
  WITH CHECK (public.can_access_workspace(workspace_id));

CREATE POLICY backlink_checks_all ON public.backlink_checks
  FOR ALL TO authenticated
  USING (public.can_access_workspace(workspace_id))
  WITH CHECK (public.can_access_workspace(workspace_id));

CREATE TRIGGER backlinks_updated_at
  BEFORE UPDATE ON public.backlinks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
