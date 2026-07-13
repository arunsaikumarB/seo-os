-- 065_image_submission_history.sql

CREATE TABLE IF NOT EXISTS public.image_submission_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.image_assets(id) ON DELETE CASCADE,
  requirement_id UUID REFERENCES public.image_submission_requirements(id) ON DELETE SET NULL,
  site_key TEXT,
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'submitted', 'pending', 'approved', 'rejected', 'verified', 'failed')),
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  package JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  submitted_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_sub_hist_ws
  ON public.image_submission_history(workspace_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.image_submission_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY image_submission_history_all ON public.image_submission_history
  FOR ALL USING (
    workspace_id IN (SELECT id FROM public.workspaces WHERE org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))
  )
  WITH CHECK (
    workspace_id IN (SELECT id FROM public.workspaces WHERE org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))
  );
