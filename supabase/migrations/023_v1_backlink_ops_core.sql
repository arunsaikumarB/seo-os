-- V1.0 Core: discovery runs, estimate flags, submission prefill & review estimates

CREATE TABLE IF NOT EXISTS backlink_discovery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  website TEXT,
  industry TEXT,
  country TEXT,
  keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_dr INTEGER,
  target_traffic INTEGER,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_backlink_discovery_runs_project
  ON backlink_discovery_runs(project_id, created_at DESC);

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS discovery_source TEXT,
  ADD COLUMN IF NOT EXISTS authority_estimated BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS traffic_estimated BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS metrics_source TEXT NOT NULL DEFAULT 'estimated'
    CHECK (metrics_source IN ('estimated', 'live', 'user'));

ALTER TABLE backlink_domain_analyses
  ADD COLUMN IF NOT EXISTS metrics_source TEXT NOT NULL DEFAULT 'estimated'
    CHECK (metrics_source IN ('estimated', 'live', 'user')),
  ADD COLUMN IF NOT EXISTS robots_txt_status TEXT,
  ADD COLUMN IF NOT EXISTS sitemap_found BOOLEAN,
  ADD COLUMN IF NOT EXISTS fetch_status_code INTEGER;

ALTER TABLE backlink_submissions
  ADD COLUMN IF NOT EXISTS prefill_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS estimated_review_hours NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS estimated_approval_hours NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tracking_status TEXT;

-- Align tracking_status with V1 Submission Center statuses when present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'backlink_submissions_tracking_status_check'
  ) THEN
    ALTER TABLE backlink_submissions
      ADD CONSTRAINT backlink_submissions_tracking_status_check
      CHECK (
        tracking_status IS NULL OR tracking_status IN (
          'ready', 'awaiting_approval', 'submitted', 'pending_review',
          'accepted', 'rejected', 'failed', 'verified'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_opportunities_discovery_source
  ON opportunities(workspace_id, discovery_source)
  WHERE discovery_source IS NOT NULL;
