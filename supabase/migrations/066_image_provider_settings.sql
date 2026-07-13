-- 066_image_provider_settings.sql

CREATE TABLE IF NOT EXISTS public.image_provider_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  secrets_ref UUID,
  health_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (health_status IN ('unknown', 'healthy', 'degraded', 'down', 'unconfigured')),
  last_health_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_image_provider_settings_unique
  ON public.image_provider_settings(COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), provider_key)
  WHERE deleted_at IS NULL;

ALTER TABLE public.image_provider_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY image_provider_settings_all ON public.image_provider_settings
  FOR ALL USING (
    workspace_id IS NULL OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE org_id IN (
        SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))
  )
  WITH CHECK (
    workspace_id IS NULL OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE org_id IN (
        SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))
  );

INSERT INTO public.image_provider_settings (provider_key, enabled, is_default, config, health_status)
SELECT * FROM (VALUES
  ('flux', true, true, '{"model":"flux-schnell","freeDefault":true}'::jsonb, 'unconfigured'),
  ('sdxl', true, false, '{"model":"sdxl","freeDefault":true}'::jsonb, 'unconfigured'),
  ('comfy', false, false, '{"baseUrl":""}'::jsonb, 'unconfigured'),
  ('openai', false, false, '{}'::jsonb, 'unconfigured'),
  ('gemini', false, false, '{}'::jsonb, 'unconfigured'),
  ('firefly', false, false, '{}'::jsonb, 'unconfigured'),
  ('a1111', false, false, '{"baseUrl":""}'::jsonb, 'unconfigured')
) AS v(provider_key, enabled, is_default, config, health_status)
WHERE NOT EXISTS (
  SELECT 1 FROM public.image_provider_settings s WHERE s.provider_key = v.provider_key AND s.workspace_id IS NULL
);
