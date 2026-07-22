-- 089_content_generation_pipeline.sql
-- Phase 3: additive generation tracking on Campaign Items (opportunities)

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS generation_status TEXT,
  ADD COLUMN IF NOT EXISTS schema_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS quality_score NUMERIC,
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS package_approved_by TEXT;

CREATE INDEX IF NOT EXISTS idx_opportunities_generation_status
  ON public.opportunities (workspace_id, generation_status);

-- Rolling averages for estimates (workspace-scoped)
CREATE TABLE IF NOT EXISTS public.content_generation_stats (
  workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  avg_duration_ms NUMERIC NOT NULL DEFAULT 45000,
  avg_tokens NUMERIC NOT NULL DEFAULT 15000,
  avg_images NUMERIC NOT NULL DEFAULT 3,
  avg_cost_usd NUMERIC NOT NULL DEFAULT 0.08,
  samples INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
