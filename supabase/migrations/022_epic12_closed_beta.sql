-- 022_epic12_closed_beta.sql
-- Version 0.99.5: Closed Beta / Customer Validation
-- Additive — invitations, announcements, feedback, usage events

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS beta_mode BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS beta_cohort TEXT,
  ADD COLUMN IF NOT EXISTS beta_joined_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.beta_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  email TEXT,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'accepted', 'revoked', 'expired'
  )),
  invited_by UUID,
  notes TEXT,
  expires_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beta_invitations_status
  ON public.beta_invitations(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.beta_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'critical')),
  audience TEXT NOT NULL DEFAULT 'beta' CHECK (audience IN ('beta', 'all', 'admins')),
  href TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beta_announcements_active
  ON public.beta_announcements(active, starts_at DESC);

CREATE TABLE IF NOT EXISTS public.beta_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  user_id UUID,
  type TEXT NOT NULL CHECK (type IN ('bug', 'feature', 'general')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN (
    'critical', 'high', 'medium', 'low', 'info'
  )),
  category TEXT NOT NULL DEFAULT 'general',
  environment JSONB NOT NULL DEFAULT '{}'::jsonb,
  screenshot_url TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'triaged', 'in_progress', 'resolved', 'wont_fix', 'duplicate'
  )),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beta_feedback_org_created
  ON public.beta_feedback(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_type_status
  ON public.beta_feedback(type, status);

CREATE TABLE IF NOT EXISTS public.beta_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  user_id UUID,
  event_key TEXT NOT NULL,
  feature_key TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beta_usage_org_created
  ON public.beta_usage_events(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_beta_usage_feature
  ON public.beta_usage_events(feature_key, created_at DESC);

CREATE TABLE IF NOT EXISTS public.beta_org_flags (
  org_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.beta_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_org_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS beta_announcements_select ON public.beta_announcements;
CREATE POLICY beta_announcements_select ON public.beta_announcements
  FOR SELECT USING (active = true);

DROP POLICY IF EXISTS beta_feedback_select ON public.beta_feedback;
CREATE POLICY beta_feedback_select ON public.beta_feedback
  FOR SELECT USING (org_id IS NOT NULL AND public.is_org_member(org_id));

DROP POLICY IF EXISTS beta_usage_select ON public.beta_usage_events;
CREATE POLICY beta_usage_select ON public.beta_usage_events
  FOR SELECT USING (org_id IS NOT NULL AND public.is_org_member(org_id));

DROP POLICY IF EXISTS beta_org_flags_select ON public.beta_org_flags;
CREATE POLICY beta_org_flags_select ON public.beta_org_flags
  FOR SELECT USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS beta_invitations_select ON public.beta_invitations;
CREATE POLICY beta_invitations_select ON public.beta_invitations
  FOR SELECT USING (
    org_id IS NOT NULL AND public.has_org_role(org_id, 'admin')
  );
