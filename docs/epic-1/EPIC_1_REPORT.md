# Epic 1 Report — Backlink Builder v1.0

**Epic goal:** Build the flagship backlink acquisition lifecycle module — Discovery → Qualification → AI Scoring → Approval → Campaign → Outreach → Verification → Won.  
**API version:** `1.0.0-epic1`  
**Date:** 2026-07-09  
**Status:** Complete — awaiting approval before Epic 2

---

## Executive Summary

Epic 1 elevates Backlink Builder from MVP (Sprint 5.5) to a **production-grade acquisition hub**. It delivers the full 9-stage pipeline, 34 backlink types, enterprise Explorer and Kanban UI, paginated REST APIs with bulk operations, AI draft generation (no delivery), relationship tracking, campaign associations, and an expanded Mission Control widget — without implementing email delivery, CRM inbox, follow-up automation, reports, analytics, or technical SEO.

| Deliverable                          | Status                                  |
| ------------------------------------ | --------------------------------------- |
| 1. Backlink Dashboard                | ✅                                      |
| 2. Opportunity Explorer              | ✅                                      |
| 3. Opportunity Details               | ✅                                      |
| 4. Opportunity Pipeline (DnD Kanban) | ✅                                      |
| 5. AI Recommendations                | ✅                                      |
| 6. Link Verification                 | ✅ (`/pending` + `/verification` alias) |
| 7. Won Links                         | ✅                                      |
| 8. Lost Links                        | ✅                                      |
| 9. Pending Links                     | ✅                                      |
| 10. Link Audit                       | ✅                                      |
| 11. Relationship Overview            | ✅                                      |
| 12. Campaign Association             | ✅                                      |
| Mission Control Backlink section     | ✅                                      |
| AI Workforce live progress           | ✅ (simulated)                          |
| Migration 010 applied                | ✅                                      |
| Build / Typecheck                    | ✅                                      |

**Epic completion score: 89/100**  
**Recommendation: Go — await explicit approval before Epic 2**

---

## 1. Architecture Summary

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                 apps/web                                      │
│  Dashboard │ Explorer (TanStack Table) │ Detail │ Pipeline (DnD Kanban)       │
│  AI Recs │ Relationships │ Campaigns │ Won │ Lost │ Pending/Verification     │
│  Link Audit │ Mission Control widget                                          │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ REST /v1/projects/:id/backlink-builder/*
┌───────────────────────────────▼──────────────────────────────────────────────┐
│                                 apps/api                                      │
│  backlink-builder.service — lifecycle, enrichment, bulk, AI drafts, verify    │
│  prospect.service — Epic 1 pipeline stages + transition guards                │
└───────────────┬─────────────────────────────┬────────────────────────────────┘
                │                             │
┌───────────────▼──────────────┐   ┌──────────▼──────────┐
│ @seo-os/backlink-builder     │   │ Sprint 5 modules    │
│ 34 types │ 9 stages │ AI     │   │ campaigns │ prospects│
│ scoring │ pagination │ verify │   │ intelligence        │
└───────────────┬──────────────┘   └─────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────────────────────┐
│ Supabase migrations 009 + 010                                                 │
│ opportunities (enriched) │ backlinks │ backlink_notes │ backlink_tags         │
│ backlink_history │ backlink_relationships │ backlink_ai_drafts                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Lifecycle flow:** Opportunities enter via AI Workforce / intelligence discovery → enriched and scored in `@seo-os/backlink-builder` → qualified and approved in Explorer → assigned to campaigns → moved through pipeline stages → won backlinks verified in Link Verification queue → reflected in audit and Mission Control metrics.

**Modularity:** Backlink types, pipeline stages, AI agents, and API filters are data-driven from the shared package. New types require only a package entry + optional DB seed row.

---

## 2. Database Changes

**Migration:** `supabase/migrations/010_epic1_backlink_builder.sql` (applied to cloud Supabase)

### `opportunities` — new columns

| Column                  | Type | Purpose                    |
| ----------------------- | ---- | -------------------------- |
| `pipeline_stage`        | TEXT | 9-stage lifecycle position |
| `website_name`          | TEXT | Display name               |
| `logo_url`              | TEXT | Favicon / logo             |
| `domain_rating`         | INT  | DR metric                  |
| `monthly_traffic`       | INT  | Traffic estimate           |
| `country`               | TEXT | Geo                        |
| `language`              | TEXT | Content language           |
| `spam_score`            | INT  | Risk signal                |
| `success_probability`   | INT  | AI success %               |
| `reply_rate_prediction` | INT  | AI reply %                 |
| `owner_id`              | UUID | Assignee                   |
| `suggested_anchor`      | TEXT | AI anchor suggestion       |
| `suggested_target_page` | TEXT | AI target URL              |
| `outreach_strategy`     | TEXT | AI strategy text           |

### New tables

| Table                      | Purpose                                  |
| -------------------------- | ---------------------------------------- |
| `backlink_notes`           | Unlimited notes per opportunity/prospect |
| `backlink_tags`            | Workspace-scoped tags                    |
| `backlink_tag_assignments` | Many-to-many opportunity ↔ tag           |
| `backlink_history`         | Audit trail / event log                  |
| `backlink_relationships`   | Publisher relationship CRM-lite          |
| `backlink_ai_drafts`       | Generated email, guest post, PR drafts   |

### Data migration

- `prospects.pipeline_status`: `outreach_ready` → `campaign_ready`
- 8 additional `backlink_types` seeded (34 total)

### Indexes & RLS

- Pipeline, owner, history, relationships, notes indexes
- RLS policies on all new tables via `can_access_workspace()`

---

## 3. APIs

Base path: `/v1/projects/:projectId/backlink-builder`

| Method | Path                                 | Purpose                                     |
| ------ | ------------------------------------ | ------------------------------------------- |
| GET    | `/summary`                           | Dashboard + Mission Control metrics         |
| GET    | `/types`                             | List 34 types (`?category=`)                |
| GET    | `/opportunities`                     | Explorer — filter, sort, search, pagination |
| GET    | `/opportunities/:id`                 | Detail + notes, history, drafts             |
| PATCH  | `/opportunities/:id/stage`           | Move pipeline stage                         |
| POST   | `/opportunities/bulk`                | Bulk approve / reject / move                |
| POST   | `/opportunities/enrich`              | Re-score all opportunities                  |
| POST   | `/opportunities/:id/add-to-campaign` | Campaign assignment                         |
| POST   | `/opportunities/:id/generate`        | AI draft generation                         |
| GET    | `/ai/suggestions`                    | Type + opportunity recommendations          |
| GET    | `/pipeline`                          | Kanban columns by stage                     |
| GET    | `/relationships`                     | Publisher relationships                     |
| GET    | `/campaigns/associations`            | Campaign ↔ opportunity map                  |
| GET    | `/won`                               | Won backlinks                               |
| GET    | `/lost`                              | Lost backlinks                              |
| GET    | `/pending`                           | Pending verification queue                  |
| GET    | `/audit`                             | Full link audit                             |
| PATCH  | `/backlinks/:id/verify`              | Mark verified / lost / unreachable          |

**Query params (Explorer):** `category`, `type`, `minScore`, `maxSpam`, `queueStatus`, `pipelineStage`, `verificationStatus`, `campaignId`, `search`, `sort`, `order`, `limit`, `cursor`

**Bulk body:** `{ opportunityIds: string[], action: 'approve'|'reject'|'move', stage?: PipelineStage }`

**Generate body:** `{ draftType: 'email'|'guest_post'|'press_release'|'outreach_strategy'|'website_summary' }`

---

## 4. New Components

| Component               | Path                                                      | Purpose                                      |
| ----------------------- | --------------------------------------------------------- | -------------------------------------------- |
| `OpportunityTable`      | `components/backlink-builder/opportunity-table.tsx`       | TanStack Table explorer with bulk select     |
| `PipelineBoard`         | `components/backlink-builder/pipeline-board.tsx`          | DnD Kanban (`@dnd-kit`)                      |
| `OpportunityLogo`       | `components/backlink-builder/opportunity-logo.tsx`        | Favicon display                              |
| `BacklinkBuilderWidget` | `components/backlink-builder/backlink-builder-widget.tsx` | Mission Control + nav + hero                 |
| `types.ts`              | `components/backlink-builder/types.ts`                    | Epic 1 UI types, pipeline stages, formatters |

---

## 5. New Screens

| #   | Screen                | Route                                        | Status |
| --- | --------------------- | -------------------------------------------- | ------ |
| 1   | Backlink Dashboard    | `/backlink-builder`                          | ✅     |
| 2   | Opportunity Explorer  | `/backlink-builder/explorer`                 | ✅     |
| 3   | Opportunity Details   | `/backlink-builder/opportunities/:id`        | ✅     |
| 4   | Opportunity Pipeline  | `/backlink-builder/pipeline`                 | ✅     |
| 5   | AI Recommendations    | `/backlink-builder/recommendations`          | ✅     |
| 6   | Link Verification     | `/backlink-builder/pending`, `/verification` | ✅     |
| 7   | Won Links             | `/backlink-builder/won`                      | ✅     |
| 8   | Lost Links            | `/backlink-builder/lost`                     | ✅     |
| 9   | Pending Links         | `/backlink-builder/pending`                  | ✅     |
| 10  | Link Audit            | `/backlink-builder/audit`                    | ✅     |
| 11  | Relationship Overview | `/backlink-builder/relationships`            | ✅     |
| 12  | Campaign Association  | `/backlink-builder/campaigns`                | ✅     |

---

## 6. AI Agents Used

All 8 Epic 1 workforce agents are defined in `@seo-os/backlink-builder` and surfaced in AI Recommendations + Mission Control:

| Agent              | Role                      | Epic 1 participation                            |
| ------------------ | ------------------------- | ----------------------------------------------- |
| SEO Strategist     | Strategy & prioritization | Type recommendations, dashboard insights        |
| Research Manager   | Discovery & qualification | Explorer enrichment, website summary            |
| Opportunity Scorer | Scoring & probability     | DR, spam, success %, reply rate                 |
| Guest Post Writer  | Content generation        | Guest post draft API                            |
| PR Agent           | Press & digital PR        | Press release draft API                         |
| QA Agent           | Output review             | Draft status workflow (draft/approved/rejected) |
| Campaign Planner   | Campaign association      | Campaign assign + associations view             |
| Verification Agent | Link verification         | Pending queue + verify PATCH                    |

**AI capabilities implemented (generation only, no delivery):**

- Recommend best opportunities
- Predict reply rate
- Estimate success probability
- Suggest anchor text & target pages
- Recommend backlink type
- Suggest outreach strategy
- Generate guest post, press release, email
- Summarize website

---

## 7. Mission Control Changes

`BacklinkBuilderWidget` on Mission Control now displays:

- Total Opportunities
- Qualified / Campaign Ready / Outreach Running
- Won / Lost / Verified / Pending
- Average DR
- Success Rate
- Active Campaigns
- AI Activity panel (8 agents with live progress animation)
- Quick nav to Explorer, Pipeline, AI Recs, Verification

Data source: `GET /v1/projects/:id/mission-control/summary` → `backlinkBuilder` from `getBacklinkDashboard()`.

---

## 8. Risks

| Risk                                                         | Severity | Mitigation                                                   |
| ------------------------------------------------------------ | -------- | ------------------------------------------------------------ |
| DR/traffic metrics are heuristic, not live Ahrefs/Moz        | Medium   | Label as estimates; integrate data providers in Epic 2+      |
| AI drafts are template-based, not LLM-backed                 | Medium   | Wire to AI Workforce orchestration when agent infra matures  |
| Large opportunity lists (500+ cap in pipeline API)           | Low      | Cursor pagination on Explorer; pipeline pagination in Epic 2 |
| Dual pipeline (prospects vs opportunities) may confuse users | Medium   | Consolidate to single source of truth in Epic 2              |
| No keyboard shortcuts yet                                    | Low      | Add in polish sprint                                         |
| Bundle size warning (>500 kB)                                | Low      | Code-split backlink-builder routes                           |

---

## 9. Technical Debt

1. **Keyboard shortcuts** — Spec requested Linear-style shortcuts; not implemented in Epic 1.
2. **Tags UI** — `backlink_tags` tables exist; no tag management UI yet.
3. **Notes UI** — Notes API-ready in detail response; no add-note form.
4. **Owner assignment** — `owner_id` column exists; no assignee picker in Explorer.
5. **Real external metrics** — DR/traffic/spam derived from heuristics in `enrichOpportunityRow`.
6. **Prospect vs opportunity pipeline** — Two kanban views (`/prospects/pipeline` and `/backlink-builder/pipeline`).
7. **AI agent progress** — Simulated percentages, not tied to worker queue.
8. **`buildPaginationMeta` typing** — Requires cast for enriched opportunity rows in pipeline grouping.

---

## 10. Epic Completion Score

| Category                    | Weight | Score      | Notes                                     |
| --------------------------- | ------ | ---------- | ----------------------------------------- |
| Lifecycle & pipeline        | 20%    | 95         | 9 stages, transitions, DnD, bulk          |
| Explorer & detail UX        | 20%    | 90         | Table, filters, enrichment, AI actions    |
| API completeness            | 15%    | 92         | Pagination, bulk, generate, relationships |
| Database & schema           | 15%    | 95         | Migration 010 applied, RLS, indexes       |
| AI features                 | 15%    | 80         | All draft types; template not LLM         |
| Mission Control & workforce | 10%    | 88         | Widget + agents; simulated progress       |
| Polish (shortcuts, perf)    | 5%     | 60         | No keyboard shortcuts                     |
| **Weighted total**          |        | **89/100** |                                           |

---

## 11. Go / No-Go for Epic 2

### Recommendation: **GO** (with approval gate)

Epic 1 delivers a cohesive, demo-ready, production-architected Backlink Builder that fulfills the core acquisition lifecycle. The module is modular, API-complete for v1 scope, and integrated with Mission Control and the AI Workforce narrative.

**Proceed to Epic 2 when:**

1. Stakeholder approves Epic 1 deliverables
2. Priority is confirmed for Epic 2 scope (likely: email delivery, CRM inbox, or analytics — per product roadmap)

**Do not start Epic 2 automatically.** Await explicit approval.

---

## Out of Scope (Confirmed Not Built)

- Email delivery
- CRM inbox
- Follow-up automation
- Reports
- Analytics dashboards
- Technical SEO

---

## Verification Checklist

```bash
# Build
npx turbo run build --filter=@seo-os/backlink-builder --filter=@seo-os/api --filter=@seo-os/web

# Dev
npx turbo run dev --concurrency=15 --filter=@seo-os/web --filter=@seo-os/api

# Web: http://localhost:5173
# API: http://localhost:3001
# Demo Mode: full Backlink Builder walkthrough without live data
```

---

_Epic 1 complete. Awaiting approval before Epic 2._
