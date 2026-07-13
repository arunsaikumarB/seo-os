-- V1.1 Phase 2: Content packs + media asset briefs (metadata only)

CREATE TABLE IF NOT EXISTS content_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  backlink_type TEXT NOT NULL,
  pack JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'submitted', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_packs_opportunity
  ON content_packs(opportunity_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS media_asset_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'video')),
  brief JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_status TEXT NOT NULL DEFAULT 'queued'
    CHECK (review_status IN ('queued', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_asset_briefs_opportunity
  ON media_asset_briefs(opportunity_id, kind);

-- Link submissions to content packs when column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'backlink_submissions' AND column_name = 'content_pack_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'backlink_submissions_content_pack_id_fkey'
  ) THEN
    ALTER TABLE backlink_submissions
      ADD CONSTRAINT backlink_submissions_content_pack_id_fkey
      FOREIGN KEY (content_pack_id) REFERENCES content_packs(id) ON DELETE SET NULL;
  END IF;
END $$;
