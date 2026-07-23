-- 101_assisted_manual_submission_record.sql
-- First-class Assisted Manual Done → Submitted record (timestamps + user Verified).

ALTER TABLE public.assisted_packages
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS user_verified BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.assisted_packages.submitted_at IS
  'Authoritative user Done click — site submitted via Assisted Manual (app cannot observe third-party).';
COMMENT ON COLUMN public.assisted_packages.verified_at IS
  'Optional user tick after email confirmation / listing live (e.g. Viesearch).';
COMMENT ON COLUMN public.assisted_packages.user_verified IS
  'True when the operator confirmed the listing is live (separate from Submitted).';

-- Backfill timestamps for packages already marked Done before this migration
UPDATE public.assisted_packages
SET submitted_at = COALESCE(submitted_at, updated_at, prepared_at, now())
WHERE status = 'done'
  AND submitted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_assisted_packages_submitted
  ON public.assisted_packages (workspace_id, submitted_at)
  WHERE submitted_at IS NOT NULL;
