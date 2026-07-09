-- 013_epic4_relationship_intelligence.sql
-- Epic 4: Relationship Intelligence Engine

-- Organization (company) profiles
CREATE TABLE IF NOT EXISTS public.relationship_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  domain TEXT NOT NULL,
  website TEXT,
  industry TEXT,
  country TEXT DEFAULT 'US',
  language TEXT DEFAULT 'en',
  team_page_url TEXT,
  contact_page_url TEXT,
  editorial_page_url TEXT,
  submission_page_url TEXT,
  social_profiles JSONB NOT NULL DEFAULT '{}'::jsonb,
  relationship_score INT DEFAULT 0,
  response_probability INT DEFAULT 0,
  campaign_suitability INT DEFAULT 0,
  collaboration_potential INT DEFAULT 0,
  priority_score INT DEFAULT 0,
  risk_score INT DEFAULT 0,
  warmth TEXT NOT NULL DEFAULT 'cold' CHECK (warmth IN ('cold', 'warm', 'hot', 'partner')),
  backlinks_won INT NOT NULL DEFAULT 0,
  campaign_count INT NOT NULL DEFAULT 0,
  website_profile_id UUID REFERENCES public.website_profiles(id) ON DELETE SET NULL,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_enriched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, domain)
);

-- Contact profiles (public information only)
CREATE TABLE IF NOT EXISTS public.relationship_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.relationship_organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  department TEXT,
  public_email TEXT,
  linkedin_url TEXT,
  twitter_url TEXT,
  github_url TEXT,
  author_page_url TEXT,
  bio TEXT,
  preferred_contact_method TEXT DEFAULT 'email' CHECK (preferred_contact_method IN ('email', 'form', 'linkedin', 'twitter', 'unknown')),
  confidence_score INT DEFAULT 50,
  relationship_strength INT DEFAULT 0,
  is_recommended_outreach BOOLEAN DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Relationship timeline events
CREATE TABLE IF NOT EXISTS public.relationship_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.relationship_organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.relationship_contacts(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'contact_discovered', 'campaign_created', 'content_generated', 'submission_sent',
    'reply_received', 'guest_post_accepted', 'backlink_verified', 'future_collaboration',
    'organization_enriched', 'outreach_recommended'
  )),
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tags for organizations
CREATE TABLE IF NOT EXISTS public.relationship_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, name)
);

CREATE TABLE IF NOT EXISTS public.relationship_org_tags (
  organization_id UUID NOT NULL REFERENCES public.relationship_organizations(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.relationship_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (organization_id, tag_id)
);

-- Link legacy backlink_relationships to organizations
ALTER TABLE public.backlink_relationships
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.relationship_organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rel_orgs_ws ON public.relationship_organizations(workspace_id, relationship_score DESC);
CREATE INDEX IF NOT EXISTS idx_rel_orgs_warmth ON public.relationship_organizations(workspace_id, warmth);
CREATE INDEX IF NOT EXISTS idx_rel_contacts_org ON public.relationship_contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_rel_contacts_recommended ON public.relationship_contacts(workspace_id, is_recommended_outreach);
CREATE INDEX IF NOT EXISTS idx_rel_timeline_org ON public.relationship_timeline(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rel_timeline_ws ON public.relationship_timeline(workspace_id, created_at DESC);

ALTER TABLE public.relationship_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_org_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY relationship_organizations_all ON public.relationship_organizations
  FOR ALL TO authenticated USING (public.can_access_workspace(workspace_id)) WITH CHECK (public.can_access_workspace(workspace_id));
CREATE POLICY relationship_contacts_all ON public.relationship_contacts
  FOR ALL TO authenticated USING (public.can_access_workspace(workspace_id)) WITH CHECK (public.can_access_workspace(workspace_id));
CREATE POLICY relationship_timeline_all ON public.relationship_timeline
  FOR ALL TO authenticated USING (public.can_access_workspace(workspace_id)) WITH CHECK (public.can_access_workspace(workspace_id));
CREATE POLICY relationship_tags_all ON public.relationship_tags
  FOR ALL TO authenticated USING (public.can_access_workspace(workspace_id)) WITH CHECK (public.can_access_workspace(workspace_id));
CREATE POLICY relationship_org_tags_all ON public.relationship_org_tags
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.relationship_organizations o WHERE o.id = organization_id AND public.can_access_workspace(o.workspace_id))
  );

CREATE TRIGGER relationship_organizations_updated_at
  BEFORE UPDATE ON public.relationship_organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER relationship_contacts_updated_at
  BEFORE UPDATE ON public.relationship_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
