-- Company substitute for 006_knowledge_engine.sql — NO pgvector / kb_* tables.
-- Keeps memory + keywords + competitors + AI chat used by pipeline brand context.

CREATE TABLE IF NOT EXISTS public.memory_entries (
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

CREATE TABLE IF NOT EXISTS public.memory_facts (
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

CREATE TABLE IF NOT EXISTS public.keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, keyword)
);

CREATE TABLE IF NOT EXISTS public.competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, domain)
);

CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New conversation',
  mode TEXT NOT NULL DEFAULT 'live' CHECK (mode IN ('live', 'replay')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  agent_type TEXT,
  agent_run_id UUID,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_entries_workspace
  ON public.memory_entries(workspace_id, tier, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_facts_workspace
  ON public.memory_facts(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_keywords_workspace ON public.keywords(workspace_id);
CREATE INDEX IF NOT EXISTS idx_competitors_workspace ON public.competitors(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_workspace
  ON public.ai_conversations(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation
  ON public.ai_messages(conversation_id, created_at);

DO $$ BEGIN
  CREATE TRIGGER memory_facts_updated_at
    BEFORE UPDATE ON public.memory_facts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER ai_conversations_updated_at
    BEFORE UPDATE ON public.ai_conversations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
