-- 014_epic5_outreach_engine.sql
-- Epic 5: Outreach & Execution Engine

-- Email provider accounts (SMTP, Gmail OAuth, Outlook OAuth)
CREATE TABLE IF NOT EXISTS public.email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('mock', 'smtp', 'gmail', 'outlook')),
  from_email TEXT NOT NULL,
  from_name TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disconnected', 'error')),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reusable email templates with personalization tokens
CREATE TABLE IF NOT EXISTS public.outreach_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  tone TEXT NOT NULL DEFAULT 'professional' CHECK (tone IN ('professional', 'friendly', 'formal', 'casual', 'persuasive')),
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Outreach sequences
CREATE TABLE IF NOT EXISTS public.outreach_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'closed')),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.relationship_contacts(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.relationship_organizations(id) ON DELETE SET NULL,
  current_step INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sequence steps: initial_email, wait, follow_up, reminder, final_follow_up, close
CREATE TABLE IF NOT EXISTS public.outreach_sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES public.outreach_sequences(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  step_type TEXT NOT NULL CHECK (step_type IN (
    'initial_email', 'wait', 'follow_up', 'reminder', 'final_follow_up', 'close'
  )),
  delay_days INT NOT NULL DEFAULT 0,
  template_id UUID REFERENCES public.outreach_templates(id) ON DELETE SET NULL,
  subject TEXT,
  body_html TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sequence_id, step_order)
);

-- Conversation threads (inbox)
CREATE TABLE IF NOT EXISTS public.outreach_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  contact_id UUID REFERENCES public.relationship_contacts(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.relationship_organizations(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  sequence_id UUID REFERENCES public.outreach_sequences(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'snoozed', 'closed')),
  last_message_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Messages (compose, approve, send)
CREATE TABLE IF NOT EXISTS public.outreach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES public.outreach_threads(id) ON DELETE CASCADE,
  sequence_step_id UUID REFERENCES public.outreach_sequence_steps(id) ON DELETE SET NULL,
  direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound', 'inbound')),
  to_email TEXT NOT NULL,
  from_email TEXT,
  cc TEXT[],
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'pending_approval', 'approved', 'scheduled', 'sent', 'failed', 'cancelled'
  )),
  ai_generated BOOLEAN NOT NULL DEFAULT false,
  ai_type TEXT,
  tone TEXT DEFAULT 'professional',
  contact_id UUID REFERENCES public.relationship_contacts(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.relationship_organizations(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  email_account_id UUID REFERENCES public.email_accounts(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  provider_message_id TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deliverability tracking
CREATE TABLE IF NOT EXISTS public.outreach_deliverability_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.outreach_messages(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'spam'
  )),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Follow-up tasks
CREATE TABLE IF NOT EXISTS public.outreach_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES public.outreach_threads(id) ON DELETE CASCADE,
  sequence_id UUID REFERENCES public.outreach_sequences(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Extend approvals for outreach sends
ALTER TABLE public.approvals DROP CONSTRAINT IF EXISTS approvals_approval_type_check;
ALTER TABLE public.approvals ADD CONSTRAINT approvals_approval_type_check
  CHECK (approval_type IN (
    'opportunity', 'email_draft', 'content_draft', 'campaign_launch', 'outreach_send'
  ));

CREATE INDEX IF NOT EXISTS idx_email_accounts_ws ON public.email_accounts(workspace_id, is_default);
CREATE INDEX IF NOT EXISTS idx_outreach_threads_ws ON public.outreach_threads(workspace_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_messages_thread ON public.outreach_messages(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_messages_status ON public.outreach_messages(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_outreach_deliverability_msg ON public.outreach_deliverability_events(message_id, event_type);
CREATE INDEX IF NOT EXISTS idx_outreach_sequences_ws ON public.outreach_sequences(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_outreach_tasks_ws ON public.outreach_tasks(workspace_id, status, due_at);

ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_deliverability_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_accounts_all ON public.email_accounts
  FOR ALL TO authenticated USING (public.can_access_workspace(workspace_id)) WITH CHECK (public.can_access_workspace(workspace_id));
CREATE POLICY outreach_templates_all ON public.outreach_templates
  FOR ALL TO authenticated USING (public.can_access_workspace(workspace_id)) WITH CHECK (public.can_access_workspace(workspace_id));
CREATE POLICY outreach_sequences_all ON public.outreach_sequences
  FOR ALL TO authenticated USING (public.can_access_workspace(workspace_id)) WITH CHECK (public.can_access_workspace(workspace_id));
CREATE POLICY outreach_sequence_steps_all ON public.outreach_sequence_steps
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.outreach_sequences s WHERE s.id = sequence_id AND public.can_access_workspace(s.workspace_id))
  );
CREATE POLICY outreach_threads_all ON public.outreach_threads
  FOR ALL TO authenticated USING (public.can_access_workspace(workspace_id)) WITH CHECK (public.can_access_workspace(workspace_id));
CREATE POLICY outreach_messages_all ON public.outreach_messages
  FOR ALL TO authenticated USING (public.can_access_workspace(workspace_id)) WITH CHECK (public.can_access_workspace(workspace_id));
CREATE POLICY outreach_deliverability_all ON public.outreach_deliverability_events
  FOR ALL TO authenticated USING (public.can_access_workspace(workspace_id)) WITH CHECK (public.can_access_workspace(workspace_id));
CREATE POLICY outreach_tasks_all ON public.outreach_tasks
  FOR ALL TO authenticated USING (public.can_access_workspace(workspace_id)) WITH CHECK (public.can_access_workspace(workspace_id));

CREATE TRIGGER email_accounts_updated_at BEFORE UPDATE ON public.email_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER outreach_templates_updated_at BEFORE UPDATE ON public.outreach_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER outreach_sequences_updated_at BEFORE UPDATE ON public.outreach_sequences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER outreach_threads_updated_at BEFORE UPDATE ON public.outreach_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER outreach_messages_updated_at BEFORE UPDATE ON public.outreach_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER outreach_tasks_updated_at BEFORE UPDATE ON public.outreach_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
