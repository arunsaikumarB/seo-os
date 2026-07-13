-- 063_image_metadata.sql

CREATE TABLE IF NOT EXISTS public.image_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.image_assets(id) ON DELETE CASCADE UNIQUE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  seo_filename TEXT,
  image_title TEXT,
  alt_text TEXT,
  caption TEXT,
  description TEXT,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  tags TEXT[] NOT NULL DEFAULT '{}',
  categories TEXT[] NOT NULL DEFAULT '{}',
  og_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  twitter_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  structured_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  exif_suggestions JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_metadata_ws ON public.image_metadata(workspace_id);

ALTER TABLE public.image_metadata ENABLE ROW LEVEL SECURITY;
CREATE POLICY image_metadata_all ON public.image_metadata
  FOR ALL USING (
    workspace_id IN (SELECT id FROM public.workspaces WHERE org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))
  )
  WITH CHECK (
    workspace_id IN (SELECT id FROM public.workspaces WHERE org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))
  );
