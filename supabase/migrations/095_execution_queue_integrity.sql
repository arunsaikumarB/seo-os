-- 095_execution_queue_integrity.sql
-- Phase 6: at most ONE active execution job per Campaign Item (opportunity).
-- 1) Collapse existing duplicates (Chefgaa 50+ → ≤15 active).
-- 2) Partial unique index so duplicate active inserts are impossible.

-- Soft-delete duplicate active jobs; keep furthest-progressed (then newest).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY workspace_id, opportunity_id
      ORDER BY
        CASE
          WHEN status = 'verified' THEN 200
          WHEN status IN ('completed', 'submitted') THEN 190
          WHEN status = 'waiting_verification' THEN 180
          WHEN status = 'submitting' THEN 170
          WHEN status = 'validating' THEN 160
          WHEN status = 'filling_fields' THEN 150
          WHEN status = 'uploading_assets' THEN 140
          WHEN status = 'analyzing_form' THEN 130
          WHEN status = 'navigating' THEN 120
          WHEN status IN ('authenticating', 'launching_browser') THEN 110
          WHEN status LIKE 'watching_%' OR status LIKE 'blocked_%' THEN 100
          WHEN status IN (
            'needs_approval',
            'paused',
            'awaiting_user',
            'ready_for_review',
            'ready_to_continue'
          ) THEN 100
          WHEN status = 'preparing' THEN 40
          WHEN status IN ('queued', 'retry_scheduled') THEN 30
          WHEN status = 'waiting_infrastructure' THEN 20
          WHEN status = 'failed' THEN 10
          ELSE 5
        END DESC,
        created_at DESC NULLS LAST
    ) AS rn
  FROM public.execution_jobs
  WHERE deleted_at IS NULL
    AND opportunity_id IS NOT NULL
    AND status NOT IN (
      'completed',
      'submitted',
      'verified',
      'skipped',
      'unsupported',
      'deleted',
      'ignored',
      'cancelled',
      'approved',
      'rejected'
    )
)
UPDATE public.execution_jobs AS j
SET
  status = 'deleted',
  disposition = 'deleted',
  deleted_at = now(),
  error_message = 'duplicate enqueue — phase 6 cleanup',
  finished_at = COALESCE(finished_at, now()),
  updated_at = now(),
  metrics = COALESCE(metrics, '{}'::jsonb) || jsonb_build_object(
    'phase6Cleanup', true,
    'cleanupReason', 'duplicate enqueue — phase 6 cleanup'
  )
FROM ranked AS r
WHERE j.id = r.id
  AND r.rn > 1;

-- Backstop: one non-terminal (active) job per workspace + opportunity.
CREATE UNIQUE INDEX IF NOT EXISTS uq_execution_jobs_one_active_per_opportunity
  ON public.execution_jobs (workspace_id, opportunity_id)
  WHERE deleted_at IS NULL
    AND opportunity_id IS NOT NULL
    AND status NOT IN (
      'completed',
      'submitted',
      'verified',
      'skipped',
      'unsupported',
      'deleted',
      'ignored',
      'cancelled',
      'approved',
      'rejected'
    );

COMMENT ON INDEX public.uq_execution_jobs_one_active_per_opportunity IS
  'Phase 6: at most one active execution job per Campaign Item (opportunity).';
