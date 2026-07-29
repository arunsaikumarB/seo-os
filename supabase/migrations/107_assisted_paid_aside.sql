-- Free vs paid park lane for Assisted Manual packages.
-- paid_aside = no "free" word found in form/payment sections (set aside).

ALTER TABLE public.assisted_packages
  DROP CONSTRAINT IF EXISTS assisted_packages_bucket_check;

ALTER TABLE public.assisted_packages
  ADD CONSTRAINT assisted_packages_bucket_check
  CHECK (bucket IN ('ready', 'check_fields', 'needs_person', 'paid_aside'));

COMMENT ON COLUMN public.assisted_packages.bucket IS
  'ready | check_fields | needs_person | paid_aside (no free listing path)';
