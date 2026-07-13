-- 070_image_statistics.sql

CREATE TABLE IF NOT EXISTS public.image_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  day DATE NOT NULL DEFAULT (CURRENT_DATE),
  generated INT NOT NULL DEFAULT 0,
  queued INT NOT NULL DEFAULT 0,
  approved INT NOT NULL DEFAULT 0,
  submitted INT NOT NULL DEFAULT 0,
  verified INT NOT NULL DEFAULT 0,
  rejected INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  best_provider TEXT,
  best_style TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, day)
);

CREATE INDEX IF NOT EXISTS idx_image_statistics_ws_day
  ON public.image_statistics(workspace_id, day DESC);

ALTER TABLE public.image_statistics ENABLE ROW LEVEL SECURITY;
CREATE POLICY image_statistics_all ON public.image_statistics
  FOR ALL USING (
    workspace_id IN (SELECT id FROM public.workspaces WHERE org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))
  )
  WITH CHECK (
    workspace_id IN (SELECT id FROM public.workspaces WHERE org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))
  );
