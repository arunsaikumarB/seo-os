-- No-form park lane: content/blog pages without a listing submission form.

ALTER TABLE public.assisted_packages
  DROP CONSTRAINT IF EXISTS assisted_packages_bucket_check;

ALTER TABLE public.assisted_packages
  ADD CONSTRAINT assisted_packages_bucket_check
  CHECK (bucket IN ('ready', 'check_fields', 'needs_person', 'paid_aside', 'no_form'));

COMMENT ON COLUMN public.assisted_packages.bucket IS
  'ready | check_fields | needs_person | paid_aside | no_form (no listing form — never submit)';
