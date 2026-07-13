-- V1.1 Phase 3: Keyword primary flag + type recommendations

ALTER TABLE keywords
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_keywords_primary
  ON keywords(workspace_id)
  WHERE is_primary = true;

CREATE TABLE IF NOT EXISTS backlink_type_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  recommendation_type TEXT NOT NULL,
  score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  rationale TEXT NOT NULL,
  metrics_source TEXT NOT NULL DEFAULT 'estimated'
    CHECK (metrics_source IN ('estimated', 'live', 'user')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_backlink_type_recommendations_workspace
  ON backlink_type_recommendations(workspace_id, score DESC);
