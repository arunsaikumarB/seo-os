-- 099_assisted_manual_all_sites_auto_publish_off.sql
-- Phase 7 follow-up: Assisted packages for every content-ready site; auto-publish OFF by default.

-- Ensure column default stays off
ALTER TABLE public.execution_policies
  ALTER COLUMN auto_publish_automatable SET DEFAULT false;

-- Turn off auto-publish for existing workspaces (Assisted Manual is the human submit path)
UPDATE public.execution_policies
SET auto_publish_automatable = false
WHERE auto_publish_automatable IS DISTINCT FROM false;

COMMENT ON COLUMN public.execution_policies.auto_publish_automatable IS
  'Opt-in only. Default false — users submit via Assisted Manual (paste + clear gates themselves).';
