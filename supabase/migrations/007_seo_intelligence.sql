-- 007_seo_intelligence.sql
-- Sprint 4: Website analysis, competitor/keyword intelligence, opportunities, prospects

-- Extend keywords (Sprint 3 minimal table)
ALTER TABLE public.keywords
  ADD COLUMN IF NOT EXISTS search_intent TEXT
    CHECK (search_intent IS NULL OR search_intent IN ('informational', 'commercial', 'transactional', 'navigational')),
  ADD COLUMN IF NOT EXISTS topic_group TEXT,
  ADD COLUMN IF NOT EXISTS cluster_id UUID,
  ADD COLUMN IF NOT EXISTS priority_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discovery_source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Extend competitors
ALTER TABLE public.competitors
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'validated'
    CHECK (status IN ('suggested', 'pending_validation', 'validated', 'rejected')),
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS discovery_source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES public.profiles(id);

CREATE TABLE IF NOT EXISTS public.keyword_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  topic TEXT,
  primary_intent TEXT,
  priority_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  keyword_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.keywords
  DROP CONSTRAINT IF EXISTS keywords_cluster_id_fkey;
ALTER TABLE public.keywords
  ADD CONSTRAINT keywords_cluster_id_fkey
  FOREIGN KEY (cluster_id) REFERENCES public.keyword_clusters(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.competitor_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  name TEXT,
  confidence_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'validated', 'rejected')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, domain)
);

CREATE TABLE IF NOT EXISTS public.website_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  phase TEXT NOT NULL DEFAULT 'init',
  target_url TEXT NOT NULL,
  sitemap_url TEXT,
  pages_discovered INT NOT NULL DEFAULT 0,
  pages_analyzed INT NOT NULL DEFAULT 0,
  brand_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  tech_stack JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_inventory JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.website_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES public.website_scans(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  path TEXT NOT NULL,
  title TEXT,
  meta_description TEXT,
  h1 TEXT,
  schema_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  word_count INT NOT NULL DEFAULT 0,
  discovered_via TEXT NOT NULL DEFAULT 'sitemap',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scan_id, url)
);

CREATE TABLE IF NOT EXISTS public.opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  opportunity_type TEXT NOT NULL
    CHECK (opportunity_type IN (
      'guest_post', 'resource_page', 'broken_link', 'directory',
      'qa_site', 'forum', 'podcast', 'partnership'
    )),
  title TEXT NOT NULL,
  url TEXT,
  domain TEXT,
  score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'discovered'
    CHECK (status IN ('discovered', 'qualified', 'dismissed')),
  summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  discovery_source TEXT NOT NULL DEFAULT 'ai',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  url TEXT,
  title TEXT,
  prospect_type TEXT,
  pipeline_status TEXT NOT NULL DEFAULT 'discovered'
    CHECK (pipeline_status IN (
      'discovered', 'qualified', 'approved', 'outreach_ready', 'won', 'lost'
    )),
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, domain)
);

CREATE TABLE IF NOT EXISTS public.research_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  phase TEXT,
  title TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_scans_workspace ON public.website_scans(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_website_pages_scan ON public.website_pages(scan_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_workspace ON public.opportunities(workspace_id, opportunity_type);
CREATE INDEX IF NOT EXISTS idx_opportunities_score ON public.opportunities(workspace_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_prospects_pipeline ON public.prospects(workspace_id, pipeline_status);
CREATE INDEX IF NOT EXISTS idx_research_events_workspace ON public.research_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_keyword_clusters_workspace ON public.keyword_clusters(workspace_id);
CREATE INDEX IF NOT EXISTS idx_competitor_suggestions_workspace ON public.competitor_suggestions(workspace_id, status);

ALTER TABLE public.keyword_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY keyword_clusters_all ON public.keyword_clusters
  FOR ALL TO authenticated
  USING (public.can_access_workspace(workspace_id))
  WITH CHECK (public.can_access_workspace(workspace_id));

CREATE POLICY competitor_suggestions_all ON public.competitor_suggestions
  FOR ALL TO authenticated
  USING (public.can_access_workspace(workspace_id))
  WITH CHECK (public.can_access_workspace(workspace_id));

CREATE POLICY website_scans_all ON public.website_scans
  FOR ALL TO authenticated
  USING (public.can_access_workspace(workspace_id))
  WITH CHECK (public.can_access_workspace(workspace_id));

CREATE POLICY website_pages_select ON public.website_pages
  FOR SELECT TO authenticated USING (public.can_access_workspace(workspace_id));

CREATE POLICY opportunities_all ON public.opportunities
  FOR ALL TO authenticated
  USING (public.can_access_workspace(workspace_id))
  WITH CHECK (public.can_access_workspace(workspace_id));

CREATE POLICY prospects_all ON public.prospects
  FOR ALL TO authenticated
  USING (public.can_access_workspace(workspace_id))
  WITH CHECK (public.can_access_workspace(workspace_id));

CREATE POLICY research_events_select ON public.research_events
  FOR SELECT TO authenticated USING (public.can_access_workspace(workspace_id));

CREATE TRIGGER website_scans_updated_at
  BEFORE UPDATE ON public.website_scans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER opportunities_updated_at
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER prospects_updated_at
  BEFORE UPDATE ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER keyword_clusters_updated_at
  BEFORE UPDATE ON public.keyword_clusters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
