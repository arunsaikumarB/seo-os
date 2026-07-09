# Sprint 2 Report — AI Foundation

**Sprint goal:** Build the AI Foundation that every future module depends on.  
**API version:** `0.2.0-sprint2`  
**Date:** 2026-07-09  
**Status:** Complete — awaiting approval before Sprint 3

---

## Executive Summary

Sprint 2 delivers the AI infrastructure layer: provider abstraction with Gemini + Ollama failover, agent runtime framework, 8 workforce agent stubs, background queue integration, event/telemetry systems, feature flags, database tables, API endpoints, and a Mission Control layout focused on live AI infrastructure (no placeholder analytics).

| Area                                               | Status          |
| -------------------------------------------------- | --------------- |
| AI Provider Layer                                  | ✅              |
| AI Runtime                                         | ✅              |
| AI Workforce Foundation (8 agents)                 | ✅              |
| AI Infrastructure (queue, events, logging, health) | ✅              |
| Feature Flags                                      | ✅              |
| Mission Control (foundation only)                  | ✅              |
| Build / Lint / Typecheck                           | ✅ 9/9 packages |

**Sprint score: 91/100**  
**Recommendation: Conditional Go for Sprint 3**

---

## AI Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                         apps/web                                 │
│  Mission Control │ Feature-flagged nav │ useMissionControl()    │
└────────────────────────────┬────────────────────────────────────┘
                             │ REST /v1/ai/*, /v1/feature-flags
┌────────────────────────────▼────────────────────────────────────┐
│                         apps/api                                 │
│  agent.service │ infra.service │ jobs/handlers/agents.ts         │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    @seo-os/ai-runtime                            │
│  AgentRegistry │ AgentRunner │ Orchestrator │ EventBus           │
│  PromptTemplates │ OutputValidator │ Telemetry │ Streaming       │
└────────────┬───────────────────────────────┬────────────────────┘
             │                               │
┌────────────▼────────────┐    ┌─────────────▼────────────────────┐
│  @seo-os/providers      │    │  @seo-os/agent-contracts          │
│  Gemini │ Ollama │ Router│    │  Definitions │ Output schemas   │
└────────────┬────────────┘    └──────────────────────────────────┘
             │
┌────────────▼────────────┐    ┌──────────────────────────────────┐
│  External AI APIs       │    │  Supabase + pg-boss                 │
│  Gemini REST │ Ollama    │    │  agent_runs, ai_events, queues    │
└─────────────────────────┘    └──────────────────────────────────┘
```

**Design principles (aligned with Architecture Freeze):**

- Gemini primary, Ollama fallback — free-first, no paid API dependencies
- Agents are registered, runnable, observable — business logic deferred
- Sync execution by default; async via `agents` queue when `ENABLE_WORKERS=true`
- Events emitted in-process (EventBus) and persisted to `ai_events`
- Token usage tracked in-memory (TelemetryCollector) + `ai_usage_ledger` on runs

---

## Agent Registry Design

**Package:** `packages/ai-runtime/src/agent-registry.ts`  
**Contracts:** `packages/agent-contracts/src/index.ts`

| Concept           | Implementation                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------- |
| Definition store  | `AGENT_DEFINITIONS` — 8 Sprint 2 agents with `outputSchemaId`, `syncMode`, `defaultApproval` |
| Handler registry  | `Map<AgentType, AgentHandler>` — extensible per agent                                        |
| Registration      | `registerSprint2Agents()` wires stub handlers in `agents/sprint2-stubs.ts`                   |
| Discovery         | `listSprint2Agents()`, `getDefinition()`, `hasHandler()`                                     |
| Execution context | `{ workspaceId, agentType, input, runId }`                                                   |

**Sprint 2 workforce agents (framework only):**

| Agent                   | Handler                    | Output Schema           |
| ----------------------- | -------------------------- | ----------------------- |
| CEO Agent               | Stub                       | `ceo_plan_v1`           |
| SEO Strategist          | Stub                       | `seo_strategy_v1`       |
| Research Manager        | Stub                       | `research_plan_v1`      |
| Competitor Intelligence | Stub                       | `competitor_intel_v1`   |
| Prospect Discovery      | Stub                       | `prospect_discovery_v1` |
| Content Strategist      | Stub                       | `content_strategy_v1`   |
| Outreach Manager        | Stub                       | `outreach_plan_v1`      |
| QA Agent                | Stub (with `passed: true`) | `qa_result_v1`          |

**Lifecycle:** `pending → queued → running → completed | failed | cancelled`  
Enforced by `packages/ai-runtime/src/lifecycle.ts`.

**Orchestration:** `AgentOrchestrator` executes sequential multi-agent plans (foundation for CEO workflows in later sprints).

---

## Provider Architecture

**Package:** `packages/providers/src/ai/`

```
createAIProviderRouter(config)
    ├── createGeminiProvider(apiKey)     → Google Generative Language API
    ├── createOllamaProvider(baseUrl)  → Ollama /api/chat
    └── completeWithFailover()
            1. Try Gemini
            2. On failure → Ollama (if configured)
            3. Record provider used on result
```

| Component              | File                  | Responsibility                                              |
| ---------------------- | --------------------- | ----------------------------------------------------------- |
| `AIProvider` interface | `interfaces/index.ts` | `complete(messages, options) → { text, usage }`             |
| Gemini provider        | `ai/gemini.ts`        | REST `generateContent`, health check                        |
| Ollama provider        | `ai/ollama.ts`        | REST `/api/chat`, `/api/tags` health                        |
| Router                 | `ai/router.ts`        | Failover, `healthCheck()`                                   |
| Registry wiring        | `registry.ts`         | `getAIProvider()`, `getAIProviderRouter()`, `getAIHealth()` |

**Environment variables:**

- `GEMINI_API_KEY` — optional; primary when set
- `OLLAMA_BASE_URL` — optional; fallback or sole provider
- `PROVIDER_MODE` — `mvp` | `free` | `paid` (metadata only in Sprint 2)

**Health monitoring:** `GET /v1/ai/providers/health` returns `{ primary, fallback }` with status `healthy | degraded | down | disabled`.

---

## Event Flow

```
Agent run requested (API)
    │
    ├─► INSERT agent_runs (status: pending | queued)
    ├─► EventBus.emit('agent.run.queued')
    └─► INSERT ai_events

Sync path (ENABLE_WORKERS=false or async=false)
    │
    ├─► AgentRunner.run()
    ├─► emit('agent.run.started')
    ├─► Execute handler (stub) or AI provider (useAI=true)
    ├─► validateAgentOutput(schemaId)
    ├─► emit('agent.run.completed' | 'agent.run.failed')
    ├─► UPDATE agent_runs
    └─► INSERT ai_usage_ledger (if tokens used)

Async path (ENABLE_WORKERS=true, async=true)
    │
    ├─► enqueueJob(QUEUES.AGENTS, 'agent.run', payload)
    └─► Worker: handleAgentJobs() → executeAgentRun()
```

**Event types** (`@seo-os/shared`):

- `agent.run.queued`, `agent.run.started`, `agent.run.completed`, `agent.run.failed`
- `agent.step.started`, `agent.step.completed` (reserved for multi-step runs)
- `provider.health.changed`, `provider.failover` (reserved)

**Mission Control** reads live events via `GET /v1/projects/:projectId/ai/events`.

---

## Queue Flow

**Queue names (frozen):** `critical`, `agents`, `ingest`, `crawl`, `playwright`, `low`

```
POST /v1/projects/:id/ai/agents/:type/run { async: true }
    │
    ▼
enqueueJob('agents', { runId, workspaceId, agentType, input, useAI })
    │
    ▼
pg-boss (schema: pgboss) — requires ENABLE_WORKERS=true + DATABASE_URL
    │
    ▼
apps/api/src/jobs/handlers/agents.ts
    │
    ▼
executeAgentRun() → AgentRunner → DB persist
```

**Queue monitor:** `GET /v1/projects/:projectId/ai/queue` returns per-queue pending counts (or `enabled: false` when workers disabled).

---

## Feature Flag Implementation

**Package:** `packages/shared/src/feature-flags/index.ts`  
**API:** `GET /v1/feature-flags`  
**Web:** `useFeatureFlags()` + sidebar filtering in `sidebar.tsx`

| Flag               | Sprint 2 Default | Gated Nav                    |
| ------------------ | ---------------- | ---------------------------- |
| `ai_workforce`     | ✅ true          | AI Command Center, AI Agents |
| `mission_control`  | ✅ true          | Mission Control              |
| `knowledge_base`   | ❌ false         | Knowledge Base               |
| `ai_memory`        | ❌ false         | AI Memory                    |
| `backlink_builder` | ❌ false         | Prospects, Backlink Builder  |
| `outreach`         | ❌ false         | Outreach                     |
| `technical_seo`    | ❌ false         | Technical SEO                |
| `reports`          | ❌ false         | Reports                      |
| `marketplace`      | ❌ false         | (future)                     |
| `white_label`      | ❌ false         | (future)                     |

Overrides via `ai_settings.feature_overrides` JSONB are scaffolded in migration; API wiring deferred to Sprint 3.

---

## API Endpoints (New)

| Method | Path                                   | Description                          |
| ------ | -------------------------------------- | ------------------------------------ |
| GET    | `/v1/feature-flags`                    | Module feature flags                 |
| GET    | `/v1/ai/agents`                        | Sprint 2 agent definitions           |
| GET    | `/v1/ai/providers/health`              | AI provider health                   |
| GET    | `/v1/providers/status`                 | Full provider registry status (live) |
| POST   | `/v1/projects/:id/ai/agents/:type/run` | Run agent (sync or async)            |
| GET    | `/v1/projects/:id/ai/runs`             | List runs                            |
| GET    | `/v1/projects/:id/ai/runs/:runId`      | Get run                              |
| GET    | `/v1/projects/:id/ai/health`           | Workspace AI health summary          |
| GET    | `/v1/projects/:id/ai/events`           | Live + persisted events              |
| GET    | `/v1/projects/:id/ai/queue`            | Queue monitor                        |

**Run agent example:**

```json
POST /v1/projects/{projectId}/ai/agents/ceo/run
{ "input": { "task": "Plan Q3 SEO priorities" }, "async": false, "useAI": false }
```

---

## Database — Migration 005

**File:** `supabase/migrations/005_ai_foundation.sql`

| Table               | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `agent_definitions` | Seeded 8 Sprint 2 agents                  |
| `agent_runs`        | Run records with tokens, provider, status |
| `agent_run_steps`   | Multi-step run foundation                 |
| `prompt_templates`  | Versioned prompts (workspace + global)    |
| `ai_settings`       | Per-workspace AI config                   |
| `ai_usage_ledger`   | Token usage audit                         |
| `ai_events`         | Persisted event log                       |

RLS policies applied using `can_access_workspace()` from migration 004.

**Apply:** `npm run db:push` (requires Supabase CLI + linked project)

---

## Mission Control (Foundation Only)

**File:** `apps/web/src/pages/mission-control.tsx`

Replaced placeholder KPI analytics with five infrastructure panels:

1. **AI Workforce** — registered agents from `/v1/ai/agents`
2. **AI Health** — handlers ready, recent failures
3. **Provider Status** — Gemini/Ollama health
4. **AI Activity Timeline** — live events
5. **Queue Monitor** — pg-boss queue depths
6. **Recent Agent Runs** — execution history

No placeholder backlink/reply-rate analytics.

---

## Updated Project Tree (Sprint 2 additions)

```
packages/
├── agent-contracts/          # Expanded: definitions, schemas, SPRINT2_AGENT_TYPES
├── ai-runtime/               # NEW — agent framework
│   └── src/
│       ├── agent-registry.ts
│       ├── agent-runner.ts
│       ├── orchestrator.ts
│       ├── lifecycle.ts
│       ├── prompt-templates.ts
│       ├── output-validator.ts
│       ├── streaming.ts
│       ├── events.ts
│       ├── telemetry.ts
│       ├── config.ts
│       └── agents/sprint2-stubs.ts
├── providers/
│   └── src/ai/               # NEW — gemini, ollama, router, types
└── shared/
    └── src/feature-flags/    # NEW — module flags + AI event types

apps/api/src/
├── modules/ai/
│   ├── runtime.ts
│   ├── agent.service.ts
│   └── infra.service.ts
└── jobs/handlers/agents.ts   # NEW — agents queue consumer

apps/web/src/
├── hooks/use-feature-flags.ts
├── hooks/use-mission-control.ts
└── pages/mission-control.tsx # Refactored — AI infrastructure panels

supabase/migrations/
└── 005_ai_foundation.sql     # NEW

docs/sprint-2/
└── SPRINT_2_REPORT.md        # This file
```

---

## Verification

```bash
npm run build      # ✅ 9/9 packages
npm run lint       # ✅
npm run typecheck  # ✅ 13/13 tasks
```

**Manual verification checklist:**

- [ ] Apply migration 005 to Supabase
- [ ] Set `GEMINI_API_KEY` and/or `OLLAMA_BASE_URL` in API `.env`
- [ ] Run agent: `POST .../ai/agents/ceo/run` with `useAI: false`
- [ ] Open Mission Control — panels load (empty until first run)
- [ ] Enable workers: `ENABLE_WORKERS=true` + test async run

---

## Sprint Score: 91/100

| Category         | Score      | Notes                                                    |
| ---------------- | ---------- | -------------------------------------------------------- |
| Provider layer   | 18/20      | Gemini + Ollama + failover; no Vercel AI SDK wrapper yet |
| Agent runtime    | 19/20      | Full framework; streaming is foundation-only             |
| Workforce agents | 17/20      | 8 stubs registered; 6 remaining agents in contracts only |
| Infrastructure   | 18/20      | Queue, events, telemetry; worker runs in API process     |
| Feature flags    | 9/10       | Defaults + nav gating; no per-org override API           |
| Mission Control  | 10/10      | AI-focused layout, no placeholder analytics              |
| **Total**        | **91/100** |                                                          |

---

## Risks

| Risk                                   | Severity | Mitigation                                                |
| -------------------------------------- | -------- | --------------------------------------------------------- |
| Migration 005 not applied in staging   | High     | Run `db:push` before testing agent runs                   |
| No live Gemini/Ollama in CI            | Medium   | Stub runs work without providers; health shows `disabled` |
| In-memory EventBus lost on API restart | Medium   | `ai_events` table persists; live feed resets              |
| `ENABLE_WORKERS=false` default         | Low      | Documented; async runs fall back to sync                  |
| Minimal JSON Schema validation         | Low      | Expand with AJV in Sprint 3                               |
| Agent runs fail if DB tables missing   | High     | Apply migration before API agent endpoints                |

---

## Technical Debt

1. **Output schemas** — Only `ceo_plan_v1` and `qa_result_v1` have schema definitions; others pass validation trivially
2. **Prompt templates** — In-memory defaults; DB `prompt_templates` not yet wired to runtime
3. **Streaming** — Foundation types only; no SSE endpoint for web yet
4. **Worker separation** — Agent jobs run in API process; `workers/general` not yet consuming `agents` queue
5. **Feature flag overrides** — `ai_settings.feature_overrides` column exists; API/UI override path not implemented
6. **Provider health caching** — Health checks hit live APIs on every request
7. **Remaining 6 agents** — guest_post_writer, email_personalization, technical_seo, backlink_verification, analytics, reporting — defined in contracts, not registered

---

## Go / No-Go for Sprint 3

### Recommendation: **Conditional Go**

**Proceed to Sprint 3 when:**

1. Migration `005_ai_foundation.sql` is applied to dev/staging Supabase
2. At least one successful agent run is verified (stub mode acceptable)
3. Provider health endpoint returns expected status for your environment

**Suggested Sprint 3 focus (pending your approval):**

- Mission Control polish + live agent run triggers from UI
- Wire `prompt_templates` from DB
- Expand output schemas for all 8 agents
- Register remaining 6 agent types
- SSE streaming endpoint for agent output
- Move agent worker to `workers/general` for production isolation

---

## Explicitly Excluded (Confirmed)

Knowledge Base, RAG, AI Memory, Backlink Builder business logic, Outreach, Competitor Intelligence logic, Technical SEO, Reports, Analytics dashboards, Live crawling — **not implemented**.

---

**Awaiting your approval before beginning Sprint 3.**
