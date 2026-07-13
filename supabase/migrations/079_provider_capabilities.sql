-- 079_provider_capabilities.sql

CREATE TABLE IF NOT EXISTS public.provider_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key TEXT NOT NULL REFERENCES public.provider_registry(provider_key) ON DELETE CASCADE,
  capability_key TEXT NOT NULL,
  label TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_key, capability_key)
);

CREATE INDEX IF NOT EXISTS idx_provider_capabilities_key
  ON public.provider_capabilities(provider_key);

ALTER TABLE public.provider_capabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY provider_capabilities_select ON public.provider_capabilities
  FOR SELECT USING (true);

INSERT INTO public.provider_capabilities (provider_key, capability_key, label)
SELECT r.provider_key, cap, initcap(replace(cap, '_', ' '))
FROM public.provider_registry r
CROSS JOIN LATERAL jsonb_array_elements_text(r.capabilities) AS cap
ON CONFLICT (provider_key, capability_key) DO NOTHING;
