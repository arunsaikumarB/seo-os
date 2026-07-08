# 03 — DATABASE FREEZE

**Product:** SEO OS  
**Document Type:** Architecture Freeze — Data Model & Persistence  
**Version:** 1.1.0-FROZEN  
**Platform:** Supabase PostgreSQL + pgvector + RLS  
**Status:** Approved — Pending Formal Sign-Off

---

## Purpose

Lock table inventory, relationships, constraints, indexes, RLS model, migration order, seed strategy, and data lifecycle policies. No implementation SQL in this document — structural specification only.

---

## Final Decisions

### D1 — Naming

| Rule                    | Value                                                          |
| ----------------------- | -------------------------------------------------------------- |
| Primary workspace table | `workspaces`                                                   |
| API exposes as          | `projectId`                                                    |
| Soft delete column      | `status = 'archived'` on workspaces; no hard delete in MVP     |
| Timestamps              | `created_at`, `updated_at` on all mutable tables               |
| Primary keys            | UUID v4 via `gen_random_uuid()`                                |
| JSONB metadata          | Allowed per entity with documented schema in `packages/shared` |

### D2 — MVP Table Inventory (FROZEN — 54 Tables)

**Tenancy & Identity (6)**  
`organizations`, `profiles`, `org_members`, `org_invites`, `workspaces`, `workspace_settings`

**SEO Inputs (4)**  
`competitors`, `competitor_snapshots`, `keywords`, `keyword_groups`

**Prospects & Backlinks (6)**  
`prospects`, `prospect_contacts`, `prospect_scores`, `backlink_opportunities`, `backlinks`, `backlink_checks`

**Outreach & CRM (8)**  
`campaigns`, `campaign_prospects`, `sequences`, `sequence_steps`, `outreach_threads`, `outreach_messages`, `contacts`, `relationship_events`

**Content (3)**  
`content_briefs`, `content_pieces`, `content_versions`

**AI Core (10)**  
`agent_definitions`, `agent_runs`, `agent_run_steps`, `agent_artifacts`, `agent_approvals`, `ai_settings`, `ai_usage_ledger`, `prompt_templates`, `ai_conversations`, `ai_messages`

**Memory & RAG (6)**  
`kb_documents`, `kb_chunks`, `kb_embeddings`, `kb_ingestion_jobs`, `memory_entries`, `memory_facts`

**Technical SEO (3)**  
`crawl_runs`, `crawl_pages`, `crawl_issues`

**Analytics & Reports (3)**  
`metric_snapshots`, `reports`, `report_schedules` (schedules inactive MVP)

**Platform & Ops (9)**  
`audit_logs`, `notifications`, `notification_preferences`, `events`, `failed_jobs`, `idempotency_keys`, `onboarding_progress`, `provider_configs`, `search_index`

**Email (1)**  
`email_accounts`

**Demo & Waitlist (2)**  
`demo_scenarios`, `waitlist_signups`

**Playbooks (1)**  
`playbooks`

**Deferred to Alpha (not in MVP migrations)**  
`workspace_members`, `subscriptions`, `usage_records`, `api_keys`, `webhook_endpoints`, `webhook_deliveries`, `plugins`, `plugin_installations`

### D3 — New Tables (Added at Freeze — vs Prior Spec)

| Table                      | Purpose                                              |
| -------------------------- | ---------------------------------------------------- |
| `agent_run_steps`          | Parent/child agent DAG; CEO orchestration visibility |
| `playbooks`                | Backlink Builder active playbook per project         |
| `failed_jobs`              | Dead letter visibility for pg-boss                   |
| `idempotency_keys`         | Persistent idempotency (email send, agent run)       |
| `onboarding_progress`      | UX checklist state                                   |
| `search_index`             | Universal search denormalized index                  |
| `notification_preferences` | Per-user event × channel matrix                      |
| `demo_scenarios`           | CEO demo presets and replay config                   |
| `ai_conversations`         | Command Center chat sessions per project             |
| `ai_messages`              | Chat messages (user/assistant/tool) with agent refs  |

**Table: `ai_conversations`**  
Columns: id, workspace_id, user_id, title, mode (live/replay), created_at, updated_at

**Table: `ai_messages`**  
Columns: id, conversation_id, workspace_id, role (user/assistant/system/tool), content, agent_type nullable, agent_run_id nullable, citations JSONB, created_at
| `domain_verifications` | **Added:** verification history (multi-method) |

**Table: `domain_verifications`**  
Columns: id, workspace_id, method (dns/html), token, status, verified_at, created_at

### D4 — Key Relationships (FROZEN)

```
organizations 1──* workspaces
organizations 1──* org_members *──1 profiles
workspaces 1──* [all project-scoped tables]
agent_runs 1──* agent_run_steps (parent_run_id nullable)
agent_runs 1──* agent_artifacts
workspaces 1──1 playbooks (active_playbook_id FK nullable)
prospects *──* campaigns via campaign_prospects
outreach_threads 1──* outreach_messages
kb_documents 1──* kb_chunks 1──1 kb_embeddings
```

### D5 — Constraints (FROZEN)

| Constraint                              | Rule                                                                |
| --------------------------------------- | ------------------------------------------------------------------- |
| UNIQUE(org_id, domain)                  | workspaces                                                          |
| UNIQUE(workspace_id, domain)            | prospects                                                           |
| UNIQUE(workspace_id, keyword)           | keywords                                                            |
| UNIQUE(workspace_id, competitor domain) | competitors                                                         |
| UNIQUE(org_id, user_id)                 | org_members                                                         |
| UNIQUE(idempotency_key, scope)          | idempotency_keys                                                    |
| outreach_messages send                  | status must be `approved` before `sent` (app + DB check constraint) |
| agent_artifacts                         | version increments per entity                                       |

### D6 — Indexes (FROZEN — MVP Minimum)

| Table             | Index                                                       |
| ----------------- | ----------------------------------------------------------- |
| workspaces        | (org_id, status)                                            |
| prospects         | (workspace_id, status), (workspace_id, domain)              |
| agent_runs        | (workspace_id, created_at DESC), (workspace_id, agent_type) |
| outreach_messages | (thread_id), (status) WHERE status = 'pending_approval'     |
| audit_logs        | (org_id, created_at DESC)                                   |
| events            | (published, created_at) WHERE published = false             |
| kb_embeddings     | HNSW on embedding vector                                    |
| search_index      | GIN on tsvector_content                                     |
| metric_snapshots  | UNIQUE(workspace_id, metric_date)                           |
| idempotency_keys  | UNIQUE(key, endpoint_scope)                                 |

### D7 — Embedding Specification

| Setting       | Value                                                               |
| ------------- | ------------------------------------------------------------------- |
| Extension     | pgvector                                                            |
| Dimension     | **768** (frozen — validate Gemini `text-embedding-004` at Sprint 4) |
| Index type    | HNSW (cosine)                                                       |
| Hybrid search | tsvector on kb_chunks.content + vector similarity                   |

**Freeze note:** If Gemini returns 3072-dim, use Matryoshka truncation to 768 or separate column — decision locked at implementation Week 3 with dimension validation test.

### D8 — RLS Policy Model (FROZEN)

**Helper functions (Postgres):**

- `auth_user_id()` → `auth.uid()`
- `is_org_member(org_id)` → boolean
- `has_org_role(org_id, min_role)` → boolean using role hierarchy: owner(5) > admin(4) > manager(3) > member(2) > viewer(1)
- `can_access_workspace(workspace_id)` → org member AND workspace not archived (or admin)

**Policy template — all `workspace_id` tables:**

- SELECT: `can_access_workspace(workspace_id)`
- INSERT/UPDATE: `can_access_workspace(workspace_id) AND has_org_role(org_id, 'member')`
- DELETE: `has_org_role(org_id, 'manager')` OR soft-delete via status

**Stricter tables:**

- `email_accounts`: admin+
- `ai_settings`, `provider_configs`: manager+ read, admin+ write
- `audit_logs`: admin+ read, insert via service role only
- `demo_scenarios`: service role only (internal seed)

**Service role:** Workers use service role + mandatory `workspace_id` filter in application code.

### D9 — Views & Materialized Views

| Object                        | Purpose                   | Refresh                        |
| ----------------------------- | ------------------------- | ------------------------------ |
| `v_project_dashboard`         | Mission Control aggregate | Real-time view                 |
| `v_prospect_pipeline_summary` | Kanban counts             | Real-time view                 |
| `v_outreach_funnel`           | Funnel metrics            | Real-time view                 |
| `mv_project_kpis`             | Analytics performance     | Hourly job `metrics.aggregate` |

### D10 — Triggers (Specification)

| Trigger             | Event                                | Action                |
| ------------------- | ------------------------------------ | --------------------- |
| Profile on signup   | auth.users INSERT                    | Insert profiles row   |
| updated_at          | workspaces, projects settings UPDATE | Set updated_at        |
| Audit outreach send | outreach_messages → sent             | Insert audit_logs     |
| Memory on reply     | outreach_messages inbound INSERT     | Insert memory_entries |
| Notify approval     | message → pending_approval           | Insert notifications  |
| Search index sync   | prospects, content INSERT/UPDATE     | Upsert search_index   |

### D11 — Migration Order (FROZEN)

| #   | Migration         | Contents                                                                                |
| --- | ----------------- | --------------------------------------------------------------------------------------- |
| 001 | extensions        | pgvector, pg_trgm, uuid-ossp                                                            |
| 002 | core_tenancy      | orgs, profiles, org_members, org_invites                                                |
| 003 | workspaces        | workspaces, workspace_settings, domain_verifications                                    |
| 004 | seo_inputs        | competitors, snapshots, keywords, groups                                                |
| 005 | prospects         | prospects, contacts, scores                                                             |
| 006 | ai_core           | agent_definitions (seed 14), runs, steps, artifacts, approvals, conversations, messages |
| 007 | ai_config         | ai_settings, prompts, usage_ledger                                                      |
| 008 | memory_kb         | kb__, memory__, ingestion_jobs                                                          |
| 009 | outreach          | campaigns, threads, messages, sequences, contacts, CRM                                  |
| 010 | content           | briefs, pieces, versions                                                                |
| 011 | backlinks         | opportunities, backlinks, checks, playbooks                                             |
| 012 | technical         | crawl_*                                                                                 |
| 013 | analytics         | metric_snapshots, reports, schedules                                                    |
| 014 | platform          | audit, notifications, prefs, events, failed_jobs, idempotency                           |
| 015 | search_onboarding | search_index, onboarding_progress                                                       |
| 016 | demo              | demo_scenarios, waitlist_signups                                                        |
| 017 | email             | email_accounts                                                                          |
| 018 | rls               | All policies                                                                            |
| 019 | views             | Views + materialized views                                                              |
| 020 | indexes           | Performance indexes                                                                     |
| 021 | seed_demo         | Hero demo data                                                                          |

### D12 — Seed Strategy (FROZEN)

| Seed                     | When          | Contents                                       |
| ------------------------ | ------------- | ---------------------------------------------- |
| `seed_agent_definitions` | Migration 006 | 14 agent rows                                  |
| `seed_demo`              | Migration 021 | Acme Agency hero project (see CEO Demo Freeze) |
| `seed_dev`               | Manual local  | Minimal org for developers                     |

**Demo seed uses fixed UUIDs** for reproducible CEO path.

### D13 — Data Retention (MVP)

| Data                   | Retention                       |
| ---------------------- | ------------------------------- |
| audit_logs             | 2 years MVP                     |
| agent_runs + artifacts | Indefinite (workspace lifetime) |
| crawl_pages            | 90 days                         |
| failed_jobs            | 30 days                         |
| idempotency_keys       | 24 hours                        |
| notifications          | 90 days read; 180 days unread   |

### D14 — Backup & Export

| Policy                     | MVP                                                   |
| -------------------------- | ----------------------------------------------------- |
| Supabase automated backups | Daily (free tier)                                     |
| Manual export              | `POST /projects/:id/export` → JSON archive in Storage |
| GDPR purge                 | `DELETE /projects/:id/purge` — Owner only, queued job |

---

## Assumptions

1. Supabase Free Tier sufficient for MVP (< 500MB data)
2. Single Postgres instance — no read replicas in MVP
3. pg-boss job tables live in same database (schema: `pgboss`)
4. Large content (>100KB) stored in Supabase Storage; DB holds path reference
5. Full-text search via Postgres only — no Elasticsearch in MVP

---

## Risks

| Risk                         | Mitigation                                   |
| ---------------------------- | -------------------------------------------- |
| Embedding dimension mismatch | Validation test in Week 3                    |
| RLS policy bugs              | Automated RLS test suite — mandatory CI gate |
| JSONB schema drift           | Zod schemas in shared package                |
| Connection pool exhaustion   | PgBouncer via Supabase; worker pool limits   |
| Migration 021 size           | Idempotent upsert on fixed UUIDs             |

---

## Resolved Open Questions

| ID   | Decision                                                |
| ---- | ------------------------------------------------------- |
| DQ-1 | Embedding dimension: **768** (validate Sprint 4)        |
| DQ-2 | Email bodies: **DB if < 50KB; Storage if larger**       |
| DQ-3 | `report_schedules` in MVP migrations: **Yes, inactive** |

## Open Questions

**None.**

---

## Review Checklist

- [x] 54 MVP tables account for all frozen features
- [ ] Deferred tables explicitly excluded from migrations 001–021
- [ ] RLS helper function names frozen
- [ ] Migration order has no circular FK dependencies
- [ ] Seed demo UUIDs documented in CEO Demo Freeze
- [ ] Soft-delete policy consistent (workspaces archived, not deleted)
- [ ] idempotency_keys table included
- [ ] search_index included for command palette
- [ ] Embedding dimension decision path documented

---

## Sign-Off Criteria

| Role               | Criteria                                         | Sign-Off |
| ------------------ | ------------------------------------------------ | -------- |
| Principal Engineer | All frozen API endpoints have backing tables     | ☐        |
| DBA / Architect    | ER diagram matches table inventory               | ☐        |
| Security           | RLS model covers all workspace tables            | ☐        |
| DevOps             | Backup + retention policies acceptable           | ☐        |
| CTO                | No premature enterprise tables in MVP migrations | ☐        |

---

_ER diagram: see `docs/architecture-freeze/diagrams/er-diagram.mmd` (to be generated at implementation kickoff)._
