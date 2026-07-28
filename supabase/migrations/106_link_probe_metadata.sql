-- 106_link_probe_metadata.sql
-- Bulk Link Probe stores results on opportunities.metadata.linkProbe (no new columns).
-- This migration documents the contract for operators / future indexes.

COMMENT ON COLUMN public.opportunities.metadata IS
  'JSONB bag. linkProbe: { band, score, alive, formFound, formUrl, gates, multiStep, reasons, probedAt, ... } from Bulk Link Probe.';
