-- 105_companion_domain_knowledge.sql
-- Shared Companion field-mapping knowledge (org-scoped). No AI.

CREATE TABLE IF NOT EXISTS public.companion_domain_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  field_mappings JSONB NOT NULL DEFAULT '[]'::jsonb,
  category_mapping JSONB NOT NULL DEFAULT '[]'::jsonb,
  wizard_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_verified_at TIMESTAMPTZ,
  success_count INT NOT NULL DEFAULT 0,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT companion_domain_knowledge_domain_check CHECK (char_length(trim(domain)) > 0)
);

ALTER TABLE public.companion_domain_knowledge
  ADD CONSTRAINT companion_domain_knowledge_org_domain_key UNIQUE (org_id, domain);

CREATE INDEX IF NOT EXISTS idx_companion_domain_knowledge_org_updated
  ON public.companion_domain_knowledge (org_id, updated_at DESC);

ALTER TABLE public.companion_domain_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY companion_domain_knowledge_all ON public.companion_domain_knowledge
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.companion_domain_knowledge IS
  'SEO OS Companion verified field mappings per domain (shared learning, deterministic).';
