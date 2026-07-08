-- 001_extensions.sql
-- SEO OS — Sprint 0 foundation

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- pgvector enabled in migration 008 (Sprint 7 — Knowledge Base)
-- CREATE EXTENSION IF NOT EXISTS vector;
