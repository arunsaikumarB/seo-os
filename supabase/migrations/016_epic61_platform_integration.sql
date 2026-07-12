-- 016_epic61_platform_integration.sql
-- Epic 6.1: Platform event bus, notifications, audit log
-- Additive only — no breaking schema changes to existing modules.

CREATE TABLE IF NOT EXISTS public.platform_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_module TEXT NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  title TEXT NOT NULL,
  summary TEXT,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN (
    'info', 'success', 'warning', 'failure', 'approval', 'recommendation', 'system'
  )),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_events_workspace_created
  ON public.platform_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_events_org_created
  ON public.platform_events(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_events_type
  ON public.platform_events(event_type);
CREATE INDEX IF NOT EXISTS idx_platform_events_entity
  ON public.platform_events(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.platform_events(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'system' CHECK (category IN (
    'success', 'warning', 'failure', 'approval', 'recommendation', 'system'
  )),
  title TEXT NOT NULL,
  body TEXT,
  href TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  actor_id UUID,
  actor_type TEXT NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user', 'ai', 'workflow', 'system')),
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  before_state JSONB,
  after_state JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created
  ON public.audit_logs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON public.audit_logs(action);

ALTER TABLE public.platform_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_events_select ON public.platform_events;
CREATE POLICY platform_events_select ON public.platform_events
  FOR SELECT USING (
    (workspace_id IS NOT NULL AND public.can_access_workspace(workspace_id))
    OR (org_id IS NOT NULL AND public.is_org_member(org_id))
  );

DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_update ON public.notifications;
CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs
  FOR SELECT USING (public.is_org_member(org_id));

-- Realtime: allow clients to subscribe to platform_events inserts
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_events;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END $$;
