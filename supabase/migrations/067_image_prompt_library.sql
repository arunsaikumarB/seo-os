-- 067_image_prompt_library.sql

CREATE TABLE IF NOT EXISTS public.image_prompt_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  image_type TEXT NOT NULL,
  industry TEXT,
  backlink_type TEXT,
  prompt_template TEXT NOT NULL,
  assembled_prompt TEXT,
  negative_prompt TEXT,
  style_tags TEXT[] NOT NULL DEFAULT '{}',
  aspect_ratio TEXT,
  recommended_provider TEXT,
  performance JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'agent'
    CHECK (source IN ('agent', 'learned', 'user')),
  version INT NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_prompt_library_lookup
  ON public.image_prompt_library(image_type, industry)
  WHERE deleted_at IS NULL;

ALTER TABLE public.image_prompt_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY image_prompt_library_all ON public.image_prompt_library
  FOR ALL USING (
    workspace_id IS NULL OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE org_id IN (
        SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))
  )
  WITH CHECK (
    workspace_id IS NULL OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE org_id IN (
        SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))
  );
