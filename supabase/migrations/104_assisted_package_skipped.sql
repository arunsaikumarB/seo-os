-- 104_assisted_package_skipped.sql
-- Allow Assisted Manual packages to be skipped out of the worklist.

ALTER TABLE public.assisted_packages
  DROP CONSTRAINT IF EXISTS assisted_packages_status_check;

ALTER TABLE public.assisted_packages
  ADD CONSTRAINT assisted_packages_status_check
  CHECK (status IN ('not_started','in_progress','done','failed','skipped'));

COMMENT ON COLUMN public.assisted_packages.status IS
  'not_started | in_progress | done | failed | skipped (cleared from Assisted Manual worklist)';
