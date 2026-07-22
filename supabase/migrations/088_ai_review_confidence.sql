-- 088_ai_review_confidence.sql
-- Phase 2: confidence-based AI Review fields on Campaign Items (opportunities)

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC,
  ADD COLUMN IF NOT EXISTS review_tier TEXT,
  ADD COLUMN IF NOT EXISTS review_decision TEXT,
  ADD COLUMN IF NOT EXISTS approved_by TEXT,
  ADD COLUMN IF NOT EXISTS duplicate_of_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_opportunities_review_tier
  ON public.opportunities (workspace_id, review_tier);

CREATE INDEX IF NOT EXISTS idx_opportunities_review_decision
  ON public.opportunities (workspace_id, review_decision);
