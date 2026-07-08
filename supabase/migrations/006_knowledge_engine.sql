-- 006_knowledge_engine.sql
-- Sprint 3: Knowledge Base, RAG, Memory, AI Chat

CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Knowledge Base ───────────────────────────────────────────────────────────

CREATE TABLE public.kb_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  filename TEXT,
  mime_type TEXT NOT NULL DEFAULT 'text/plain',
  content_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'ready', 'failed', 'archived')),
  byte_size INT NOT NULL DEFAULT 0,
  chunk_count INT NOT NULL DEFAULT 0,
  error TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.kb_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.kb_documents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  token_count INT NOT NULL DEFAULT 0,
  search_vector TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

CREATE TABLE public.kb_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL UNIQUE REFERENCES public.kb_chunks(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  embedding vector(768) NOT NULL,
  model TEXT NOT NULL DEFAULT 'text-embedding-004',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.kb_ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.kb_documents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Memory ─────────────────────────────────────────────────────────────────

CREATE TABLE public.memory_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'episodic'
    CHECK (tier IN ('episodic', 'brand', 'project', 'conversation', 'prompt')),
  source_type TEXT NOT NULL DEFAULT 'system',
  source_id TEXT,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.memory_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  fact_type TEXT NOT NULL DEFAULT 'semantic'
    CHECK (fact_type IN ('semantic', 'brand', 'project', 'approved_prompt')),
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'archived')),
  source_entry_id UUID REFERENCES public.memory_entries(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Context support tables (minimal for Sprint 3) ───────────────────────────

CREATE TABLE public.keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, keyword)
);

CREATE TABLE public.competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, domain)
);

-- ─── AI Chat ─────────────────────────────────────────────────────────────────

CREATE TABLE public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New conversation',
  mode TEXT NOT NULL DEFAULT 'live' CHECK (mode IN ('live', 'replay')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  agent_type TEXT,
  agent_run_id UUID REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX idx_kb_documents_workspace ON public.kb_documents(workspace_id, status);
CREATE INDEX idx_kb_chunks_workspace ON public.kb_chunks(workspace_id);
CREATE INDEX idx_kb_chunks_search ON public.kb_chunks USING GIN (search_vector);
CREATE INDEX idx_kb_embeddings_hnsw ON public.kb_embeddings
  USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_memory_entries_workspace ON public.memory_entries(workspace_id, tier, created_at DESC);
CREATE INDEX idx_memory_facts_workspace ON public.memory_facts(workspace_id, status);
CREATE INDEX idx_keywords_workspace ON public.keywords(workspace_id);
CREATE INDEX idx_competitors_workspace ON public.competitors(workspace_id);
CREATE INDEX idx_ai_conversations_workspace ON public.ai_conversations(workspace_id, updated_at DESC);
CREATE INDEX idx_ai_messages_conversation ON public.ai_messages(conversation_id, created_at);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.kb_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY kb_documents_all ON public.kb_documents
  FOR ALL TO authenticated
  USING (public.can_access_workspace(workspace_id))
  WITH CHECK (public.can_access_workspace(workspace_id));

CREATE POLICY kb_chunks_select ON public.kb_chunks
  FOR SELECT TO authenticated USING (public.can_access_workspace(workspace_id));

CREATE POLICY kb_embeddings_select ON public.kb_embeddings
  FOR SELECT TO authenticated USING (public.can_access_workspace(workspace_id));

CREATE POLICY kb_ingestion_jobs_select ON public.kb_ingestion_jobs
  FOR SELECT TO authenticated USING (public.can_access_workspace(workspace_id));

CREATE POLICY memory_entries_all ON public.memory_entries
  FOR ALL TO authenticated
  USING (public.can_access_workspace(workspace_id))
  WITH CHECK (public.can_access_workspace(workspace_id));

CREATE POLICY memory_facts_all ON public.memory_facts
  FOR ALL TO authenticated
  USING (public.can_access_workspace(workspace_id))
  WITH CHECK (public.can_access_workspace(workspace_id));

CREATE POLICY keywords_all ON public.keywords
  FOR ALL TO authenticated
  USING (public.can_access_workspace(workspace_id))
  WITH CHECK (public.can_access_workspace(workspace_id));

CREATE POLICY competitors_all ON public.competitors
  FOR ALL TO authenticated
  USING (public.can_access_workspace(workspace_id))
  WITH CHECK (public.can_access_workspace(workspace_id));

CREATE POLICY ai_conversations_all ON public.ai_conversations
  FOR ALL TO authenticated
  USING (public.can_access_workspace(workspace_id) AND user_id = public.auth_user_id())
  WITH CHECK (public.can_access_workspace(workspace_id) AND user_id = public.auth_user_id());

CREATE POLICY ai_messages_all ON public.ai_messages
  FOR ALL TO authenticated
  USING (public.can_access_workspace(workspace_id))
  WITH CHECK (public.can_access_workspace(workspace_id));

CREATE TRIGGER kb_documents_updated_at
  BEFORE UPDATE ON public.kb_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER memory_facts_updated_at
  BEFORE UPDATE ON public.memory_facts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER ai_conversations_updated_at
  BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Hybrid search RPC (vector + full-text, frozen weights 0.7 / 0.3)
CREATE OR REPLACE FUNCTION public.kb_hybrid_search(
  p_workspace_id UUID,
  p_query TEXT,
  p_query_embedding vector(768),
  p_limit INT DEFAULT 5,
  p_min_score FLOAT DEFAULT 0.0
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  content TEXT,
  score FLOAT,
  document_title TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH vector_scores AS (
    SELECT
      c.id AS chunk_id,
      c.document_id,
      c.content,
      1 - (e.embedding <=> p_query_embedding) AS vscore,
      d.title AS document_title
    FROM kb_chunks c
    JOIN kb_embeddings e ON e.chunk_id = c.id
    JOIN kb_documents d ON d.id = c.document_id
    WHERE c.workspace_id = p_workspace_id
      AND d.status = 'ready'
  ),
  text_scores AS (
    SELECT
      c.id AS chunk_id,
      c.document_id,
      c.content,
      ts_rank_cd(c.search_vector, plainto_tsquery('english', p_query)) AS tscore,
      d.title AS document_title
    FROM kb_chunks c
    JOIN kb_documents d ON d.id = c.document_id
    WHERE c.workspace_id = p_workspace_id
      AND d.status = 'ready'
      AND c.search_vector @@ plainto_tsquery('english', p_query)
  ),
  combined AS (
    SELECT
      COALESCE(v.chunk_id, t.chunk_id) AS chunk_id,
      COALESCE(v.document_id, t.document_id) AS document_id,
      COALESCE(v.content, t.content) AS content,
      (COALESCE(v.vscore, 0) * 0.7 + COALESCE(t.tscore, 0) * 0.3) AS score,
      COALESCE(v.document_title, t.document_title) AS document_title
    FROM vector_scores v
    FULL OUTER JOIN text_scores t ON v.chunk_id = t.chunk_id
  )
  SELECT chunk_id, document_id, content, score, document_title
  FROM combined
  WHERE score >= p_min_score
  ORDER BY score DESC
  LIMIT p_limit;
$$;
