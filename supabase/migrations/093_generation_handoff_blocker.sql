-- 093_generation_handoff_blocker.sql
-- Phase 5.5 — Generation → Submission handoff: explicit blocker when package cannot become Ready

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS blocker_reason TEXT;

COMMENT ON COLUMN public.opportunities.blocker_reason IS
  'Phase 5.5 handoff blocker when package cannot become Submission Ready (Ready). Null when Ready or not yet generated.';

CREATE INDEX IF NOT EXISTS idx_opportunities_blocker_reason
  ON public.opportunities (workspace_id, blocker_reason)
  WHERE blocker_reason IS NOT NULL;
