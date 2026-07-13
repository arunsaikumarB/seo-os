-- 078_provider_credentials.sql
-- Encrypted secrets — client SELECT denied; service role only

CREATE TABLE IF NOT EXISTS public.provider_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL REFERENCES public.provider_registry(provider_key),
  auth_mode TEXT NOT NULL DEFAULT 'api_key'
    CHECK (auth_mode IN ('none', 'api_key', 'oauth', 'password', 'endpoint')),
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT,
  key_version INT NOT NULL DEFAULT 1,
  label TEXT,
  expires_at TIMESTAMPTZ,
  rotated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_credentials_scope
  ON public.provider_credentials(org_id, provider_key)
  WHERE deleted_at IS NULL;

ALTER TABLE public.provider_credentials ENABLE ROW LEVEL SECURITY;
-- Never expose ciphertext to clients
CREATE POLICY provider_credentials_deny_select ON public.provider_credentials
  FOR SELECT USING (false);
CREATE POLICY provider_credentials_member_write ON public.provider_credentials
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member'))
  );
CREATE POLICY provider_credentials_member_update ON public.provider_credentials
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member'))
  );
CREATE POLICY provider_credentials_member_delete ON public.provider_credentials
  FOR DELETE USING (
    org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );
