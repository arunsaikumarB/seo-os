-- 097_manual_lane_backfill.sql
-- Phase 6.3.1: stamp Manual lane on opportunities that already hold gate / Unsupported evidence.
-- On-load API backfill (manual-lane-backfill.service) remains the authoritative repair path;
-- this migration seeds metadata for workspaces that already ran Truth Engine / SIE before divert existed.

-- 1) Jobs already diverted or classified with Manual-eligible truth claims / pause reasons
UPDATE public.opportunities o
SET
  metadata = COALESCE(o.metadata, '{}'::jsonb) || jsonb_build_object(
    'submissionLane', 'manual',
    'manualReason', CASE
      WHEN j.truth_claim = 'CAPTCHA' OR j.pause_reason IN ('captcha', 'recaptcha') THEN 'CAPTCHA'
      WHEN j.truth_claim = 'Login Required' OR j.pause_reason = 'login' THEN 'Login'
      WHEN j.truth_claim = 'Registration Required' OR j.pause_reason IN ('signup', 'registration') THEN 'Registration'
      WHEN j.truth_claim = 'Cloudflare / Anti-Bot' OR j.pause_reason = 'cloudflare' THEN 'Cloudflare'
      WHEN j.truth_claim IN ('OTP / MFA', 'Email Verification', 'Phone Verification')
        OR j.pause_reason IN ('otp', 'mfa', 'email_verify', 'phone_verify') THEN 'OTP'
      WHEN j.truth_claim = 'Manual Approval' THEN 'Manual Approval'
      WHEN j.disposition = 'unsupported' OR j.pause_reason = 'unsupported' OR j.status = 'unsupported' THEN 'Unsupported'
      WHEN j.truth_claim IN ('Unclassified', 'Needs AI Review')
        OR j.unclassified IS TRUE
        OR j.pause_reason IN ('unclassified', 'needs_ai_review', 'unknown') THEN 'Unclassified'
      WHEN j.disposition = 'manual_offline' THEN COALESCE(j.metrics->>'manualReason', 'Unclassified')
      ELSE 'Unclassified'
    END,
    'laneSource', 'migration_097_backfill',
    'laneSticky', true
  ),
  automation_status = CASE
    WHEN o.automation_status IN ('deleted', 'ignored') THEN o.automation_status
    ELSE 'manual_offline'
  END,
  updated_at = now()
FROM (
  SELECT DISTINCT ON (opportunity_id)
    opportunity_id,
    status,
    disposition,
    pause_reason,
    truth_claim,
    unclassified,
    metrics
  FROM public.execution_jobs
  WHERE deleted_at IS NULL
    AND opportunity_id IS NOT NULL
    AND (
      disposition = 'manual_offline'
      OR disposition = 'unsupported'
      OR unclassified IS TRUE
      OR pause_reason IN (
        'captcha', 'recaptcha', 'cloudflare', 'login', 'signup', 'registration',
        'otp', 'mfa', 'email_verify', 'phone_verify',
        'unclassified', 'needs_ai_review', 'unknown', 'unsupported'
      )
      OR truth_claim IN (
        'CAPTCHA', 'Login Required', 'Registration Required', 'Cloudflare / Anti-Bot',
        'OTP / MFA', 'Email Verification', 'Phone Verification', 'Manual Approval',
        'Unclassified', 'Needs AI Review'
      )
      OR status LIKE 'watching_%'
      OR status LIKE 'blocked_%'
      OR status = 'unsupported'
    )
  ORDER BY opportunity_id, created_at DESC
) j
WHERE o.id = j.opportunity_id
  AND COALESCE(o.campaign_lifecycle, '') NOT IN ('Deleted', 'Rejected', 'Ignored')
  AND COALESCE(o.metadata->>'submissionLane', '') IS DISTINCT FROM 'manual';

-- 2) Site profiles marked unsupported → Manual
UPDATE public.opportunities o
SET
  metadata = COALESCE(o.metadata, '{}'::jsonb) || jsonb_build_object(
    'submissionLane', 'manual',
    'manualReason', 'Unsupported',
    'laneSource', 'migration_097_backfill',
    'laneSticky', true
  ),
  automation_status = CASE
    WHEN o.automation_status IN ('deleted', 'ignored') THEN o.automation_status
    ELSE 'manual_offline'
  END,
  updated_at = now()
FROM public.site_profiles sp
WHERE o.workspace_id = sp.workspace_id
  AND lower(regexp_replace(COALESCE(o.domain, ''), '^www\.', '')) = lower(sp.domain)
  AND sp.profile_status = 'unsupported'
  AND COALESCE(o.campaign_lifecycle, '') NOT IN ('Deleted', 'Rejected', 'Ignored')
  AND COALESCE(o.metadata->>'submissionLane', '') IS DISTINCT FROM 'manual';

COMMENT ON COLUMN public.execution_policies.auto_publish_automatable IS
  'Phase 6.3/6.3.1 — when true, only clean Automable jobs submit without confirmation. Manual (gates/Unsupported) never auto-publishes.';
