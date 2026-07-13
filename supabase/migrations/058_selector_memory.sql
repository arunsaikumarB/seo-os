-- 058_selector_memory.sql

CREATE TABLE IF NOT EXISTS public.selector_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  site_domain TEXT NOT NULL,
  field_key TEXT NOT NULL,
  control_type TEXT,
  selector_css TEXT,
  selector_xpath TEXT,
  selector_fallback JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence NUMERIC(5,2) NOT NULL DEFAULT 50,
  success_count INT NOT NULL DEFAULT 0,
  failure_count INT NOT NULL DEFAULT 0,
  dom_hash TEXT,
  last_verified_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'detected'
    CHECK (source IN ('detected', 'learned', 'user')),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_selector_memory_unique
  ON public.selector_memory(COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), site_domain, field_key)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_selector_memory_domain
  ON public.selector_memory(site_domain, confidence DESC);

ALTER TABLE public.selector_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY selector_memory_all ON public.selector_memory
  FOR ALL USING (
    workspace_id IS NULL OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE org_id IN (
        SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    workspace_id IS NULL OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE org_id IN (
        SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
      )
    )
  );
