-- 103_project_profile_brand.sql
-- Phase 9: project contact profile + crawled brand profile for grounded fills.

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS company_name TEXT,
  ADD COLUMN IF NOT EXISTS brand_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.workspaces.contact_email IS
  'Authoritative contact email for Assisted Manual / content fills';
COMMENT ON COLUMN public.workspaces.contact_name IS
  'Authoritative owner/contact person name for form fills';
COMMENT ON COLUMN public.workspaces.contact_phone IS
  'Authoritative phone for form fills';
COMMENT ON COLUMN public.workspaces.company_name IS
  'Legal/trading company name (may differ from project display name)';
COMMENT ON COLUMN public.workspaces.brand_profile IS
  'Crawled brand facts (tagline, topics, tone, features) — grounds titles/descriptions';
