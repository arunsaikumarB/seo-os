-- 068_domain_style_profiles.sql

CREATE TABLE IF NOT EXISTS public.domain_style_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  brand_colors JSONB NOT NULL DEFAULT '[]'::jsonb,
  fonts JSONB NOT NULL DEFAULT '[]'::jsonb,
  mood TEXT,
  photography_style TEXT,
  illustration_style TEXT,
  lighting TEXT,
  theme TEXT,
  industry TEXT,
  audience TEXT,
  logo_url TEXT,
  products JSONB NOT NULL DEFAULT '[]'::jsonb,
  services JSONB NOT NULL DEFAULT '[]'::jsonb,
  brand_tone TEXT,
  competitors JSONB NOT NULL DEFAULT '[]'::jsonb,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  metrics_source TEXT NOT NULL DEFAULT 'estimated'
    CHECK (metrics_source IN ('estimated', 'live', 'user')),
  confidence NUMERIC(5,2) NOT NULL DEFAULT 40,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_domain_style_profiles_ws
  ON public.domain_style_profiles(workspace_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.domain_style_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY domain_style_profiles_all ON public.domain_style_profiles
  FOR ALL USING (
    workspace_id IN (SELECT id FROM public.workspaces WHERE org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))
  )
  WITH CHECK (
    workspace_id IN (SELECT id FROM public.workspaces WHERE org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))
  );
