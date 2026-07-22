-- 091_execution_truth_engine.sql
-- Phase 4.5: Evidence records + truth violation log (additive)

CREATE TABLE IF NOT EXISTS public.execution_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.execution_jobs(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  claim TEXT NOT NULL,
  detector_id TEXT,
  signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  url TEXT,
  screenshot_path TEXT,
  dom_snapshot_path TEXT,
  stage TEXT,
  worker_id TEXT,
  lease_generation INT,
  verified BOOLEAN NOT NULL DEFAULT true,
  unclassified BOOLEAN NOT NULL DEFAULT false,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_execution_evidence_job
  ON public.execution_evidence (job_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_execution_evidence_opportunity
  ON public.execution_evidence (opportunity_id)
  WHERE opportunity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_execution_evidence_ws
  ON public.execution_evidence (workspace_id, captured_at DESC);

ALTER TABLE public.execution_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY execution_evidence_all ON public.execution_evidence
  FOR ALL USING (
    workspace_id IN (SELECT id FROM public.workspaces WHERE org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
    ))
  )
  WITH CHECK (
    workspace_id IN (SELECT id FROM public.workspaces WHERE org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
    ))
  );

-- Rejected / truth-violation audit log (dev Campaign Health)
CREATE TABLE IF NOT EXISTS public.execution_truth_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id UUID,
  opportunity_id UUID,
  kind TEXT NOT NULL,
  source TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_execution_truth_violations_ws
  ON public.execution_truth_violations (workspace_id, created_at DESC);

ALTER TABLE public.execution_truth_violations ENABLE ROW LEVEL SECURITY;
CREATE POLICY execution_truth_violations_all ON public.execution_truth_violations
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

-- Additive job flags for verified interventions / unclassified
ALTER TABLE public.execution_jobs
  ADD COLUMN IF NOT EXISTS evidence_id UUID REFERENCES public.execution_evidence(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS truth_claim TEXT,
  ADD COLUMN IF NOT EXISTS unclassified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_ai_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_review_attempted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS false_intervention BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_execution_jobs_evidence
  ON public.execution_jobs (evidence_id)
  WHERE evidence_id IS NOT NULL;
