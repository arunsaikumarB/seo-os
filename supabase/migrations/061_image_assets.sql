-- 061_image_assets.sql

CREATE TABLE IF NOT EXISTS public.image_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id UUID,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  brief_id UUID REFERENCES public.media_asset_briefs(id) ON DELETE SET NULL,
  parent_asset_id UUID REFERENCES public.image_assets(id) ON DELETE SET NULL,
  image_type TEXT NOT NULL,
  width INT,
  height INT,
  mime_type TEXT DEFAULT 'image/png',
  storage_path TEXT,
  thumbnail_path TEXT,
  public_url TEXT,
  provider_key TEXT NOT NULL DEFAULT 'flux',
  prompt_id UUID,
  status TEXT NOT NULL DEFAULT 'generating'
    CHECK (status IN (
      'generating', 'scored', 'approved', 'rejected', 'queued_submission',
      'ready', 'submitted', 'pending', 'verified', 'failed', 'archived'
    )),
  quality_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  rejected_reason TEXT,
  seed BIGINT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_assets_ws_status
  ON public.image_assets(workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_image_assets_opportunity
  ON public.image_assets(opportunity_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_image_assets_type
  ON public.image_assets(workspace_id, image_type) WHERE deleted_at IS NULL;

ALTER TABLE public.image_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY image_assets_all ON public.image_assets
  FOR ALL USING (
    workspace_id IN (SELECT id FROM public.workspaces WHERE org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))
  )
  WITH CHECK (
    workspace_id IN (SELECT id FROM public.workspaces WHERE org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))
  );
