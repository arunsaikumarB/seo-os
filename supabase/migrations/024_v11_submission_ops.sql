-- V1.1 Phase 1: Submission requirements, queue stages, submission events

CREATE TABLE IF NOT EXISTS submission_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  detected_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  required_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  media_requirements JSONB NOT NULL DEFAULT '{}'::jsonb,
  business_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  login_required BOOLEAN NOT NULL DEFAULT false,
  captcha_required BOOLEAN NOT NULL DEFAULT false,
  email_verify_required BOOLEAN NOT NULL DEFAULT false,
  metrics_source TEXT NOT NULL DEFAULT 'estimated'
    CHECK (metrics_source IN ('estimated', 'live', 'user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (opportunity_id)
);

CREATE INDEX IF NOT EXISTS idx_submission_requirements_workspace
  ON submission_requirements(workspace_id);

ALTER TABLE backlink_submissions
  ADD COLUMN IF NOT EXISTS queue_stage TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS content_pack_id UUID,
  ADD COLUMN IF NOT EXISTS browser_plan_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'backlink_submissions_queue_stage_check'
  ) THEN
    ALTER TABLE backlink_submissions
      ADD CONSTRAINT backlink_submissions_queue_stage_check
      CHECK (
        queue_stage IS NULL OR queue_stage IN (
          'discovered', 'qualified', 'content_ready', 'awaiting_review', 'approved',
          'prepared', 'submitted', 'pending', 'accepted', 'verified', 'expired', 'rejected'
        )
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS backlink_submission_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES public.backlink_submissions(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_backlink_submission_events_submission
  ON backlink_submission_events(submission_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_backlink_submissions_queue_stage
  ON backlink_submissions(workspace_id, queue_stage)
  WHERE queue_stage IS NOT NULL;

-- Backfill queue_stage from tracking_status / status where missing
UPDATE backlink_submissions
SET queue_stage = CASE
  WHEN tracking_status = 'ready' THEN 'prepared'
  WHEN tracking_status = 'awaiting_approval' THEN 'awaiting_review'
  WHEN tracking_status = 'submitted' THEN 'submitted'
  WHEN tracking_status = 'pending_review' THEN 'pending'
  WHEN tracking_status = 'accepted' THEN 'accepted'
  WHEN tracking_status = 'rejected' THEN 'rejected'
  WHEN tracking_status = 'failed' THEN 'rejected'
  WHEN tracking_status = 'verified' THEN 'verified'
  WHEN status = 'prepared' THEN 'prepared'
  WHEN status = 'submitted' THEN 'submitted'
  WHEN status = 'waiting' THEN 'pending'
  WHEN status = 'accepted' THEN 'accepted'
  WHEN status = 'rejected' THEN 'rejected'
  WHEN status = 'published' THEN 'accepted'
  ELSE 'discovered'
END
WHERE queue_stage IS NULL;
