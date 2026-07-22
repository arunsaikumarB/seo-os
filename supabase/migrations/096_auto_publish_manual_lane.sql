-- 096_auto_publish_manual_lane.sql
-- Phase 6.3: campaign toggle for zero-click auto-publish of automatable links.
-- Manual lane is stored on opportunities.metadata (no new opportunity columns).

ALTER TABLE public.execution_policies
  ADD COLUMN IF NOT EXISTS auto_publish_automatable BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.execution_policies.auto_publish_automatable IS
  'Phase 6.3 — when true, gate-free automatable jobs submit without per-site human confirmation. Default OFF (informed opt-in).';
