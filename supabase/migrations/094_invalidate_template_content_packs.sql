-- 094_invalidate_template_content_packs.sql
-- Phase 5.6 — Invalidate placeholder/template packages so they cannot be approved or submitted.
-- content_packs.status CHECK: draft | ready | submitted | approved | rejected

UPDATE public.content_packs
SET
  status = 'rejected',
  updated_at = NOW()
WHERE
  pack::text ILIKE '%Our Brand%'
  OR pack::text ILIKE '%Insight 1%'
  OR pack::text ILIKE '%example.com%'
  OR pack::text ILIKE '%A Practical Guide from%'
  OR pack::text ILIKE '%v1.1_provider_required%';

UPDATE public.opportunities o
SET
  campaign_lifecycle = 'Approved',
  package_status = 'pending',
  image_status = 'pending',
  metadata_status = 'pending',
  video_metadata_status = 'pending',
  schema_status = 'pending',
  generation_status = 'Queued',
  package_approved_by = NULL,
  quality_score = NULL,
  blocker_reason = NULL,
  last_error = 'regeneration required — placeholder output',
  updated_at = NOW()
WHERE
  COALESCE(o.automation_status, '') NOT IN ('deleted', 'ignored')
  AND EXISTS (
    SELECT 1
    FROM public.content_packs cp
    WHERE cp.opportunity_id = o.id
      AND cp.workspace_id = o.workspace_id
      AND (
        cp.pack::text ILIKE '%Our Brand%'
        OR cp.pack::text ILIKE '%Insight 1%'
        OR cp.pack::text ILIKE '%example.com%'
        OR cp.pack::text ILIKE '%A Practical Guide from%'
        OR cp.pack::text ILIKE '%v1.1_provider_required%'
      )
  );
