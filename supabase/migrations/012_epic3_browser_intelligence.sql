-- 012_epic3_browser_intelligence.sql
-- Epic 3: AI Browser Intelligence Engine

-- Persistent website profiles (reused across scans)
CREATE TABLE IF NOT EXISTS public.website_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  website_name TEXT,
  description TEXT,
  category TEXT,
  country TEXT DEFAULT 'US',
  language TEXT DEFAULT 'en',
  cms TEXT,
  technology_stack JSONB NOT NULL DEFAULT '[]'::jsonb,
  domain_authority INT,
  estimated_traffic INT,
  contact_email TEXT,
  has_contact_form BOOLEAN DEFAULT false,
  author_pages JSONB NOT NULL DEFAULT '[]'::jsonb,
  social_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  submission_guidelines TEXT,
  editorial_guidelines TEXT,
  guest_post_available BOOLEAN DEFAULT false,
  resource_pages JSONB NOT NULL DEFAULT '[]'::jsonb,
  broken_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  opportunity_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  faq_pages JSONB NOT NULL DEFAULT '[]'::jsonb,
  robots_txt TEXT,
  sitemap_url TEXT,
  confidence_score INT DEFAULT 0,
  ai_summary TEXT,
  ai_recommendations JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_scan_id UUID,
  last_scanned_at TIMESTAMPTZ,
  content_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, domain)
);

-- Browser intelligence discoveries per scan
CREATE TABLE IF NOT EXISTS public.browser_intelligence_discoveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  scan_id UUID NOT NULL REFERENCES public.website_scans(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.website_profiles(id) ON DELETE SET NULL,
  discovery_type TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  confidence INT DEFAULT 50,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Scan cache for incremental rescans & duplicate detection
CREATE TABLE IF NOT EXISTS public.browser_scan_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  url TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  http_status INT,
  last_fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, url)
);

-- Extend website_scans for Browser Intelligence Engine
ALTER TABLE public.website_scans
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.website_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_summary TEXT,
  ADD COLUMN IF NOT EXISTS ai_recommendations JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS discoveries_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contact_pages_found INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS guest_post_pages_found INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS broken_links_found INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scan_type TEXT DEFAULT 'browser_intelligence',
  ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pages_read INT DEFAULT 0;

-- Extend website_pages with browser intelligence fields
ALTER TABLE public.website_pages
  ADD COLUMN IF NOT EXISTS http_status INT,
  ADD COLUMN IF NOT EXISTS page_type TEXT,
  ADD COLUMN IF NOT EXISTS has_contact_form BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS links_found JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS broken_links JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_website_profiles_ws ON public.website_profiles(workspace_id, domain);
CREATE INDEX IF NOT EXISTS idx_website_profiles_last_scan ON public.website_profiles(workspace_id, last_scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_browser_discoveries_scan ON public.browser_intelligence_discoveries(scan_id, discovery_type);
CREATE INDEX IF NOT EXISTS idx_browser_scan_cache_domain ON public.browser_scan_cache(workspace_id, domain);
CREATE INDEX IF NOT EXISTS idx_website_scans_type ON public.website_scans(workspace_id, scan_type, status);

ALTER TABLE public.website_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.browser_intelligence_discoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.browser_scan_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY website_profiles_all ON public.website_profiles
  FOR ALL TO authenticated USING (public.can_access_workspace(workspace_id)) WITH CHECK (public.can_access_workspace(workspace_id));
CREATE POLICY browser_discoveries_all ON public.browser_intelligence_discoveries
  FOR ALL TO authenticated USING (public.can_access_workspace(workspace_id)) WITH CHECK (public.can_access_workspace(workspace_id));
CREATE POLICY browser_scan_cache_all ON public.browser_scan_cache
  FOR ALL TO authenticated USING (public.can_access_workspace(workspace_id)) WITH CHECK (public.can_access_workspace(workspace_id));

CREATE TRIGGER website_profiles_updated_at
  BEFORE UPDATE ON public.website_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
