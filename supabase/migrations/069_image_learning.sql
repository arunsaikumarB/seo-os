-- 069_image_learning.sql

CREATE TABLE IF NOT EXISTS public.image_learning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES public.image_assets(id) ON DELETE SET NULL,
  signal TEXT NOT NULL
    CHECK (signal IN ('approved', 'rejected', 'verified', 'clicked', 'submitted', 'failed')),
  provider_key TEXT,
  image_type TEXT,
  style_tags TEXT[] NOT NULL DEFAULT '{}',
  prompt_hash TEXT,
  weight NUMERIC(6,3) NOT NULL DEFAULT 1,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_learning_ws
  ON public.image_learning(workspace_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.image_learning ENABLE ROW LEVEL SECURITY;
CREATE POLICY image_learning_all ON public.image_learning
  FOR ALL USING (
    workspace_id IN (SELECT id FROM public.workspaces WHERE org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))
  )
  WITH CHECK (
    workspace_id IN (SELECT id FROM public.workspaces WHERE org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))
  );

ALTER TABLE public.image_assets
  ADD COLUMN IF NOT EXISTS prompt_library_id UUID REFERENCES public.image_prompt_library(id) ON DELETE SET NULL;
